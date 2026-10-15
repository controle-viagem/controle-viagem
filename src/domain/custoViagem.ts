import { ME, type Expense } from '../db/types'
import type { Position } from './custoMedio'
import { brlValue, isEstimate, isForeign, spendId, type WalletCosts } from './despesa'
import { paidBy, partOf, payersOf } from './rateio'

/** Cotação de referência de uma moeda (reais por unidade), ou null quando não há nenhuma. */
export type RateLookup = (currency: string) => number | null

/**
 * Cotação para pôr em reais o que outra pessoa pagou em moeda estrangeira (e sugerir no acerto e na calculadora):
 * o custo médio das minhas carteiras naquela moeda; sem carteira com saldo, a última cotação usada na viagem.
 */
export function referenceRates(
  walletByCurrency: Pick<Position, 'currency' | 'avg'>[],
  tripExpenses: Pick<Expense, 'currency' | 'rate' | 'date'>[],
): RateLookup {
  const lastRate = new Map<string, { date: string; rate: number }>()
  for (const e of tripExpenses) {
    if (!e.rate) continue
    const current = lastRate.get(e.currency)
    if (!current || e.date >= current.date) lastRate.set(e.currency, { date: e.date, rate: e.rate })
  }
  return (currency) => {
    if (currency === 'BRL') return 1
    return walletByCurrency.find((p) => p.currency === currency)?.avg ?? lastRate.get(currency)?.rate ?? null
  }
}

/**
 * Custo em reais do gasto inteiro, parte por parte de quem pagou: a minha pelo valor real (cartão, carteira ou reais);
 * a de outra pessoa pela carteira dela, quando é controlada (custo médio real); senão, em moeda estrangeira, pela
 * cotação de referência, o que torna o valor estimado.
 */
export function fullBRL(e: Expense, wallet: WalletCosts, rateFor: RateLookup): { brl: number; estimated: boolean } {
  let brl = 0
  let estimated = false
  const mine = paidBy(e, ME)
  if (mine > 0) {
    brl += brlValue(e, wallet)
    estimated = isEstimate(e, wallet)
  }
  for (const p of payersOf(e)) {
    if (p.personId === ME || p.amount <= 0) continue
    const fromWallet = wallet.get(spendId(e.id, p.personId))
    if (fromWallet !== undefined) brl += fromWallet
    else if (!isForeign(e)) brl += p.amount
    else {
      const rate = rateFor(e.currency)
      brl += rate ? Math.round(p.amount * rate) : 0
      estimated = true
    }
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
