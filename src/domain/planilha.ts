import { ME, type PaymentMethod } from '../db/types'
import { fullBRL, partBRL } from './custoViagem'
import { spendId } from './despesa'
import { partOf, payersOf } from './rateio'
import { buildReport, SECTIONS, type ReportConfig, type ReportInput } from './relatorio'
import { holderLabel, walletsOf } from './titular'
import { daysBetween } from './viagem'

/** Formato de cada coluna na planilha. */
export type ColumnFormat = 'texto' | 'data' | 'dinheiro' | 'cotacao' | 'percentual'

export interface SheetTable {
  name: string
  columns: { header: string; format: ColumnFormat; width: number }[]
  /** Datas como 'AAAA-MM-DD'; dinheiro em unidades (centavos ÷ 100); percentual como fração. */
  rows: (string | number | null)[][]
}

const units = (cents: number) => cents / 100
const col = (header: string, format: ColumnFormat = 'texto', width = 14) => ({ header, format, width })

const WALLET_KIND: Record<string, string> = {
  carga: 'Carga', conversao: 'Conversão', transferencia: 'Transferência', ajuste: 'Ajuste', venda: 'Venda da sobra',
}

/**
 * Monta as abas da planilha (Gastos, Acertos, Carteiras, Saldos, Resumo) com a mesma configuração da prestação de
 * contas: mesmas pessoas, mesmos gastos e a mesma regra de privacidade dos nomes. Só dados: a gravação do arquivo
 * fica em lib/planilha.ts.
 */
