import type { Expense, Settlement, WalletMove } from '../db/types'

/**
 * Saída de carteira num gasto: a parte que uma pessoa pagou com a carteira (`methodId` = a carteira). O `id` é
 * `spendId(gasto, pessoa)` (despesa.ts), porque cada pagador pode usar uma carteira diferente.
 */
export type WalletExpense = Pick<Expense, 'id' | 'date' | 'createdAt' | 'methodId' | 'currency' | 'amount'>

/** Acerto pago na moeda da dívida, com a carteira de onde saiu e/ou para onde foi controlada. */
export type WalletSettlement = Pick<Settlement, 'id' | 'date' | 'createdAt' | 'currency' | 'amount' | 'fromWalletId' | 'toWalletId'>

/** Um passo na história das carteiras. */
export type WalletEvent =
  | { type: 'move'; move: WalletMove }
  | { type: 'expense'; expense: WalletExpense }
  | { type: 'settlement'; settlement: WalletSettlement }

const when = (e: WalletEvent) => (e.type === 'move' ? e.move : e.type === 'expense' ? e.expense : e.settlement)

/**
 * Movimentos, gastos e acertos pelas carteiras em ordem cronológica: data, depois o momento do cadastro.
 * Recebe só as saídas de gastos pagas por carteiras; acertos sem carteira controlada ficam de fora.
 */
export function chronological(moves: WalletMove[], expenses: WalletExpense[], settlements: WalletSettlement[] = []): WalletEvent[] {
  const events: WalletEvent[] = [
    ...moves.map((move) => ({ type: 'move' as const, move })),
    ...expenses.map((expense) => ({ type: 'expense' as const, expense })),
    ...settlements.filter((s) => s.fromWalletId || s.toWalletId).map((settlement) => ({ type: 'settlement' as const, settlement })),
  ]
  return events.sort((a, b) => when(a).date.localeCompare(when(b).date) || when(a).createdAt.localeCompare(when(b).createdAt))
}

/** Unidades que entram (positivo) ou saem (negativo) de uma moeda numa carteira. Saídas vêm antes. */
export interface Flow {
  walletId: string
  currency: string
  units: number
}

export function flowsOf(event: WalletEvent): Flow[] {
  if (event.type === 'expense') {
    const e = event.expense
    return [{ walletId: e.methodId, currency: e.currency, units: -e.amount }]
  }
  if (event.type === 'settlement') {
    const s = event.settlement
    const flows: Flow[] = []
    if (s.fromWalletId) flows.push({ walletId: s.fromWalletId, currency: s.currency, units: -s.amount })
    if (s.toWalletId) flows.push({ walletId: s.toWalletId, currency: s.currency, units: s.amount })
    return flows
  }
  const m = event.move
  switch (m.kind) {
    case 'carga':
    case 'ajuste':
      return [{ walletId: m.walletId, currency: m.currency, units: m.amount }]
    case 'venda':
      return [{ walletId: m.walletId, currency: m.currency, units: -m.amount }]
    case 'conversao':
      return [
        { walletId: m.walletId, currency: m.currency, units: -m.amount },
        { walletId: m.walletId, currency: m.toCurrency ?? '', units: m.toAmount ?? 0 },
      ]
    case 'transferencia':
      return [
        { walletId: m.walletId, currency: m.currency, units: -(m.amount + (m.fee ?? 0)) },
        { walletId: m.toWalletId ?? '', currency: m.currency, units: m.amount },
      ]
  }
}

export const positionKey = (walletId: string, currency: string) => `${walletId}|${currency}`

export interface Balance {
  walletId: string
  currency: string
  /** Saldo atual, em centésimos da moeda. */
  units: number
  /**
   * Primeira data em que o saldo ficou abaixo de zero (gasto ou saída lançado antes da carga, ou carga
   * esquecida); null se nunca ficou. Enquanto negativo, o custo em reais das saídas não é confiável.
   */
  negativeOn: string | null
}

/** Saldo de cada carteira em cada moeda já movimentada. */
export function balances(moves: WalletMove[], expenses: WalletExpense[], settlements: WalletSettlement[] = []): Balance[] {
  const out = new Map<string, Balance>()
  for (const event of chronological(moves, expenses, settlements)) {
    for (const flow of flowsOf(event)) {
      const key = positionKey(flow.walletId, flow.currency)
      let b = out.get(key)
      if (!b) out.set(key, (b = { walletId: flow.walletId, currency: flow.currency, units: 0, negativeOn: null }))
      b.units += flow.units
      if (b.units < 0 && !b.negativeOn) b.negativeOn = when(event).date
    }
  }
  return [...out.values()]
}

/** Saldos que pedem atenção: negativos agora ou que ficaram negativos em algum momento. */
export const balanceWarnings = (list: Balance[]) => list.filter((b) => b.negativeOn !== null)
