import { describe, expect, it } from 'vitest'
import type { Expense } from '../db/types'
import { summarize } from './resumo'

const trip = { startDate: '2026-12-20', endDate: '2026-12-29' }

let n = 0
const expense = (extra: Partial<Expense>): Expense => ({
  id: `e${++n}`, createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: '', categoryId: 'alim',
  subcategoryId: null, methodId: 'm', currency: 'BRL', amount: 10000, ...extra,
})

const expenses = [
  // Passagens compradas antes, em reais.
  expense({ date: '2026-06-01', categoryId: 'transp', subcategoryId: 'aereo', amount: 500000 }),
  // Jantar em dólar no cartão, ainda estimado, com imposto e gorjeta.
  expense({ currency: 'USD', amount: 10000, localTax: 700, tip: 1800, rate: 5.5, iofPct: 3.5, brlAmount: 59202 }),
  // Mercado em dólar, já conferido na fatura.
  expense({ date: '2026-12-22', subcategoryId: 'mercado', currency: 'USD', amount: 5000, iofPct: 3.5, brlAmount: 30000, brlConfirmed: true }),
  // Uber em reais no dia 22.
  expense({ date: '2026-12-22', categoryId: 'transp', subcategoryId: 'uber', amount: 4798 }),
]

describe('resumo da viagem', () => {
  const s = summarize(trip, expenses, '2026-12-23')

  it('total em reais, com estimados à parte', () => {
    expect(s.total).toBe(500000 + 59202 + 30000 + 4798)
    expect(s.estimated).toEqual({ count: 1, total: 59202 })
  })

  it('valor original por moeda, reais primeiro', () => {
    expect(s.byCurrency).toEqual([
      { currency: 'BRL', amount: 504798 },
      { currency: 'USD', amount: 15000 },
    ])
  })

  it('categorias e subcategorias, da maior para a menor', () => {
    expect(s.byCategory.map((c) => c.id)).toEqual(['transp', 'alim'])
    expect(s.byCategory[1].subs).toEqual([
      { id: '', total: 59202, share: 59202 / 89202 },
      { id: 'mercado', total: 30000, share: 30000 / 89202 },
    ])
  })

  it('fases e dias', () => {
    expect(s.byPhase).toEqual({ antes: 500000, durante: 94000, depois: 0 })
    expect(s.byDay).toEqual([
      { date: '2026-12-21', total: 59202 },
      { date: '2026-12-22', total: 34798 },
    ])
    // Quatro dias decorridos (20 a 23).
    expect(s.perDay).toBe(23500)
  })

  it('média por dia: nada antes de começar, e para no último dia', () => {
    expect(summarize(trip, expenses, '2026-10-14').perDay).toBeNull()
    expect(summarize(trip, expenses, '2027-03-01').perDay).toBe(9400)
  })

  it('gasto pela carteira entra pelo custo médio, sem contar como estimado', () => {
    const wise = expense({ id: 'wise1', currency: 'USD', amount: 10000 })
    const w = summarize(trip, [...expenses, wise], '2026-12-23', new Map([['wise1:eu', 57500]]))
    expect(w.total).toBe(s.total + 57500)
    expect(w.estimated).toEqual(s.estimated)
    expect(w.byCurrency[1]).toEqual({ currency: 'USD', amount: 25000 })
    expect(w.fx).toEqual(s.fx)
  })

  it('imposto local, gorjeta e custo do câmbio', () => {
    expect(s.extras).toEqual([{ currency: 'USD', localTax: 700, tip: 1800 }])
    expect(s.fx).toEqual({ iof: 2002 + 1014, spread: 2200 })
  })
})

describe('meu custo com gastos divididos', () => {
  const equal = (ids: string[]) => ({ mode: 'igual' as const, shares: ids.map((personId) => ({ personId })) })
  // Estacionamento de R$ 500 por 5, pago por mim; jantar de US$ 80 pago pelo João, dividido comigo e com a Ana.
  const parking = expense({ amount: 50000, split: equal(['eu', 'ana', 'joao', 'bia', 'leo']) })
  const dinner = expense({ payerId: 'joao', methodId: '', currency: 'USD', amount: 9000, split: equal(['eu', 'ana', 'joao']) })
  const rateFor = (c: string) => (c === 'USD' ? 5.75 : null)

  it('só a minha parte entra no meu custo; o que outro pagou em dólar vai pela cotação de referência, como estimado', () => {
    const r = summarize(trip, [parking, dinner], '2026-12-23', new Map(), { rateFor })
    expect(r.total).toBe(10000 + 17250)
    expect(r.estimated).toEqual({ count: 1, total: 17250 })
    expect(r.byCurrency).toEqual([{ currency: 'BRL', amount: 10000 }, { currency: 'USD', amount: 3000 }])
  })

  it('custo de um grupo soma a parte de cada membro', () => {
    const r = summarize(trip, [parking, dinner], '2026-12-23', new Map(), { rateFor, personIds: ['eu', 'ana'] })
    expect(r.total).toBe(20000 + 34500)
  })

  it('gasto em que não participo fica de fora', () => {
    const theirs = expense({ payerId: 'bia', methodId: '', split: equal(['bia', 'leo']) })
    expect(summarize(trip, [theirs], '2026-12-23').total).toBe(0)
  })
})

describe('meu custo com vários pagadores', () => {
  it('a parte que eu paguei vai pelo valor real do cartão; a dos outros pela cotação de referência', () => {
    // US$ 200: eu paguei 100 no cartão (R$ 592,02), a Ana pagou 100; dividido igual entre nós dois.
    const e = expense({
      currency: 'USD', amount: 20000, payers: [{ personId: 'eu', amount: 10000 }, { personId: 'ana', amount: 10000 }],
      split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] }, brlAmount: 59202, rate: 5.5, iofPct: 3.5,
    })
    const r = summarize(trip, [e], '2026-12-23', new Map(), { rateFor: () => 5.75 })
    // Gasto inteiro: 592,02 + 100 × 5,75 = 1.167,02; minha metade = 583,51.
    expect(r.total).toBe(58351)
    expect(r.estimated.count).toBe(1)
  })
})

describe('parte paga por outra pessoa com a carteira dela', () => {
  it('usa o custo médio real da carteira dela, sem estimativa', () => {
    // US$ 100 pagos pela Ana com o Wise dela (médio 5,60), divididos entre nós dois.
    const e = expense({
      id: 'jantar', currency: 'USD', amount: 10000, payerId: 'ana', methodId: 'wise-ana',
      split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] },
    })
    const r = summarize(trip, [e], '2026-12-23', new Map([['jantar:ana', 56000]]), { rateFor: () => 5.75, personIds: ['eu', 'ana'] })
    expect(r.total).toBe(56000)
    expect(r.estimated.count).toBe(0)
  })
})

describe('gasto a pagar no resumo', () => {
  it('entra no custo como previsto e aparece à parte', () => {
    const r = summarize(trip, [expense({ amount: 30000, pending: true }), expense({ amount: 10000 })], '2026-12-23')
    expect(r.total).toBe(40000)
    expect(r.pending).toEqual({ count: 1, total: 30000 })
  })
})