export function buildSpreadsheet(input: ReportInput, config: ReportConfig, methods: Map<string, PaymentMethod>): SheetTable[] {
  const report = buildReport(input, { ...config, sections: [...SECTIONS] })
  const chosen = new Set(report.config.personIds.length ? report.config.personIds : [ME])
  const personIds = [...chosen]
  const nameOf = new Map(input.travelers.map((p) => [p.id, p.name]))
  const realName = (id: string) => nameOf.get(id) ?? '—'
  const shown = (id: string) => (id === ME || chosen.has(id) || config.nomes === 'mostrar' ? realName(id) : null)
  const categoryName = (id: string | null) => (id ? (input.categories.get(id)?.name ?? '—') : '')
  const byId = new Map(input.expenses.map((e) => [e.id, e]))
  const expenses = report.included.map((x) => byId.get(x.id)!).filter(Boolean)

  const gastos: SheetTable = {
    name: 'Gastos',
    columns: [
      col('Data', 'data', 11), col('Descrição', 'texto', 28), col('Categoria', 'texto', 16), col('Subcategoria', 'texto', 16),
      col('Moeda', 'texto', 7), col('Valor', 'dinheiro', 12), col('Imposto local', 'dinheiro', 12), col('Gorjeta', 'dinheiro', 10),
      col('Quem pagou', 'texto', 22), col('Meio', 'texto', 18), col('Participantes', 'texto', 26),
      ...personIds.map((id) => col(`Parte de ${realName(id)}`, 'dinheiro', 14)),
      col('Valor em R$', 'dinheiro', 13), col('Parte em R$', 'dinheiro', 13), col('Estimado', 'texto', 9),
    ],
    rows: expenses.map((e) => {
      const payers = payersOf(e)
      const many = payers.length > 1
      const paidBy = [...new Set(payers.map((p) => {
        const name = shown(p.personId) ?? 'outro viajante'
        return many ? `${name} (${units(p.amount).toFixed(2).replace('.', ',')})` : name
      }))].join(', ')
      const meio = [...new Set(payers.filter((p) => shown(p.personId) && p.methodId).map((p) => methods.get(p.methodId!)?.name ?? ''))].filter(Boolean).join(', ')
      const participantIds = e.split?.shares.map((s) => s.personId) ?? [ME]
      const visible = participantIds.map(shown).filter((n): n is string => !!n)
      const hidden = participantIds.length - visible.length
      const full = fullBRL(e, input.walletCosts, input.rateFor)
      return [
        e.date, e.description, categoryName(e.categoryId), categoryName(e.subcategoryId), e.currency, units(e.amount),
        units(e.localTax ?? 0), units(e.tip ?? 0), paidBy, meio,
        [...visible, ...(hidden > 0 ? [`+${hidden} ${hidden === 1 ? 'pessoa' : 'pessoas'}`] : [])].join(', '),
        ...personIds.map((id) => units(partOf(e, [id]))),
        units(full.brl), units(partBRL(e, personIds, input.walletCosts, input.rateFor).brl), full.estimated ? 'sim' : 'não',
      ]
    }),
  }

  const acertos: SheetTable = {
    name: 'Acertos',
    columns: [
      col('Data', 'data', 11), col('De', 'texto', 16), col('Para', 'texto', 16), col('Moeda', 'texto', 7), col('Valor', 'dinheiro', 12),
      col('Pago em', 'texto', 9), col('Valor pago', 'dinheiro', 12), col('Cotação', 'cotacao', 10), col('Observação', 'texto', 24),
    ],
    rows: input.settlements
      .filter((s) => chosen.has(s.fromId) || chosen.has(s.toId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => [
        s.date, realName(s.fromId), realName(s.toId), s.currency, units(s.amount), s.paidCurrency ?? '',
        s.paidAmount !== undefined ? units(s.paidAmount) : null,
        s.paidAmount !== undefined && s.amount > 0 ? (s.rate ?? s.paidAmount / s.amount) : null, s.note,
      ]),
  }

  // Carteiras das pessoas escolhidas: cargas e movimentos até o fim da viagem (últimos seis meses) e as saídas dos
  // gastos desta viagem pagos por elas.
  const theirWallets = input.travelers.filter((p) => chosen.has(p.id)).flatMap((p) => walletsOf(p, input.wallets))
  const walletById = new Map(theirWallets.map((w) => [w.id, w]))
  const inWindow = (date: string) => date <= input.trip.endDate && daysBetween(date, input.trip.startDate) <= 180
  const walletRows: (string | number | null)[][] = []
  for (const m of input.moves) {
    const w = walletById.get(m.walletId) ?? (m.toWalletId ? walletById.get(m.toWalletId) : undefined)
    if (!w || !inWindow(m.date)) continue
    const brl = input.moveCosts.get(m.id) ?? m.brlAmount ?? 0
    const signedAmount = m.kind === 'carga' || (m.kind === 'ajuste' && m.amount > 0) ? m.amount : -Math.abs(m.amount)
    walletRows.push([m.date, w.name, holderLabel(w), WALLET_KIND[m.kind] ?? m.kind, m.currency, units(signedAmount), units(brl), m.amount ? brl / Math.abs(m.amount) : null, m.note])
  }
  for (const e of expenses) {
    for (const p of payersOf(e)) {
      const w = p.methodId ? walletById.get(p.methodId) : undefined
      if (!w || p.amount <= 0) continue
      const brl = input.walletCosts.get(spendId(e.id, p.personId)) ?? 0
      walletRows.push([e.date, w.name, holderLabel(w), 'Gasto', e.currency, units(-p.amount), units(brl), brl / p.amount, e.description])
    }
  }
  walletRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const carteiras: SheetTable = {
    name: 'Carteiras',
    columns: [
      col('Data', 'data', 11), col('Carteira', 'texto', 18), col('Titular', 'texto', 12), col('Tipo', 'texto', 14), col('Moeda', 'texto', 7),
      col('Valor', 'dinheiro', 12), col('Em R$', 'dinheiro', 12), col('Cotação efetiva', 'cotacao', 12), col('Descrição', 'texto', 24),
    ],
    rows: walletRows,
  }

  const saldos: SheetTable = {
    name: 'Saldos',
    columns: [col('Pessoa', 'texto', 22), col('Moeda', 'texto', 7), col('Saldo (+ recebe / − paga)', 'dinheiro', 22)],
    rows: (report.balances ?? []).flatMap((b) =>
      b.amounts.length ? b.amounts.map((a) => [b.name, a.currency, units(a.value)]) : [[b.name, '', 0]],
    ),
  }

  const resumo: SheetTable = {
    name: 'Resumo',
    columns: [col('Categoria', 'texto', 20), col('Subcategoria', 'texto', 20), col('Em R$', 'dinheiro', 13), col('%', 'percentual', 8)],
    rows: (report.categories ?? []).flatMap((c) => [
      [c.name, '', units(c.total), c.share],
      ...c.subs.filter((s) => c.subs.length > 1 || s.name !== 'Sem subcategoria').map((s) => [c.name, s.name, units(s.total), s.share * c.share]),
    ]),
  }

  return [gastos, acertos, carteiras, saldos, resumo]
}
