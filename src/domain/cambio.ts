/**
 * Compra em moeda estrangeira paga com cartão que cobra em reais. Valores em centavos de real; o valor
 * da compra em centésimos da moeda estrangeira.
 */
export interface CardCharge {
  /** Valor pela cotação informada, sem spread nem IOF. */
  base: number
  /** Acréscimo do banco sobre a cotação. */
  spread: number
  iof: number
  /** O que vem na fatura: base + spread + IOF. */
  total: number
}

/**
 * Reais cobrados = valor × cotação × (1 + spread) × (1 + IOF). O arredondamento é feito uma vez em cada
 * etapa, para as partes somarem exatamente o total.
 */
export function cardCharge(amount: number, rate: number, spreadPct: number, iofPct: number): CardCharge {
  const base = Math.round(amount * rate)
  const withSpread = Math.round(amount * rate * (1 + spreadPct / 100))
  const total = Math.round(amount * rate * (1 + spreadPct / 100) * (1 + iofPct / 100))
  return { base, spread: withSpread - base, iof: total - withSpread, total }
}

/** Cotação efetiva: reais pagos por unidade da moeda (inclui spread, IOF e tarifas). */
export const effectiveRate = (amount: number, brl: number) => (amount > 0 ? brl / amount : 0)

/** Parte do IOF dentro de um valor final em reais (ex.: valor confirmado na fatura). */
export const iofInside = (brl: number, iofPct: number) => Math.round((brl * iofPct) / (100 + iofPct))
