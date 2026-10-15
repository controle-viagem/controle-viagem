import { describe, expect, it } from 'vitest'
import { currencyDigits, currencyName, decimalText, parseDecimal } from './moeda'

describe('moedas', () => {
  it('casas decimais por moeda', () => {
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('CLP')).toBe(0)
  })

  it('nome em português', () => {
    expect(currencyName('EUR')).toBe('Euro')
  })

  it('lê números com vírgula, ponto e milhar', () => {
    expect(parseDecimal('5,4321')).toBe(5.4321)
    expect(parseDecimal('5.43')).toBe(5.43)
    expect(parseDecimal('1.234,56')).toBe(1234.56)
    expect(parseDecimal(' 3,5 ')).toBe(3.5)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('-2')).toBeNull()
    expect(parseDecimal(',')).toBeNull()
  })

  it('mostra número para edição com vírgula', () => {
    expect(decimalText(5.75)).toBe('5,75')
    expect(decimalText(3.5)).toBe('3,5')
    expect(decimalText(undefined)).toBe('')
  })
})
