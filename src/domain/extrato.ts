import { WALLET_MOVE_LABEL, type WalletMove, type WalletMoveKind } from '../db/types'
import { chronological, flowsOf, type WalletEvent, type WalletExpense, type WalletSettlement } from './saldoCarteira'

/** Uma linha do extrato de uma carteira, numa moeda. */
export interface StatementLine {
  key: string
  date: string
  kind: WalletMoveKind | 'gasto' | 'acerto'
  /** Descrição do gasto, ou a observação do movimento ou do acerto (pode ser vazia). */
  note: string
  /** A outra carteira da transferência ou do acerto entre carteiras. */
  otherWalletId?: string
  /** Na conversão: a outra moeda (a que saiu, na linha de entrada; a que entrou, na linha de saída). */
  otherCurrency?: string
  currency: string
  /** Unidades que entraram (+) ou saíram (−) desta carteira nesta moeda. */
  units: number
  /** Em reais: o que a carga custou; nas saídas, o custo médio do que saiu; nas entradas, o custo que veio junto. */
  brl: number
  /** Saldo desta moeda na carteira logo depois desta linha. */
  balance: number
  event: WalletEvent
}

/**
 * Extrato de uma carteira: todos os movimentos que mexeram nela (cargas, gastos, conversões, transferências, ajustes,
 * vendas da sobra e acertos), na mesma ordem do custo médio (data; no mesmo dia, entradas antes das saídas), com o
 * saldo corrido de cada moeda. Uma conversão vira duas linhas (a moeda que sai e a que entra).
 */
export function walletStatement(
  walletId: string,
  moves: WalletMove[],
  spends: (WalletExpense & { description?: string })[],
  settlements: (WalletSettlement & { note?: string })[],
  costs: { expenseCosts: ReadonlyMap<string, number>; moveCosts: ReadonlyMap<string, number>; settlementCosts: ReadonlyMap<string, number> },
): StatementLine[] {
  const balance = new Map<string, number>()
  const lines: StatementLine[] = []
  for (const event of chronological(moves, spends, settlements)) {
    const flows = flowsOf(event).filter((f) => f.walletId === walletId)
    for (const [i, flow] of flows.entries()) {
      const after = (balance.get(flow.currency) ?? 0) + flow.units
      balance.set(flow.currency, after)
      const base = { key: '', date: '', currency: flow.currency, units: flow.units, balance: after, event }
      if (event.type === 'expense') {
        const e = event.expense as WalletExpense & { description?: string }
        lines.push({ ...base, key: `g:${e.id}`, date: e.date, kind: 'gasto', note: e.description ?? '', brl: costs.expenseCosts.get(e.id) ?? 0 })
      } else if (event.type === 'settlement') {
        const s = event.settlement as WalletSettlement & { note?: string }
        const other = flow.units < 0 ? s.toWalletId : s.fromWalletId
        lines.push({
          ...base, key: `a:${s.id}:${i}`, date: s.date, kind: 'acerto', note: s.note ?? '',
          otherWalletId: other ?? undefined, brl: costs.settlementCosts.get(s.id) ?? 0,
        })
      } else {
        const m = event.move
        lines.push({
          ...base, key: `m:${m.id}:${i}`, date: m.date, kind: m.kind, note: m.note,
          otherWalletId: m.kind === 'transferencia' ? (flow.units < 0 ? m.toWalletId : m.walletId) : undefined,
          otherCurrency: m.kind === 'conversao' ? (flow.units < 0 ? m.toCurrency : m.currency) : undefined,
          brl: costs.moveCosts.get(m.id) ?? 0,
        })
      }
    }
  }
  return lines
}

/** Saldo de cada moeda antes de uma data (para abrir o extrato de um período). */
export function balancesBefore(lines: StatementLine[], date: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of lines) if (l.date < date) out.set(l.currency, l.balance)
  return out
}

/** Nome da linha no extrato, ex.: "Carga", "Gasto · Lanche", "Conversão para EUR", "Transferência para Nomad". */
export function statementTitle(line: StatementLine, walletName: (id: string) => string): string {
  const note = line.note.trim()
  const withNote = (label: string) => (note ? `${label} · ${note}` : label)
  const other = line.otherWalletId ? walletName(line.otherWalletId) : ''
  switch (line.kind) {
    case 'gasto':
      return note || 'Gasto'
    case 'acerto':
      return withNote(`Acerto ${line.units > 0 ? 'recebido' : 'pago'}${other ? (line.units > 0 ? ` de ${other}` : ` para ${other}`) : ''}`)
    case 'conversao':
      return withNote(line.units < 0 ? `Conversão para ${line.otherCurrency ?? ''}` : `Conversão de ${line.otherCurrency ?? ''}`)
    case 'transferencia':
      return withNote(line.units < 0 ? `Transferência para ${other}` : `Transferência de ${other}`)
    default:
      return withNote(WALLET_MOVE_LABEL[line.kind])
  }
}
