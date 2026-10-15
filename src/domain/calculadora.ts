import { cardCharge } from './cambio'

/** Preço na moeda estrangeira com imposto local e gorjeta, em centésimos. Gorjeta sobre o valor sem imposto. */
export interface Price {
  base: number
  tax: number
  tip: number
  total: number
}

export function priceWithExtras(base: number, taxPct: number, tipPct: number): Price {
  const tax = Math.round((base * taxPct) / 100)
  const tip = Math.round((base * tipPct) / 100)
  return { base, tax, tip, total: base + tax + tip }
}

export interface Option {
  key: string
  label: string
  /** Detalhe da conta, ex.: "médio 5,75" ou "5,50 + 4% + IOF 3,5%". */
  detail: string
  /** Custo em reais (centavos); null quando falta a cotação. */
  brl: number | null
}

/** Pelo custo médio da carteira: valor × médio. */
export const viaWallet = (total: number, avg: number | null) => (avg ? Math.round(total * avg) : null)

/** Pelo cartão em reais (ou simulação livre): valor × cotação × (1 + spread) × (1 + IOF). */
export const viaCard = (total: number, rate: number | null, spreadPct: number, iofPct: number) =>
  rate ? cardCharge(total, rate, spreadPct, iofPct).total : null

/** Opção mais barata entre as que têm valor (empate: a primeira). */
export function cheapest(options: Option[]): string | null {
  let best: Option | null = null
  for (const o of options) if (o.brl !== null && (best === null || o.brl < (best.brl ?? Infinity))) best = o
  return best?.key ?? null
}
