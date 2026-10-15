import { describe, expect, it } from 'vitest'
import type { Expense, PaymentMethod } from '../db/types'
import { fullBRL, referenceRates, totalsByMethod } from './custoViagem'
import { spendId } from './despesa'

const card = { id: 'itau-ana', kind: 'cartao_brl', spreadPct: 4, iofPct: 3.5 } as PaymentMethod
const rateFor = referenceRates([{ currency: 'USD', avg: 5 }], [], [card])
const expense = (extra: Partial<Expense>): Expense => ({
  id: 'e1', createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: '', categoryId: 'c', subcategoryId: null,
  methodId: '', currency: 'USD', amount: 10000, ...extra,
})

describe('custo em reais por pagador', () => {
  it('cartão em reais de outra pessoa: cotação de referência com spread e IOF do cartão, estimado', () => {
    expect(rateFor('USD', 'itau-ana')).toBeCloseTo(5 * 1.04 * 1.035)
    // US$ 100 × 5 × 1,04 × 1,035 = R$ 538,20
    expect(fullBRL(expense({ payerId: 'ana', methodId: 'itau-ana' }), new Map(), rateFor)).toEqual({ brl: 53820, estimated: true })
    // Outro meio, sem controle: só a cotação de referência.
    expect(fullBRL(expense({ payerId: 'ana' }), new Map(), rateFor)).toEqual({ brl: 50000, estimated: true })
  })

  it('em reais, o cartão dela não muda nada', () => {
    expect(fullBRL(expense({ payerId: 'ana', methodId: 'itau-ana', currency: 'BRL' }), new Map(), rateFor)).toEqual({ brl: 10000, estimated: false })
  })

  it('soma por meio de pagamento das pessoas escolhidas, sem os gastos a pagar', () => {
    const expenses = [
      expense({ id: 'a', payers: [{ personId: 'eu', amount: 6000 }, { personId: 'ana', amount: 4000, methodId: 'itau-ana' }], methodId: 'wise', brlAmount: 0 }),
      expense({ id: 'b', payerId: 'ana', methodId: 'itau-ana' }),
      expense({ id: 'c', payerId: 'ana' }),
      expense({ id: 'd', payerId: 'ana', methodId: 'itau-ana', pending: true }),
    ]
    const wallet = new Map([[spendId('a', 'eu'), 33000]])
    const rows = totalsByMethod(expenses, ['ana'], wallet, rateFor)
    expect(rows).toEqual([
      { personId: 'ana', methodId: 'itau-ana', brl: 21528 + 53820, estimated: true, count: 2 },
      { personId: 'ana', methodId: undefined, brl: 50000, estimated: true, count: 1 },
    ])
    expect(totalsByMethod(expenses, ['eu'], wallet, rateFor)).toEqual([{ personId: 'eu', methodId: 'wise', brl: 33000, estimated: false, count: 1 }])
  })
})
