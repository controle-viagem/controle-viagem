import { ME, type Expense, type PaymentMethod, type Payer } from '../db/types'
import { positiveByCurrency, type Position } from './custoMedio'
import { brlValue, isEstimate, isForeign, spendId, type WalletCosts } from './despesa'
import { partOf, payersOf } from './rateio'
import { walletsOf } from './titular'

/**
 * Cotação de referência de uma moeda (reais por unidade), ou null quando não há nenhuma. `personId` = quem pagou
 * (pessoa ou grupo; ausente = "Eu"); `methodId` = o meio que ela usou (cartão em reais leva spread e IOF).
 */
export type RateLookup = (currency: string, opts?: { personId?: string; methodId?: string }) => number | null

/**
 * Cotação para pôr em reais o que um viajante pagou em moeda estrangeira (e sugerir no acerto), decisão do dono:
 * - o **médio das carteiras daquele viajante** (do grupo, se for um grupo) com saldo positivo naquela moeda;
 *   sem nenhuma, a última cotação usada na viagem;
 * - pago com o **cartão em reais** dele: a cotação do dia (a última da viagem; sem ela, o médio dele) × (1 + spread)
 *   × (1 + IOF) do cartão, porque o cartão cobra pela cotação do dia, não pelo dinheiro já carregado.
 */
export function referenceRates(
  positions: Position[],
  tripExpenses: Pick<Expense, 'currency' | 'rate' | 'date'>[],
  methods: Pick<PaymentMethod, 'id' | 'kind' | 'holderName' | 'spreadPct' | 'iofPct'>[] = [],
  people: { id: string; name: string }[] = [],
  groups: { id: string; memberIds: string[] }[] = [],
): RateLookup {
  const lastRate = new Map<string, { date: string; rate: number }>()
  for (const e of tripExpenses) {
    if (!e.rate) continue
    const current = lastRate.get(e.currency)
    if (!current || e.date >= current.date) lastRate.set(e.currency, { date: e.date, rate: e.rate })
  }
  const cards = new Map(methods.filter((m) => m.kind === 'cartao_brl').map((m) => [m.id, m]))
  const wallets = methods.filter((m) => m.kind === 'carteira')
  /** Médio, só com saldos positivos, das carteiras das pessoas (os membros, se for um grupo). */
  function averageOf(personId: string, currency: string): number | null {
    const memberIds = groups.find((g) => g.id === personId)?.memberIds ?? [personId]
    const ids = new Set(
      memberIds.flatMap((id) => {
        const person = people.find((p) => p.id === id) ?? (id === ME ? { id: ME, name: '' } : undefined)
        return person ? walletsOf(person, wallets).map((w) => w.id) : []
      }),
    )
    return positiveByCurrency(positions.filter((p) => ids.has(p.walletId) && p.currency === currency))[0]?.avg ?? null
  }
  return (currency, { personId = ME, methodId } = {}) => {
    if (currency === 'BRL') return 1
    const last = lastRate.get(currency)?.rate ?? null
    const card = methodId ? cards.get(methodId) : undefined
    if (!card) return averageOf(personId, currency) ?? last
    const base = last ?? averageOf(personId, currency)
    return base === null ? null : base * (1 + (card.spreadPct ?? 0) / 100) * (1 + (card.iofPct ?? 0) / 100)
  }
}

/**
 * Custo em reais do que um pagador pagou do gasto: o meu pelo valor real (cartão, carteira ou reais); o de outra
 * pessoa pela carteira dela, quando é controlada (custo médio real); senão, em moeda estrangeira, pela cotação de
 * referência (com spread e IOF, se foi no cartão em reais dela), o que torna o valor estimado.
 */
export function payerBRL(e: Expense, p: Payer, wallet: WalletCosts, rateFor: RateLookup): { brl: number; estimated: boolean } {
  if (p.amount <= 0) return { brl: 0, estimated: false }
  if (p.personId === ME) return { brl: brlValue(e, wallet), estimated: isEstimate(e, wallet) }
  const fromWallet = wallet.get(spendId(e.id, p.personId))
  if (fromWallet !== undefined) return { brl: fromWallet, estimated: false }
  if (!isForeign(e)) return { brl: p.amount, estimated: false }
  const rate = rateFor(e.currency, { personId: p.personId, methodId: p.methodId })
  return { brl: rate ? Math.round(p.amount * rate) : 0, estimated: true }
}

/** Custo em reais do gasto inteiro, somando o de cada pagador (`payerBRL`). */
export function fullBRL(e: Expense, wallet: WalletCosts, rateFor: RateLookup): { brl: number; estimated: boolean } {
  let brl = 0
  let estimated = false
  for (const p of payersOf(e)) {
    const one = payerBRL(e, p, wallet, rateFor)
    brl += one.brl
    estimated ||= one.estimated
  }
  return { brl, estimated }
}

/** A parte das pessoas indicadas no gasto: na moeda do gasto e em reais (proporcional ao custo do gasto inteiro). */
export function partBRL(e: Expense, personIds: readonly string[], wallet: WalletCosts, rateFor: RateLookup) {
  const part = partOf(e, personIds)
  const full = fullBRL(e, wallet, rateFor)
  const brl = e.amount > 0 ? Math.round((full.brl * part) / e.amount) : 0
  return { part, brl, estimated: full.estimated && part > 0 }
}

/** Uma linha do resumo por meio de pagamento: quanto uma pessoa pagou com um meio (ou sem meio controlado). */
export interface MethodTotal {
  personId: string
  /** Ausente = outro meio, sem controle. */
  methodId?: string
  /** Custo em reais do que foi pago. */
  brl: number
  estimated: boolean
  count: number
}

/**
 * Quanto cada pessoa escolhida pagou, por meio de pagamento, em reais. Gastos ainda a pagar ficam de fora (ninguém
 * pagou ainda). Do maior para o menor.
 */
export function totalsByMethod(expenses: Expense[], personIds: readonly string[], wallet: WalletCosts, rateFor: RateLookup): MethodTotal[] {
  const chosen = new Set(personIds)
  const rows = new Map<string, MethodTotal>()
  for (const e of expenses) {
    if (e.pending) continue
    for (const p of payersOf(e)) {
      if (!chosen.has(p.personId) || p.amount <= 0) continue
      const key = `${p.personId}:${p.methodId ?? ''}`
      const row = rows.get(key) ?? { personId: p.personId, methodId: p.methodId, brl: 0, estimated: false, count: 0 }
      const one = payerBRL(e, p, wallet, rateFor)
      row.brl += one.brl
      row.estimated ||= one.estimated
      row.count++
      rows.set(key, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.brl - a.brl)
}
