import { ME, type PaymentMethod } from '../db/types'

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Carteira minha: sem titular informado. */
export const isMine = (w: Pick<PaymentMethod, 'holderName'>) => !w.holderName?.trim()

/** Nome do titular para mostrar: o informado, ou "Eu". */
export const holderLabel = (w: Pick<PaymentMethod, 'holderName'>) => w.holderName?.trim() || 'Eu'

/**
 * Carteiras de uma pessoa: as minhas para "Eu"; para os outros, as que têm o nome dela como titular (sem diferenciar
 * maiúsculas nem acentos). Assim a carteira da Ana vale em todas as viagens em que houver uma Ana.
 */
export function walletsOf<T extends Pick<PaymentMethod, 'holderName'>>(person: { id: string; name: string }, wallets: T[]): T[] {
  if (person.id === ME) return wallets.filter(isMine)
  return wallets.filter((w) => !isMine(w) && plain(w.holderName ?? '') === plain(person.name))
}

/**
 * Meios de pagamento de uma pessoa (mesma regra do titular) que pagam nesta moeda: em reais, os em reais e os cartões;
 * em outra moeda, os cartões e as carteiras.
 */
export function methodsFor<T extends Pick<PaymentMethod, 'holderName' | 'kind'>>(person: { id: string; name: string }, methods: T[], currency: string): T[] {
  return walletsOf(person, methods).filter((m) => (currency === 'BRL' ? m.kind !== 'carteira' : m.kind !== 'brl'))
}
