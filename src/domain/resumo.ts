import { ME, type Expense, type Trip } from '../db/types'
import { fullBRL, type RateLookup } from './custoViagem'
import { fxCost, isForeign, type WalletCosts } from './despesa'
import { paidBy, partOf } from './rateio'
import { daysBetween, phaseOf, tripDays, type Phase } from './viagem'

export interface ShareRow {
  /** Id da categoria; nas subcategorias, '' = sem subcategoria. */
  id: string
  total: number
  /** Fração do total (0 a 1). */
  share: number
}

export interface CategoryRow extends ShareRow {
  subs: ShareRow[]
}

export interface TripSummary {
  /** Custo total em reais, incluindo os valores ainda estimados. */
  total: number
  estimated: { count: number; total: number }
  /** Gastos ainda a pagar (já incluídos no total, como previsto). */
  pending: { count: number; total: number }
  /** Quanto foi gasto em cada moeda, no valor original e quanto isso custou em reais. Reais primeiro. */
  byCurrency: { currency: string; amount: number; brl: number }[]
  byCategory: CategoryRow[]
  byPhase: Record<Phase, number>
  /** Dias da viagem com gasto, em ordem. */
  byDay: { date: string; total: number }[]
  /** Média por dia durante a viagem, até hoje (ou até o fim); null antes de começar. */
  perDay: number | null
  /**
   * Imposto local e gorjeta, por moeda (só as que tiveram algum), e quanto custaram em reais: a fração deles no
   * custo em reais de cada gasto (a cotação que o gasto usou, cartão ou custo médio).
   */
  extras: { currency: string; localTax: number; tip: number; localTaxBRL: number; tipBRL: number }[]
  /** Custo do câmbio nos cartões em reais. */
  fx: { iof: number; spread: number }
}

function rank<T extends ShareRow>(rows: T[], total: number): T[] {
  for (const row of rows) row.share = total > 0 ? row.total / total : 0
  return rows.sort((a, b) => b.total - a.total)
}

export interface SummaryOptions {
  /** De quem é o custo: a parte destas pessoas em cada gasto. Padrão: só "Eu". */
  personIds?: readonly string[]
  /** Cotação para gastos que outra pessoa pagou em moeda estrangeira (`referenceRates` de custoViagem.ts). */
  rateFor?: RateLookup
}

/**
 * Resumo do custo da viagem para uma pessoa (ou grupo): em cada gasto conta só a parte delas, em reais pelo custo
 * real do gasto. `wallet`: custo em reais dos gastos pagos por carteira (custo médio), calculado em custoMedio.ts.
 */
export function summarize(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  expenses: Expense[],
  today: string,
  wallet: WalletCosts = new Map(),
  { personIds = [ME], rateFor = () => null }: SummaryOptions = {},
): TripSummary {
  let total = 0
  const estimated = { count: 0, total: 0 }
  const pending = { count: 0, total: 0 }
  const currencies = new Map<string, { amount: number; brl: number }>()
  const categories = new Map<string, CategoryRow>()
  const byPhase: Record<Phase, number> = { antes: 0, durante: 0, depois: 0 }
  const days = new Map<string, number>()
  const extras = new Map<string, TripSummary['extras'][number]>()
  const fx = { iof: 0, spread: 0 }

  for (const e of expenses) {
    const part = partOf(e, personIds)
    if (part <= 0 || e.amount <= 0) continue
    // Fração do gasto que é de quem está sendo resumido; tudo abaixo é proporcional a ela.
    const fraction = part / e.amount
    const scale = (value: number) => Math.round(value * fraction)
    const full = fullBRL(e, wallet, rateFor)
    const brl = scale(full.brl)
    total += brl
    if (e.pending) {
      pending.count++
      pending.total += brl
    }
    if (full.estimated) {
      estimated.count++
      estimated.total += brl
    }
    const cur = currencies.get(e.currency) ?? { amount: 0, brl: 0 }
    currencies.set(e.currency, { amount: cur.amount + part, brl: cur.brl + brl })

    let row = categories.get(e.categoryId)
    if (!row) categories.set(e.categoryId, (row = { id: e.categoryId, total: 0, share: 0, subs: [] }))
    row.total += brl
    const subId = e.subcategoryId ?? ''
    let sub = row.subs.find((s) => s.id === subId)
    if (!sub) row.subs.push((sub = { id: subId, total: 0, share: 0 }))
    sub.total += brl

    const phase = phaseOf(e.date, trip)
    byPhase[phase] += brl
    if (phase === 'durante') days.set(e.date, (days.get(e.date) ?? 0) + brl)

    if (e.localTax || e.tip) {
      let x = extras.get(e.currency)
      if (!x) extras.set(e.currency, (x = { currency: e.currency, localTax: 0, tip: 0, localTaxBRL: 0, tipBRL: 0 }))
      x.localTax += scale(e.localTax ?? 0)
      x.tip += scale(e.tip ?? 0)
      x.localTaxBRL += Math.round((brl * (e.localTax ?? 0)) / e.amount)
      x.tipBRL += Math.round((brl * (e.tip ?? 0)) / e.amount)
    }
    if (isForeign(e) && paidBy(e, ME) > 0) {
      const cost = fxCost(e)
      fx.iof += scale(cost.iof)
      fx.spread += scale(cost.spread)
    }
  }

  const byCategory = rank([...categories.values()], total)
  for (const row of byCategory) rank(row.subs, row.total)

  const elapsed = today < trip.startDate ? 0 : Math.min(daysBetween(trip.startDate, today) + 1, tripDays(trip))

  return {
    total,
    estimated,
    pending,
    byCurrency: [...currencies]
      .map(([currency, v]) => ({ currency, amount: v.amount, brl: v.brl }))
      .sort((a, b) => (a.currency === 'BRL' ? -1 : b.currency === 'BRL' ? 1 : a.currency.localeCompare(b.currency))),
    byCategory,
    byPhase,
    byDay: [...days].map(([date, t]) => ({ date, total: t })).sort((a, b) => a.date.localeCompare(b.date)),
    perDay: elapsed > 0 ? Math.round(byPhase.durante / elapsed) : null,
    extras: [...extras.values()],
    fx,
  }
}
