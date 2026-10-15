const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pad = (n: number) => String(n).padStart(2, '0')

/** Valores são sempre guardados em centavos (inteiro). */
export const formatBRL = (cents: number) => brl.format(cents / 100)

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/** Valor abreviado para eixos de gráfico: 150000 centavos -> '1,5 mil'. */
export const formatCompact = (cents: number) => compact.format(cents / 100)

/** 12.34 -> '12,3%' */
export const formatPercent = (value: number) =>
  `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** 'AAAA-MM' -> 'out' */
export const monthShort = (month: string) => MONTH_SHORT[Number(month.slice(5, 7)) - 1]

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'AAAA-MM-DD' -> 'AAAA-MM' */
export const monthOf = (dateISO: string) => dateISO.slice(0, 7)

export const currentMonth = () => monthOf(todayISO())

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Data no mês indicado; se o dia não existe (ex.: 31 em fevereiro), usa o último dia. */
export function withDay(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${month}-${pad(Math.min(day, last))}`
}

export const addMonthsToDate = (dateISO: string, n: number) =>
  withDay(addMonths(monthOf(dateISO), n), Number(dateISO.slice(8, 10)))

/** Soma dias a uma data 'AAAA-MM-DD'. */
export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  // Em UTC, para o horário de verão não comer nem repetir um dia.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 'AAAA-MM-DD' -> 'DD/MM' */
export const shortDate = (dateISO: string) => `${dateISO.slice(8, 10)}/${dateISO.slice(5, 7)}`

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function dayLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

const moneyFormats = new Map<string, Intl.NumberFormat>()

/** Valor em centésimos da moeda: (1050, 'USD') -> 'US$ 10,50'. Iene e peso chileno saem sem decimais. */
export function formatMoney(cents: number, currency: string): string {
  let f = moneyFormats.get(currency)
  if (!f) moneyFormats.set(currency, (f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency })))
  return f.format(cents / 100)
}

/** Cotação: 5.4321 -> '5,4321'; 5.5 -> '5,50'. */
export const formatRate = (rate: number) =>
  rate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** 'AAAA-MM-DD' -> '20/12/2026' */
export const fullDate = (dateISO: string) => `${dateISO.slice(8, 10)}/${dateISO.slice(5, 7)}/${dateISO.slice(0, 4)}`
