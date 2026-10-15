import { ME, type Expense, type PaymentMethod } from '../db/types'
import { iofInside } from './cambio'
import { paidBy } from './rateio'

type Mine = Pick<Expense, 'id' | 'currency' | 'amount' | 'payerId' | 'payers'>

export const isForeign = (e: Pick<Expense, 'currency'>) => e.currency !== 'BRL'

/**
 * Custo em reais de cada parte de gasto paga por carteira, pelo custo médio (`ledger().expenseCosts` em custoMedio.ts),
 * com a chave `spendId(gasto, pessoa)`. Nunca é digitado nem guardado: muda quando muda uma carga ou um gasto anterior.
 */
export type WalletCosts = ReadonlyMap<string, number>

/** Chave da saída de carteira de uma pessoa num gasto (cada pagador pode usar uma carteira diferente). */
export const spendId = (expenseId: string, personId: string) => `${expenseId}:${personId}`
const NO_WALLET: WalletCosts = new Map()

/**
 * Quanto me custou, em reais, **a parte que eu paguei** do gasto: pela carteira, o custo médio calculado; em reais,
 * o próprio valor; no cartão em reais, o valor estimado ou confirmado na fatura. Zero se não paguei nada.
 */
export function brlValue(e: Mine & Pick<Expense, 'brlAmount'>, wallet: WalletCosts = NO_WALLET): number {
  const mine = paidBy(e, ME)
  if (mine <= 0) return 0
  return wallet.get(spendId(e.id, ME)) ?? (isForeign(e) ? (e.brlAmount ?? 0) : mine)
}

/** Compra em outra moeda no cartão em reais (parte que eu paguei) ainda não conferida na fatura. Pela carteira, nunca. */
export const isEstimate = (e: Mine & Pick<Expense, 'brlConfirmed'>, wallet: WalletCosts = NO_WALLET) =>
  isForeign(e) && paidBy(e, ME) > 0 && !e.brlConfirmed && !wallet.has(spendId(e.id, ME))

/**
 * Custo do câmbio da parte que eu paguei de uma compra em outra moeda no cartão em reais, em centavos:
 * IOF (contido no valor em reais) e spread (o que passa da cotação informada, fora o IOF).
 * Sem cotação informada, o spread não é conhecido e fica zero.
 */
export function fxCost(e: Expense): { iof: number; spread: number } {
  if (!isForeign(e) || !e.brlAmount) return { iof: 0, spread: 0 }
  const iof = e.iofPct ? iofInside(e.brlAmount, e.iofPct) : 0
  const spread = e.rate ? Math.max(0, e.brlAmount - iof - Math.round(paidBy(e, ME) * e.rate)) : 0
  return { iof, spread }
}

export type ExpenseDraft = Pick<Expense, 'currency' | 'amount' | 'localTax' | 'tip' | 'categoryId' | 'brlAmount'>

/**
 * Problema que impede salvar o gasto, em linguagem do usuário; null quando está tudo certo.
 * Pago por outra pessoa (`paidByMe` falso), não há meio de pagamento nem câmbio a conferir.
 */
export function expenseError(d: ExpenseDraft, method: PaymentMethod | undefined, paidByMe = true): string | null {
  if (!(d.amount > 0)) return 'Informe o valor.'
  if (!d.categoryId) return 'Escolha a categoria.'
  if ((d.localTax ?? 0) + (d.tip ?? 0) > d.amount) return 'Imposto e gorjeta não podem passar do total pago.'
  if (!paidByMe) return null
  if (!method) return 'Escolha o meio de pagamento.'
  if (method.kind === 'carteira') {
    // O custo em reais sai do custo médio da carteira; nada a digitar.
    return isForeign(d) ? null : `"${method.name}" guarda moeda estrangeira. Para gastos em reais, use um meio "Em reais".`
  }
  if (!isForeign(d)) return null
  if (method.kind === 'brl') return `"${method.name}" só paga em reais. Escolha um cartão ou mude a moeda para BRL.`
  if (!(d.brlAmount && d.brlAmount > 0)) return 'Informe a cotação ou o valor cobrado em reais.'
  return null
}
