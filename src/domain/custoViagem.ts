import { ME, type Expense, type PaymentMethod, type Payer } from '../db/types'
import type { Position } from './custoMedio'
import { brlValue, isEstimate, isForeign, spendId, type WalletCosts } from './despesa'
import { partOf, payersOf } from './rateio'

/**
 * Cotação de referência de uma moeda (reais por unidade), ou null quando não há nenhuma. Com o meio de pagamento de
 * outra pessoa: se for um cartão em reais dela, já com o spread e o IOF do cadastro do cartão.
 */
export type RateLookup = (currency: string, methodId?: string) => number | null

type CardInfo = Pick<PaymentMethod, 'id' | 'kind' | 'spreadPct' | 'iofPct'>

/**
 * Cotação para pôr em reais o que outra pessoa pagou em moeda estrangeira (e sugerir no acerto e na calculadora):
 * o custo médio das minhas carteiras naquela moeda; sem carteira com saldo, a última cotação usada na viagem.
 * Pago com o cartão em reais da pessoa: essa cotação × (1 + spread) × (1 + IOF), como no meu cartão.
 */
export function referenceRates(
  walletByCurrency: Pick<Position, 'currency' | 'avg'>[],
  tripExpenses: Pick<Expense, 'currency' | 'rate' | 'date'>[],
  methods: CardInfo[] = [],
): RateLookup {
  const lastRate = new Map<string, { date: string; rate: number }>()
  for (const e of tripExpenses) {
    if (!e.rate) continue
    const current = lastRate.get(e.currency)
    if (!current || e.date >= current.date) lastRate.set(e.currency, { date: e.date, rate: e.rate })
  }
  const cards = new Map(methods.filter((m) => m.kind === 'cartao_brl').map((m) => [m.id, m]))
  return (currency, methodId) => {
    if (currency === 'BRL') return 1
    const rate = walletByCurrency.find((p) => p.currency === currency)?.avg ?? lastRate.get(currency)?.rate ?? null
    const card = methodId ? cards.get(methodId) : undefined
    return rate !== null && card ? rate * (1 + (card.spreadPct ?? 0) / 100) * (1 + (card.iofPct ?? 0) / 100) : rate
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
  const rate = rateFor(e.currency, p.methodId)
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
