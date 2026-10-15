import { describe, expect, it } from 'vitest'
import type { Expense, PaymentMethod } from '../db/types'
import { brlValue, expenseError, fxCost, isEstimate, spendId } from './despesa'

const base = { id: 'm', createdAt: '', updatedAt: '', archived: false }
const pix: PaymentMethod = { ...base, name: 'Pix', kind: 'brl' }
const card: PaymentMethod = { ...base, name: 'Visa', kind: 'cartao_brl', iofPct: 3.5, spreadPct: 4 }
const wise: PaymentMethod = { ...base, name: 'Wise', kind: 'carteira', walletType: 'multimoeda' }

const expense = (extra: Partial<Expense>): Expense => ({
  id: 'e', createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-20', description: '', categoryId: 'c',
  subcategoryId: null, methodId: 'm', currency: 'BRL', amount: 10000, ...extra,
})

describe('gasto', () => {
  it('valor em reais', () => {
    expect(brlValue(expense({}))).toBe(10000)
    expect(brlValue(expense({ currency: 'USD', brlAmount: 59202 }))).toBe(59202)
    expect(brlValue(expense({ currency: 'USD' }))).toBe(0)
  })

  it('pela carteira, vale o custo médio calculado e nunca é estimado', () => {
    const e = expense({ currency: 'USD', amount: 10000 })
    const wallet = new Map([[spendId(e.id, 'eu'), 57500]])
    expect(brlValue(e, wallet)).toBe(57500)
    expect(isEstimate(e, wallet)).toBe(false)
    expect(fxCost(e)).toEqual({ iof: 0, spread: 0 })
  })

  it('estimado até conferir na fatura', () => {
    expect(isEstimate(expense({}))).toBe(false)
    expect(isEstimate(expense({ currency: 'USD', brlAmount: 59202 }))).toBe(true)
    expect(isEstimate(expense({ currency: 'USD', brlAmount: 59202, brlConfirmed: true }))).toBe(false)
  })

  it('custo do câmbio: IOF e spread de US$ 100 a 5,50 que viraram R$ 592,02', () => {
    const e = expense({ currency: 'USD', rate: 5.5, iofPct: 3.5, brlAmount: 59202 })
    expect(fxCost(e)).toEqual({ iof: 2002, spread: 2200 })
  })

  it('sem cotação, só o IOF é conhecido', () => {
    expect(fxCost(expense({ currency: 'USD', iofPct: 3.5, brlAmount: 59202 }))).toEqual({ iof: 2002, spread: 0 })
    expect(fxCost(expense({}))).toEqual({ iof: 0, spread: 0 })
  })

  it('valida o que impede salvar', () => {
    const ok = { currency: 'BRL', amount: 5000, categoryId: 'c' }
    expect(expenseError(ok, pix)).toBeNull()
    expect(expenseError({ ...ok, amount: 0 }, pix)).toMatch(/valor/)
    expect(expenseError({ ...ok, categoryId: '' }, pix)).toMatch(/categoria/)
    expect(expenseError(ok, undefined)).toMatch(/meio de pagamento/)
    expect(expenseError({ ...ok, localTax: 3000, tip: 2500 }, pix)).toMatch(/gorjeta/)
    expect(expenseError({ ...ok, currency: 'USD' }, pix)).toMatch(/só paga em reais/)
    expect(expenseError({ ...ok, currency: 'USD' }, card)).toMatch(/cotação/)
    expect(expenseError({ ...ok, currency: 'USD', brlAmount: 30000 }, card)).toBeNull()
    // Pela carteira não se digita valor em reais; em reais, a carteira não paga.
    expect(expenseError({ ...ok, currency: 'USD' }, wise)).toBeNull()
    expect(expenseError(ok, wise)).toMatch(/moeda estrangeira/)
  })
})
