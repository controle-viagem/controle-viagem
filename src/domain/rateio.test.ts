import { describe, expect, it } from 'vitest'
import { partOf, payerOf, sharesOf, splitError } from './rateio'

const five = ['eu', 'ana', 'joao', 'bia', 'leo']
const equal = (ids: string[]) => ({ mode: 'igual' as const, shares: ids.map((personId) => ({ personId })) })

describe('divisão do gasto', () => {
  it('sem divisão, o gasto é todo de "Eu"', () => {
    expect([...sharesOf(5000, undefined)]).toEqual([['eu', 5000]])
    expect(payerOf({ amount: 100 })).toBe('eu')
  })

  it('estacionamento de US$ 50 por 5 = US$ 10 cada', () => {
    expect([...sharesOf(5000, equal(five), 'eu').values()]).toEqual([1000, 1000, 1000, 1000, 1000])
  })

  it('centavos que sobram vão primeiro para quem pagou', () => {
    const s = sharesOf(1000, equal(['ana', 'joao', 'eu']), 'joao')
    expect(Object.fromEntries(s)).toEqual({ ana: 333, joao: 334, eu: 333 })
    const s2 = sharesOf(1001, equal(['ana', 'joao', 'eu']), 'leo') // pagador fora da divisão
    expect(Object.fromEntries(s2)).toEqual({ ana: 334, joao: 334, eu: 333 })
  })

  it('cotas: casal com 2 cotas paga o dobro', () => {
    const split = { mode: 'cotas' as const, shares: [{ personId: 'casal1', weight: 2 }, { personId: 'leo', weight: 1 }] }
    expect(Object.fromEntries(sharesOf(9000, split, 'eu'))).toEqual({ casal1: 6000, leo: 3000 })
  })

  it('valores exatos', () => {
    const split = { mode: 'valores' as const, shares: [{ personId: 'eu', amount: 7000 }, { personId: 'ana', amount: 3000 }] }
    expect(Object.fromEntries(sharesOf(10000, split))).toEqual({ eu: 7000, ana: 3000 })
    expect(splitError(10000, split)).toBeNull()
    expect(splitError(12000, split)).toMatch(/menos/)
    expect(splitError(9000, split)).toMatch(/mais/)
  })

  it('valida participantes e cotas', () => {
    expect(splitError(100, undefined)).toBeNull()
    expect(splitError(100, { mode: 'igual', shares: [] })).toMatch(/quem participa/)
    expect(splitError(100, { mode: 'cotas', shares: [{ personId: 'eu', weight: 0 }] })).toMatch(/cotas/)
  })

  it('parte de uma pessoa ou de um grupo', () => {
    const e = { amount: 5000, payerId: 'eu', split: equal(five) }
    expect(partOf(e, ['eu'])).toBe(1000)
    expect(partOf(e, ['ana', 'joao'])).toBe(2000)
    expect(partOf({ amount: 5000 }, ['eu'])).toBe(5000)
  })
})
