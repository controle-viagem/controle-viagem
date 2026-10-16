import { formatBRL, formatMoney, formatRate } from '../lib/format'
import type { RateLookup } from './custoViagem'
import type { Transfer } from './saldos'

/**
 * Texto para mandar no WhatsApp com os pagamentos que faltam. Em moeda estrangeira, mostra também quanto dá em
 * reais pela cotação de referência, para quem preferir pagar por Pix.
 */
export function settlementText(tripName: string, transfers: Transfer[], names: Map<string, string>, rateFor: RateLookup): string {
  if (transfers.length === 0) return `Acertos da viagem ${tripName}: tudo certo, ninguém deve nada.`
  const lines = transfers.map((t) => {
    const rate = t.currency === 'BRL' ? null : rateFor(t.currency, { personId: t.fromId })
    const inBRL = rate ? ` (≈ ${formatBRL(Math.round(t.amount * rate))} a ${formatRate(rate)})` : ''
    return `• ${names.get(t.fromId) ?? '—'} → ${names.get(t.toId) ?? '—'}: ${formatMoney(t.amount, t.currency)}${inBRL}`
  })
  return [`Acertos da viagem ${tripName}:`, ...lines].join('\n')
}
