import type { Expense, Settlement, Trip } from '../db/types'
import { payerOf, payersOf, sharesOf } from './rateio'

/** Valor por moeda (código ISO → centésimos). */
export type Amounts = Map<string, number>
/** Saldo de cada pessoa por moeda: positivo = tem a receber; negativo = tem a pagar. */
export type Balances = Map<string, Amounts>

function add(b: Balances, id: string, currency: string, value: number) {
  if (!value) return
  let amounts = b.get(id)
  if (!amounts) b.set(id, (amounts = new Map()))
  const next = (amounts.get(currency) ?? 0) + value
  if (next) amounts.set(currency, next)
  else amounts.delete(currency)
}

/**
 * Quem deve a quem, **na moeda de cada gasto**: cada pagador fica com o que pagou a receber; cada participante fica
 * devendo a sua parte. Um acerto abate a dívida de quem pagou e o crédito de quem recebeu, na moeda da dívida.
 */
export function balances(expenses: Pick<Expense, 'amount' | 'currency' | 'payerId' | 'payers' | 'split'>[], settlements: Pick<Settlement, 'fromId' | 'toId' | 'currency' | 'amount'>[]): Balances {
  const b: Balances = new Map()
  for (const e of expenses) {
    for (const p of payersOf(e)) add(b, p.personId, e.currency, p.amount)
    for (const [id, share] of sharesOf(e.amount, e.split, payerOf(e))) add(b, id, e.currency, -share)
  }
  for (const s of settlements) {
    add(b, s.fromId, s.currency, s.amount)
    add(b, s.toId, s.currency, -s.amount)
  }
  return b
}

/** Quem aparece na lista de saldos: uma pessoa, ou um grupo da viagem com os seus membros. */
export interface Party {
  id: string
  name: string
  memberIds: string[]
  isGroup: boolean
}

/**
 * Partes da lista de saldos. Por pessoa: cada uma sozinha. Por grupo: os grupos da viagem e, sozinho, quem não
 * está em nenhum. `ids` = viajantes e qualquer outra pessoa com saldo (ex.: quem saiu da viagem depois).
 */
export function parties(trip: Pick<Trip, 'groups'>, ids: string[], names: Map<string, string>, byGroup: boolean): Party[] {
  const solo = (id: string): Party => ({ id, name: names.get(id) ?? '—', memberIds: [id], isGroup: false })
  if (!byGroup) return ids.map(solo)
  const grouped = new Set(trip.groups.flatMap((g) => g.memberIds))
  return [
    ...trip.groups.map((g) => ({ id: g.id, name: g.name, memberIds: g.memberIds, isGroup: true })),
    ...ids.filter((id) => !grouped.has(id)).map(solo),
  ]
}

/** Saldo de cada parte: a soma dos seus membros. Dentro de um grupo, o que um membro deve ao outro se anula. */
export function partyBalances(b: Balances, list: Party[]): Map<string, Amounts> {
  const out = new Map<string, Amounts>()
  for (const party of list) {
    const sum: Amounts = new Map()
    for (const id of party.memberIds) {
      for (const [currency, value] of b.get(id) ?? []) {
        const next = (sum.get(currency) ?? 0) + value
        if (next) sum.set(currency, next)
        else sum.delete(currency)
      }
    }
    out.set(party.id, sum)
  }
  return out
}

export interface Transfer {
  fromId: string
  toId: string
  currency: string
  amount: number
}

/** Pagamentos sugeridos para zerar todos os saldos, com o menor número de pagamentos, moeda por moeda. */
export function suggest(balancesByParty: Map<string, Amounts>): Transfer[] {
  const currencies = new Set([...balancesByParty.values()].flatMap((a) => [...a.keys()]))
  const out: Transfer[] = []
  for (const currency of [...currencies].sort()) {
    const list = [...balancesByParty].map(([id, a]) => ({ id, value: a.get(currency) ?? 0 }))
    const debtors = list.filter((x) => x.value < 0).sort((a, b) => a.value - b.value)
    const creditors = list.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
    let d = 0
    let c = 0
    while (d < debtors.length && c < creditors.length) {
      const amount = Math.min(-debtors[d].value, creditors[c].value)
      out.push({ fromId: debtors[d].id, toId: creditors[c].id, currency, amount })
      debtors[d].value += amount
      creditors[c].value -= amount
      if (debtors[d].value === 0) d++
      if (creditors[c].value === 0) c++
    }
  }
  return out
}

/**
 * Divide um valor na proporção dos pesos (centavos que sobram vão um a um, a partir do maior peso).
 * Sem nenhum peso positivo, divide por igual.
 */
export function allocate(amount: number, weights: { id: string; weight: number }[]): { id: string; amount: number }[] {
  if (weights.length === 0) return []
  const positive = weights.some((w) => w.weight > 0)
  const ws = weights.map((w) => ({ id: w.id, weight: positive ? Math.max(0, w.weight) : 1 }))
  const total = ws.reduce((sum, w) => sum + w.weight, 0)
  const parts = ws.map((w) => ({ id: w.id, amount: Math.floor((amount * w.weight) / total), weight: w.weight }))
  let left = amount - parts.reduce((sum, p) => sum + p.amount, 0)
  const order = [...parts].filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight)
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) order[i].amount++
  return parts.map(({ id, amount: value }) => ({ id, amount: value }))
}

export interface SettlementRow {
  fromId: string
  toId: string
  amount: number
  paidAmount?: number
}

/**
 * Transforma um acerto entre partes (pessoas ou grupos) em linhas pessoa a pessoa. Do lado de quem paga, divide
 * na proporção do que cada membro deve naquela moeda; do lado de quem recebe, na proporção do que cada um tem a
 * receber. O valor pago em outra moeda (ex.: reais) é dividido na mesma proporção.
 */
export function settlementRows(
  from: Pick<Party, 'memberIds'>,
  to: Pick<Party, 'memberIds'>,
  currency: string,
  amount: number,
  b: Balances,
  paidAmount?: number,
): SettlementRow[] {
  const value = (id: string) => b.get(id)?.get(currency) ?? 0
  const rows: SettlementRow[] = []
  for (const payer of allocate(amount, from.memberIds.map((id) => ({ id, weight: -value(id) })))) {
    for (const receiver of allocate(payer.amount, to.memberIds.map((id) => ({ id, weight: value(id) })))) {
      if (receiver.amount > 0 && payer.id !== receiver.id) rows.push({ fromId: payer.id, toId: receiver.id, amount: receiver.amount })
    }
  }
  if (paidAmount !== undefined) {
    const paid = allocate(paidAmount, rows.map((r, i) => ({ id: String(i), weight: r.amount })))
    rows.forEach((r, i) => (r.paidAmount = paid[i].amount))
  }
  return rows
}
