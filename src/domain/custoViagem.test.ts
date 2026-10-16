import { describe, expect, it } from 'vitest'
import type { Expense, PaymentMethod } from '../db/types'
import { fullBRL, referenceRates, totalsByMethod } from './custoViagem'
import { spendId } from './despesa'

const card = { id: 'itau-ana', kind: 'cartao_brl', spreadPct: 4, iofPct: 3.5 } as PaymentMethod
// Ana sem carteira: a referência é a última cotação da viagem (5).
const rateFor = referenceRates([], [{ currency: 'USD', rate: 5, date: '2026-12-01' }], [card], [{ id: 'ana', name: 'Ana' }])
const expense = (extra: Partial<Expense>): Expense => ({
  id: 'e1', createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: '', categoryId: 'c', subcategoryId: null,
  methodId: '', currency: 'USD', amount: 10000, ...extra,
})

describe('cotação de referência por viajante', () => {
  const methods = [
    { id: 'wise', kind: 'carteira' },
    { id: 'revolut', kind: 'carteira' },
    { id: 'nomad-ana', kind: 'carteira', holderName: 'Ana' },
  ] as PaymentMethod[]
  const positions = [
    { walletId: 'wise', currency: 'USD', units: 10000, cost: 57500, avg: 5.75 },
    // Revolut sem carga, com um gasto: negativa, fica de fora.
    { walletId: 'revolut', currency: 'USD', units: -3000, cost: 0, avg: null },
    { walletId: 'nomad-ana', currency: 'USD', units: 20000, cost: 110000, avg: 5.5 },
  ]
  const people = [{ id: 'eu', name: 'Eu' }, { id: 'ana', name: 'Ana' }, { id: 'leo', name: 'Léo' }]
  const lookup = referenceRates(positions, [{ currency: 'USD', rate: 5.2, date: '2026-12-01' }], methods, people, [{ id: 'casal', memberIds: ['ana', 'leo'] }])

  it('médio das carteiras de quem pagou, só com saldo positivo; sem carteira, a última cotação da viagem', () => {
    expect(lookup('USD')).toBe(5.75)
    expect(lookup('USD', { personId: 'ana' })).toBe(5.5)
    expect(lookup('USD', { personId: 'leo' })).toBe(5.2)
    // Grupo: as carteiras dos membros.
    expect(lookup('USD', { personId: 'casal' })).toBe(5.5)
    expect(lookup('EUR', { personId: 'ana' })).toBeNull()
    expect(lookup('BRL')).toBe(1)
  })
})

describe('custo em reais por pagador', () => {
  it('cartão em reais de outra pessoa: cotação de referência com spread e IOF do cartão, estimado', () => {
    expect(rateFor('USD', { personId: 'ana', methodId: 'itau-ana' })).toBeCloseTo(5 * 1.04 * 1.035)
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
