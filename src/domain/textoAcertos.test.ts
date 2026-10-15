import { describe, expect, it } from 'vitest'
import { settlementText } from './textoAcertos'

const names = new Map([['silva', 'Casal Silva'], ['eu', 'Guilherme'], ['leo', 'Léo']])

describe('texto dos acertos', () => {
  it('lista os pagamentos com o equivalente em reais', () => {
    const text = settlementText(
      'Orlando',
      [
        { fromId: 'silva', toId: 'eu', currency: 'USD', amount: 2000 },
        { fromId: 'leo', toId: 'eu', currency: 'BRL', amount: 5000 },
      ],
      names,
      (c) => (c === 'USD' ? 5.75 : null),
    )
    expect(text.replace(/ /g, ' ')).toBe(
      'Acertos da viagem Orlando:\n• Casal Silva → Guilherme: US$ 20,00 (≈ R$ 115,00 a 5,75)\n• Léo → Guilherme: R$ 50,00',
    )
  })

  it('sem nada a pagar', () => {
    expect(settlementText('Orlando', [], names, () => null)).toMatch(/tudo certo/)
  })
})
