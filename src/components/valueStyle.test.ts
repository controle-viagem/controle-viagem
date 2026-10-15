import { describe, expect, it } from 'vitest'
import { balanceClass, initials, personAccent, signedMoney } from './valueStyle'

describe('cores e rótulos de valores', () => {
  it('receber em verde, pagar em vermelho', () => {
    expect(balanceClass(100)).toContain('emerald')
    expect(balanceClass(-100)).toContain('rose')
    expect(balanceClass(0)).toContain('slate')
  })

  it('valor com sinal', () => {
    // O Intl separa símbolo e número com espaço não separável.
    expect(signedMoney(1000, 'USD').replace(/ /g, ' ')).toBe('+US$ 10,00')
    expect(signedMoney(-1000, 'USD').replace(/ /g, ' ')).toBe('−US$ 10,00')
  })

  it('iniciais e cor estável por pessoa', () => {
    expect(initials('Ana Paula Souza')).toBe('AS')
    expect(initials('Eu')).toBe('EU')
    expect(personAccent('abc')).toBe(personAccent('abc'))
  })
})
