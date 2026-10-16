import type { PaymentMethod } from '../db/types'
import { formatMoney, formatRate } from '../lib/format'
import { cardCharge } from './cambio'
import type { Position } from './custoMedio'
import { decimalText } from './moeda'

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

/** Opção com aviso (ex.: o saldo da carteira não cobre o preço). */
export interface PayerOption extends Option {
  warning?: string
}

type Method = Pick<PaymentMethod, 'id' | 'name' | 'kind' | 'spreadPct' | 'iofPct'>

/**
 * Formas de pagar do viajante escolhido (decisão do dono), carteira por carteira e cartão por cartão:
 * - **saldo atual** de cada carteira com saldo positivo na moeda, pelo custo médio dela (avisa se não cobre o preço);
 * - **carregar hoje** em cada carteira: cotação do dia × (1 + spread) × (1 + IOF) do cadastro da carteira;
 * - cada **cartão em reais**: cotação do dia × (1 + spread) × (1 + IOF) do cartão.
 * Os meios já vêm filtrados para o viajante (`methodsFor`); nunca há médio juntando carteiras diferentes.
 */
export function payerOptions(
  total: number,
  currency: string,
  rate: number | null,
  methods: Method[],
  positions: Pick<Position, 'walletId' | 'currency' | 'units' | 'avg'>[],
): PayerOption[] {
  const options: PayerOption[] = []
  const pct = (n: number | undefined) => `${decimalText(n ?? 0)}%`
  const daily = (spread?: number, iof?: number) => (rate ? `${formatRate(rate)} + spread ${pct(spread)} + IOF ${pct(iof)}` : 'informe a cotação do dia')
  for (const w of methods.filter((m) => m.kind === 'carteira')) {
    const p = positions.find((x) => x.walletId === w.id && x.currency === currency)
    if (p && p.units > 0 && p.avg) {
      options.push({
        key: `s:${w.id}`,
        label: `${w.name} · saldo atual`,
        detail: `médio ${formatRate(p.avg)} · saldo ${formatMoney(p.units, currency)}`,
        brl: viaWallet(total, p.avg),
        warning: total > p.units ? 'O saldo não cobre o preço.' : undefined,
      })
    }
    // Sem spread e IOF no cadastro, a conta sai sem eles: avisa, para a carga não parecer mais barata do que é.
    const unregistered = w.spreadPct === undefined && w.iofPct === undefined
    options.push({
      key: `l:${w.id}`,
      label: `${w.name} · carregar hoje`,
      detail: daily(w.spreadPct, w.iofPct),
      brl: viaCard(total, rate, w.spreadPct ?? 0, w.iofPct ?? 0),
      warning: unregistered ? 'Sem spread e IOF no cadastro da carteira (Mais → Meios de pagamento).' : undefined,
    })
  }
  for (const c of methods.filter((m) => m.kind === 'cartao_brl')) {
    options.push({ key: `c:${c.id}`, label: c.name, detail: daily(c.spreadPct, c.iofPct), brl: viaCard(total, rate, c.spreadPct ?? 0, c.iofPct ?? 0) })
  }
  return options
}
