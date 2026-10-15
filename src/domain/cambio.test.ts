import { describe, expect, it } from 'vitest'
import { cardCharge, effectiveRate, iofInside } from './cambio'

describe('compra no exterior com cartão em reais', () => {
  it('US$ 100 a 5,50 com spread de 4% e IOF de 3,5% = R$ 592,02', () => {
    expect(cardCharge(10000, 5.5, 4, 3.5)).toEqual({ base: 55000, spread: 2200, iof: 2002, total: 59202 })
  })

  it('as partes sempre somam o total, mesmo com centavos quebrados', () => {
    const c = cardCharge(1234, 5.4321, 4.5, 3.5)
    expect(c.base + c.spread + c.iof).toBe(c.total)
  })

  it('sem spread e sem IOF é só a cotação', () => {
    expect(cardCharge(5000, 6.1, 0, 0)).toEqual({ base: 30500, spread: 0, iof: 0, total: 30500 })
  })

  it('cotação efetiva a partir do valor da fatura', () => {
    expect(effectiveRate(10000, 59202)).toBeCloseTo(5.9202)
    expect(effectiveRate(0, 100)).toBe(0)
  })

  it('IOF contido no valor final', () => {
    expect(iofInside(59202, 3.5)).toBe(2002)
    expect(iofInside(10000, 0)).toBe(0)
  })
})
