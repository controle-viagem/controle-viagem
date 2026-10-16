import type { PaymentMethod } from '../db/types'
import { formatMoney, formatRate } from '../lib/format'
import { cardCharge } from './cambio'
import { positiveByCurrency, type Position } from './custoMedio'
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
 * Formas de pagar do viajante escolhido (decisão do dono, 1.2.1):
 * - **saldo das carteiras**: uma linha só, pelo médio de todas as carteiras dele com saldo positivo na moeda
 *   (avisa se o saldo não cobre o preço);
 * - **carga nova** em cada carteira: cotação do dia (digitada ou PTAX) × (1 + spread) × (1 + IOF) do cadastro dela;
 * - cada **cartão em reais** dele: cotação do dia × (1 + spread) × (1 + IOF) do cartão.
 * Os meios já vêm filtrados para o viajante (`methodsFor`): nunca entram carteiras de outra pessoa.
 */
export function payerOptions(
  total: number,
  currency: string,
  rate: number | null,
  methods: Method[],
  positions: Position[],
): PayerOption[] {
  const options: PayerOption[] = []
  const pct = (n: number | undefined) => `${decimalText(n ?? 0)}%`
  const daily = (spread?: number, iof?: number) => (rate ? `${formatRate(rate)} + spread ${pct(spread)} + IOF ${pct(iof)}` : 'informe a cotação do dia')
  const wallets = methods.filter((m) => m.kind === 'carteira')
  const ids = new Set(wallets.map((w) => w.id))
  const withBalance = positions.filter((p) => ids.has(p.walletId) && p.currency === currency && p.units > 0)
  const saldo = positiveByCurrency(withBalance)[0]
  if (saldo?.avg) {
    options.push({
      key: 'saldo',
      label: 'Saldo das carteiras',
      detail: `médio ${formatRate(saldo.avg)} · saldo ${formatMoney(saldo.units, currency)}${withBalance.length > 1 ? ` em ${withBalance.length} carteiras` : ''}`,
      brl: viaWallet(total, saldo.avg),
      warning: total > saldo.units ? 'O saldo não cobre o preço.' : undefined,
    })
  }
  for (const w of wallets) {
    // Sem spread e IOF no cadastro, a conta sai sem eles: avisa, para a carga não parecer mais barata do que é.
    const unregistered = w.spreadPct === undefined && w.iofPct === undefined
    options.push({
      key: `l:${w.id}`,
      label: `${w.name} · carga nova`,
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
