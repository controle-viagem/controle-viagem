import { describe, expect, it } from 'vitest'
import { cheapest, payerOptions, priceWithExtras, viaCard, viaWallet } from './calculadora'
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

  it('cotação de referência: médio das minhas carteiras, senão a última usada na viagem', () => {
    const expenses = [
      { currency: 'USD', rate: 5.4, date: '2026-12-20' },
      { currency: 'USD', rate: 5.6, date: '2026-12-22' },
      { currency: 'EUR', rate: 6.2, date: '2026-12-21' },
    ]
    const rateFor = referenceRates([{ walletId: 'w', currency: 'USD', units: 10000, cost: 57500, avg: 5.75 }], expenses, [{ id: 'w', kind: 'carteira' }])
    expect(rateFor('USD')).toBe(5.75)
    expect(rateFor('EUR')).toBe(6.2)
    expect(rateFor('GBP')).toBeNull()
    expect(rateFor('BRL')).toBe(1)
    expect(referenceRates([], expenses)('USD')).toBe(5.6)
  })
})

describe('formas de pagar do viajante', () => {
  const methods = [
    { id: 'wise', name: 'Wise', kind: 'carteira' as const, spreadPct: 1, iofPct: 1.1 },
    { id: 'revolut', name: 'Revolut', kind: 'carteira' as const, spreadPct: 0.5, iofPct: 1.1 },
    // Sem spread e IOF no cadastro: sem carga nova.
    { id: 'nomad', name: 'Nomad', kind: 'carteira' as const },
    // Espécie: nunca tem carga nova; entra só pelo saldo.
    { id: 'dolar', name: 'Dólares', kind: 'carteira' as const, walletType: 'especie' as const },
    { id: 'itau', name: 'Itaú', kind: 'cartao_brl' as const, spreadPct: 4, iofPct: 3.5 },
  ]
  const positions = [
    { walletId: 'wise', currency: 'USD', units: 5000, cost: 28000, avg: 5.6 },
    { walletId: 'revolut', currency: 'USD', units: 15000, cost: 81000, avg: 5.4 },
    // Nomad negativa: fica fora do saldo.
    { walletId: 'nomad', currency: 'USD', units: -2000, cost: 0, avg: 5.4 },
    { walletId: 'dolar', currency: 'USD', units: 10000, cost: 52000, avg: 5.2 },
  ]

  it('saldo de todas as carteiras (médio ponderado) e carga nova só nos multimoeda com spread e IOF', () => {
    const options = payerOptions(10000, 'USD', 5.5, methods, positions)
    expect(options.map((o) => [o.key, o.brl, o.warning])).toEqual([
      // (280 + 810 + 520) / 300 = 5,3667 por dólar.
      ['saldo', 53667, undefined],
      ['l:wise', Math.round(10000 * 5.5 * 1.01 * 1.011), undefined],
      ['l:revolut', Math.round(10000 * 5.5 * 1.005 * 1.011), undefined],
      ['c:itau', 59202, undefined],
    ])
    expect(options[0].detail).toMatch(/^médio 5,3667 · saldo US\$\s300,00 em 3 carteiras$/)
    expect(cheapest(options)).toBe('saldo')
  })

  it('saldo que não cobre o preço avisa; sem cotação do dia, só o saldo tem valor', () => {
    expect(payerOptions(40000, 'USD', 5.5, methods, positions)[0].warning).toBe('O saldo não cobre o preço.')
    const options = payerOptions(1000, 'USD', null, methods, positions)
    expect(options.filter((o) => o.brl !== null).map((o) => o.key)).toEqual(['saldo'])
  })
})
