import { describe, expect, it } from 'vitest'
import { allocate, balances, parties, partyBalances, settlementRows, suggest } from './saldos'

const five = ['eu', 'ana', 'joao', 'bia', 'leo']
const names = new Map([['eu', 'Eu'], ['ana', 'Ana'], ['joao', 'João'], ['bia', 'Bia'], ['leo', 'Léo']])
const trip = { groups: [{ id: 'silva', name: 'Casal Silva', memberIds: ['ana', 'joao'] }] }
const equal = (ids: string[]) => ({ mode: 'igual' as const, shares: ids.map((personId) => ({ personId })) })

// Estacionamento de US$ 50 dividido por 5, pago por mim.
const parking = { amount: 5000, currency: 'USD', payerId: 'eu', split: equal(five) }
const toObj = (b: Map<string, Map<string, number>>) =>
  Object.fromEntries([...b].map(([id, a]) => [id, Object.fromEntries(a)]))

describe('saldos entre viajantes', () => {
  it('quem pagou recebe o total; cada participante deve a sua parte', () => {
    expect(toObj(balances([parking], []))).toEqual({
      eu: { USD: 4000 }, ana: { USD: -1000 }, joao: { USD: -1000 }, bia: { USD: -1000 }, leo: { USD: -1000 },
    })
  })

  it('gasto pago por outro com a minha parte = eu devo', () => {
    const dinner = { amount: 8000, currency: 'USD', payerId: 'joao', split: equal(['eu', 'joao']) }
    const b = balances([dinner], [])
    expect(b.get('eu')?.get('USD')).toBe(-4000)
    expect(b.get('joao')?.get('USD')).toBe(4000)
  })

  it('moedas ficam separadas', () => {
    const lunch = { amount: 10000, currency: 'BRL', payerId: 'ana', split: equal(['eu', 'ana']) }
    expect(toObj(balances([parking, lunch], [])).eu).toEqual({ USD: 4000, BRL: -5000 })
  })

  it('por grupo, o casal me deve US$ 20 juntos; por pessoa, US$ 10 cada', () => {
    const b = balances([parking], [])
    const byGroup = parties(trip, five, names, true)
    expect(byGroup.map((p) => p.id)).toEqual(['silva', 'eu', 'bia', 'leo'])
    expect(toObj(partyBalances(b, byGroup)).silva).toEqual({ USD: -2000 })
    expect(toObj(partyBalances(b, parties(trip, five, names, false))).ana).toEqual({ USD: -1000 })
  })

  it('dentro do grupo, o que um deve ao outro se anula', () => {
    const b = balances([{ amount: 2000, currency: 'USD', payerId: 'ana', split: equal(['ana', 'joao']) }], [])
    expect(toObj(partyBalances(b, parties(trip, five, names, true))).silva).toEqual({})
  })

  it('acerto do casal em R$ 230 vira uma linha por pessoa e zera os dois', () => {
    const b = balances([parking], [])
    const rows = settlementRows({ memberIds: ['ana', 'joao'] }, { memberIds: ['eu'] }, 'USD', 2000, b, 23000)
    expect(rows).toEqual([
      { fromId: 'ana', toId: 'eu', amount: 1000, paidAmount: 11500 },
      { fromId: 'joao', toId: 'eu', amount: 1000, paidAmount: 11500 },
    ])
    const after = balances([parking], rows.map((r) => ({ ...r, currency: 'USD' })))
    expect(after.get('ana')?.size).toBe(0)
    expect(after.get('joao')?.size).toBe(0)
    expect(after.get('eu')?.get('USD')).toBe(2000)
  })

  it('pagamentos sugeridos, moeda por moeda', () => {
    const b = balances([parking, { amount: 3000, currency: 'USD', payerId: 'bia', split: equal(['bia', 'leo']) }], [])
    const t = suggest(partyBalances(b, parties(trip, five, names, true)))
    // Saldos: eu +40, Casal Silva −20, Bia +5, Léo −25. O maior devedor paga primeiro ao maior credor.
    expect(t).toEqual([
      { fromId: 'leo', toId: 'eu', currency: 'USD', amount: 2500 },
      { fromId: 'silva', toId: 'eu', currency: 'USD', amount: 1500 },
      { fromId: 'silva', toId: 'bia', currency: 'USD', amount: 500 },
    ])
  })

  it('divisão proporcional com centavos', () => {
    expect(allocate(1000, [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }])).toEqual([{ id: 'a', amount: 333 }, { id: 'b', amount: 667 }])
    expect(allocate(100, [{ id: 'a', weight: 0 }, { id: 'b', weight: 0 }])).toEqual([{ id: 'a', amount: 50 }, { id: 'b', amount: 50 }])
  })
})

describe('vários pagadores', () => {
  const seven = ['eu', 'ana', 'joao', 'bia', 'leo', 'rui', 'lia']
  // Ingressos de US$ 700: eu paguei 400 e o Léo 300; divididos por 7 (US$ 100 cada).
  const tickets = {
    amount: 70000, currency: 'USD', payers: [{ personId: 'eu', amount: 40000 }, { personId: 'leo', amount: 30000 }],
    split: equal(seven),
  }

  it('cada pagador recebe crédito do que pagou; cada participante deve a sua parte', () => {
    const b = balances([tickets], [])
    expect(b.get('eu')?.get('USD')).toBe(30000)
    expect(b.get('leo')?.get('USD')).toBe(20000)
    expect(b.get('ana')?.get('USD')).toBe(-10000)
    const total = [...b.values()].reduce((sum, a) => sum + (a.get('USD') ?? 0), 0)
    expect(total).toBe(0)
  })
})
