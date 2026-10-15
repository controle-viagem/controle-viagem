import { ME, type Settlement, type Trip } from '../../db/types'
import { balances, parties, partyBalances, suggest, type Party } from '../../domain/saldos'
import type { TripData } from '../lancamentos/useTripData'

/** Grupo da viagem em que "Eu" estou, se houver. */
export const myGroup = (trip: Trip) => trip.groups.find((g) => g.memberIds.includes(ME))

/**
 * Saldos da viagem prontos para mostrar: por pessoa (`byGroup` falso) ou juntando os grupos. Entram os viajantes e
 * qualquer outra pessoa que ainda tenha saldo (ex.: saiu da viagem depois de um gasto).
 */
export function tripBalances(trip: Trip, data: Pick<TripData, 'expenses' | 'settlements' | 'people' | 'travelers'>, byGroup: boolean) {
  const b = balances(data.expenses, data.settlements)
  const withBalance = [...b].filter(([, amounts]) => amounts.size > 0).map(([id]) => id)
  const ids = [...new Set([...data.travelers.map((p) => p.id), ...withBalance])]
  const names = new Map([...data.people].map(([id, p]) => [id, p.name]))
  const list = parties(trip, ids, names, byGroup)
  const byParty = partyBalances(b, list)
  // Parte em que "Eu" estou: eu mesmo, ou o meu grupo na visão por grupo.
  const mine = list.find((p) => p.memberIds.includes(ME))
  return { balances: b, parties: list, byParty, transfers: suggest(byParty), mine }
}

/**
 * Para editar um acerto já feito: os saldos sem ele (para dividir de novo entre os membros) e as partes oferecidas
 * (pessoas e grupos), já com quem pagou e quem recebeu naquele acerto escolhidos — se o acerto juntou pessoas que não
 * formam um grupo da viagem, essa junção aparece como uma parte própria.
 */
export function editContext(trip: Trip, data: Pick<TripData, 'expenses' | 'settlements' | 'people' | 'travelers'>, batch: Settlement[]) {
  const others = data.settlements.filter((s) => s.batchId !== batch[0].batchId)
  const b = balances(data.expenses, others)
  const names = new Map([...data.people].map(([id, p]) => [id, p.name]))
  const ids = [...new Set([...data.travelers.map((p) => p.id), ...batch.flatMap((s) => [s.fromId, s.toId])])]
  const persons = parties(trip, ids, names, false)
  const groups: Party[] = trip.groups.map((g) => ({ id: g.id, name: g.name, memberIds: g.memberIds, isGroup: true }))
  const sameMembers = (a: string[], c: string[]) => a.length === c.length && a.every((x) => c.includes(x))
  const partyOf = (memberIds: string[], key: string): Party =>
    [...persons, ...groups].find((p) => sameMembers(p.memberIds, memberIds)) ??
    { id: key, name: memberIds.map((id) => names.get(id) ?? '—').join(' + '), memberIds, isGroup: true }
  const from = partyOf([...new Set(batch.map((s) => s.fromId))], 'acerto-de')
  const to = partyOf([...new Set(batch.map((s) => s.toId))], 'acerto-para')
  const list = [from, to, ...groups, ...persons].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i)
  return {
    balances: b,
    parties: list,
    draft: { fromId: from.id, toId: to.id, currency: batch[0].currency, amount: batch.reduce((sum, s) => sum + s.amount, 0) },
  }
}
