/** Moedas oferecidas nos cadastros (código ISO). A primeira é sempre o real. */
export const CURRENCIES = [
  'BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY',
  'ARS', 'CLP', 'UYU', 'PYG', 'COP', 'PEN', 'MXN', 'ZAR', 'AED', 'TRY', 'THB',
] as const

let names: Intl.DisplayNames | undefined

/** 'USD' -> 'Dólar americano'. */
export function currencyName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['pt-BR'], { type: 'currency' })
    const name = names.of(code) ?? code
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return code
  }
}

/** Casas decimais da moeda: 2 na maioria, 0 no iene e no peso chileno. */
export function currencyDigits(code: string): number {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/**
 * Lê um número digitado: aceita vírgula ou ponto como decimal e ponto como milhar ("5,4321", "5.43",
 * "1.234,56"). Devolve null quando vazio, inválido ou negativo.
 */
export function parseDecimal(text: string): number | null {
  let s = text.trim().replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Número para mostrar num campo editável: 5.75 -> '5,75'. */
export const decimalText = (n: number | undefined, maxDigits = 6) =>
  n === undefined ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: maxDigits, useGrouping: false })
