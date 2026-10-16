// Cotação PTAX do Banco Central (serviço público "Olinda"), buscada só quando o dono toca no botão.
// O BC publica 4 boletins por dia útil (por volta de 10h, 11h, 12h e 13h; o último é o de fechamento). Usamos o
// mais recente: antes do primeiro boletim do dia, ou em fim de semana, vale o fechamento do dia útil anterior.

/** Moedas com PTAX publicada pelo Banco Central. */
export const PTAX_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'DKK', 'NOK', 'SEK'] as const

export const hasPtax = (currency: string) => (PTAX_CURRENCIES as readonly string[]).includes(currency)

export interface Ptax {
  /** Reais por 1 unidade da moeda: a cotação de venda (o que se paga para comprar a moeda). */
  rate: number
  /** Data do boletim 'AAAA-MM-DD' e hora 'HH:MM'. */
  date: string
  time: string
  /** "Abertura", "Intermediário" ou "Fechamento". */
  bulletin: string
}

const BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'

/** O serviço usa datas como MM-DD-AAAA. */
const usDate = (iso: string) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`

function minusDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Endereço que traz o boletim mais recente da moeda nos últimos 10 dias (cobre feriados e fins de semana). */
export function ptaxUrl(currency: string, today: string): string {
  const range = `@moeda='${currency}'&@dataInicial='${usDate(minusDays(today, 10))}'&@dataFinalCotacao='${usDate(today)}'`
  return `${BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?${range}&$format=json&$orderby=dataHoraCotacao%20desc&$top=1`
}

/** Lê a resposta do Banco Central; null quando não há boletim no período. */
export function parsePtax(json: unknown): Ptax | null {
  const first = (json as { value?: { cotacaoVenda?: unknown; dataHoraCotacao?: unknown; tipoBoletim?: unknown }[] } | null)?.value?.[0]
  if (!first || typeof first.cotacaoVenda !== 'number' || typeof first.dataHoraCotacao !== 'string') return null
  const [date, clock = ''] = first.dataHoraCotacao.split(' ')
  return { rate: first.cotacaoVenda, date, time: clock.slice(0, 5), bulletin: String(first.tipoBoletim ?? '') }
}
