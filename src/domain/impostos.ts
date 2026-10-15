/** Como o imposto ou a gorjeta entra num gasto: por percentual sobre o preço, valor exato ou nada. */
export type ExtraMode = 'pct' | 'valor' | 'sem'

export interface ExtraInput {
  mode: ExtraMode
  /** Percentual (ex.: 6.5), quando `mode` = 'pct'. */
  pct?: number
  /** Centésimos da moeda, quando `mode` = 'valor'. */
  value?: number
}

/**
 * Separa o **total pago** em preço, imposto local e gorjeta. Imposto e gorjeta em percentual são sobre o preço
 * (sem imposto); em valor, entram como digitados:
 *   preço = (total − valores fixos) ÷ (1 + imposto% + gorjeta%)
 * Ex.: US$ 124,50 com 6,5% e 18% → preço 100,00, imposto 6,50, gorjeta 18,00. O preço fica com o que sobra do
 * arredondamento, para as três partes somarem exatamente o total.
 */
export function splitTotal(total: number, tax: ExtraInput, tip: ExtraInput): { base: number; tax: number; tip: number } {
  const pct = (x: ExtraInput) => (x.mode === 'pct' ? (x.pct ?? 0) / 100 : 0)
  const fixed = (x: ExtraInput) => (x.mode === 'valor' ? (x.value ?? 0) : 0)
  const base = (total - fixed(tax) - fixed(tip)) / (1 + pct(tax) + pct(tip))
  const taxValue = tax.mode === 'pct' ? Math.round(base * pct(tax)) : fixed(tax)
  const tipValue = tip.mode === 'pct' ? Math.round(base * pct(tip)) : fixed(tip)
  return { base: total - taxValue - tipValue, tax: taxValue, tip: tipValue }
}
