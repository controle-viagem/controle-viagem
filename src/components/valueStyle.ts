import { ME } from '../db/types'
import { formatMoney } from '../lib/format'

/**
 * Cores com significado fixo em todo o app. São classes do Tailwind que têm tom próprio no tema escuro
 * (`.dark` em index.css): não troque por cores que não estejam redefinidas lá.
 */
export const VALUE_STYLE = {
  /** Tenho a receber. */
  receber: 'text-emerald-600',
  /** Tenho a pagar. */
  pagar: 'text-rose-600',
  /** Valor em reais ainda estimado (a conferir na fatura ou pela cotação de referência). */
  estimado: 'text-amber-600',
  /** Saldo de moeda nas carteiras. */
  saldo: 'text-indigo-600',
  /** Valor secundário (equivalente em reais, detalhes). */
  apagado: 'text-slate-500',
} as const

/** Verde para receber, vermelho para pagar, cinza quando zerado. */
export const balanceClass = (value: number) =>
  value > 0 ? VALUE_STYLE.receber : value < 0 ? VALUE_STYLE.pagar : VALUE_STYLE.apagado

/** '+US$ 10,00' / '−US$ 10,00' / 'US$ 0,00'. */
export const signedMoney = (value: number, currency: string) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value), currency)}`

/**
 * Cores de destaque usadas em selos e avatares, sempre misturadas com transparência (color-mix), como os ícones
 * de categoria: funcionam nos dois temas. Escolhidas com luminosidade média para ler bem no claro e no escuro.
 */
const ACCENTS = ['#0284c7', '#059669', '#7c3aed', '#db2777', '#d97706', '#0d9488', '#4f46e5', '#dc2626', '#65a30d', '#c026d3']

const CURRENCY_ACCENT: Record<string, string> = {
  BRL: '#059669', USD: '#0284c7', EUR: '#4f46e5', GBP: '#7c3aed', CAD: '#dc2626', JPY: '#db2777', ARS: '#0d9488',
  CLP: '#d97706', CHF: '#c026d3', AUD: '#65a30d',
}

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export const currencyAccent = (code: string) => CURRENCY_ACCENT[code] ?? ACCENTS[hash(code) % ACCENTS.length]

/** Cor estável de uma pessoa (a mesma em todas as telas). "Eu" é sempre a primeira. */
export const personAccent = (id: string) => (id === ME ? ACCENTS[0] : ACCENTS[1 + (hash(id) % (ACCENTS.length - 1))])

/** Fundo suave e texto na cor de destaque. */
export const accentStyle = (color: string) => ({ background: `color-mix(in srgb, ${color} 16%, transparent)`, color })

/** 'Ana Paula Souza' -> 'AS'; 'Eu' -> 'EU'. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
