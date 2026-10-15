import { describe, expect, it } from 'vitest'
import { splitTotal } from './impostos'

describe('imposto local e gorjeta a partir do total pago', () => {
  it('US$ 124,50 com 6,5% de imposto e 18% de gorjeta', () => {
    expect(splitTotal(12450, { mode: 'pct', pct: 6.5 }, { mode: 'pct', pct: 18 })).toEqual({ base: 10000, tax: 650, tip: 1800 })
  })

  it('só imposto: US$ 53,25 com 6,5% → preço 50,00', () => {
    expect(splitTotal(5325, { mode: 'pct', pct: 6.5 }, { mode: 'sem' })).toEqual({ base: 5000, tax: 325, tip: 0 })
  })

  it('gorjeta em valor e imposto em percentual sobre o resto', () => {
    // 100 + 6,5% = 106,50; mais 15 de gorjeta = 121,50
    expect(splitTotal(12150, { mode: 'pct', pct: 6.5 }, { mode: 'valor', value: 1500 })).toEqual({ base: 10000, tax: 650, tip: 1500 })
  })

  it('valores exatos e sem nada', () => {
    expect(splitTotal(10000, { mode: 'valor', value: 700 }, { mode: 'valor', value: 1000 })).toEqual({ base: 8300, tax: 700, tip: 1000 })
    expect(splitTotal(10000, { mode: 'sem' }, { mode: 'sem' })).toEqual({ base: 10000, tax: 0, tip: 0 })
  })

  it('as partes sempre somam o total, mesmo com centavos quebrados', () => {
    const r = splitTotal(3333, { mode: 'pct', pct: 8.875 }, { mode: 'pct', pct: 20 })
    expect(r.base + r.tax + r.tip).toBe(3333)
  })
})
