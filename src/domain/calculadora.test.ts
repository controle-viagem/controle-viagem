import { describe, expect, it } from 'vitest'
import { cheapest, priceWithExtras, viaCard, viaWallet } from './calculadora'
import { referenceRates } from './custoViagem'

describe('calculadora', () => {
  it('US$ 100 + 6,5% de imposto + 18% de gorjeta = US$ 124,50', () => {
    expect(priceWithExtras(10000, 6.5, 18)).toEqual({ base: 10000, tax: 650, tip: 1800, total: 12450 })
  })

  it('carteira pelo custo médio × cartão em reais', () => {
    expect(viaWallet(10000, 5.75)).toBe(57500)
    expect(viaWallet(10000, null)).toBeNull()
    expect(viaCard(10000, 5.5, 4, 3.5)).toBe(59202)
    expect(viaCard(10000, null, 4, 3.5)).toBeNull()
  })

  it('indica a mais barata, ignorando opções sem cotação', () => {
    const options = [
      { key: 'carteira', label: '', detail: '', brl: 57500 },
      { key: 'cartao', label: '', detail: '', brl: 59202 },
      { key: 'sim', label: '', detail: '', brl: null },
    ]
    expect(cheapest(options)).toBe('carteira')
    expect(cheapest([{ key: 'x', label: '', detail: '', brl: null }])).toBeNull()
  })

  it('cotação de referência: médio das carteiras, senão a última usada na viagem', () => {
    const expenses = [
      { currency: 'USD', rate: 5.4, date: '2026-12-20' },
      { currency: 'USD', rate: 5.6, date: '2026-12-22' },
      { currency: 'EUR', rate: 6.2, date: '2026-12-21' },
    ]
    const rateFor = referenceRates([{ currency: 'USD', avg: 5.75 }], expenses)
    expect(rateFor('USD')).toBe(5.75)
    expect(rateFor('EUR')).toBe(6.2)
    expect(rateFor('GBP')).toBeNull()
    expect(rateFor('BRL')).toBe(1)
    expect(referenceRates([], expenses)('USD')).toBe(5.6)
  })
})
