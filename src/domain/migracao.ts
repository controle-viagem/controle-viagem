/** Id da pessoa "Eu" (repetido de db/types para o domínio não depender do banco). */
const ME = 'eu'

type Row = Record<string, unknown>
type Share = { personId: string }
type Group = { id: string; name: string; memberIds: string[] }

export interface PeopleData {
  people: Row[]
  trips: Row[]
  expenses: Row[]
  settlements: Row[]
}

/**
 * Passa as pessoas de um cadastro geral para um cadastro por viagem (formato 4 / banco versão 4):
 * - cada pessoa usada numa viagem (viajante, pagador, participante ou acerto) ganha o `tripId` dela;
 * - quem estava em várias viagens vira uma cópia por viagem, e o id é trocado nos gastos, acertos e grupos daquela
 *   viagem (assim cada viagem fica com a sua lista, sem misturar);
 * - quem não estava em nenhuma viagem sai; "Eu" continua sem viagem;
 * - `travelerIds` some da viagem (viajantes passam a ser as pessoas com o `tripId` dela).
 * Altera os objetos recebidos e devolve os mesmos arrays (pessoas recriadas).
 */
export function peoplePerTrip(data: PeopleData, newId: () => string): PeopleData {
  const byId = new Map(data.people.map((p) => [String(p.id), p]))
  const assigned = new Set<string>()
  const people: Row[] = data.people.filter((p) => p.id === ME)

  for (const trip of data.trips) {
    const tripId = String(trip.id)
    const expenses = data.expenses.filter((e) => e.tripId === tripId)
    const settlements = data.settlements.filter((s) => s.tripId === tripId)
    const used = new Set<string>(Array.isArray(trip.travelerIds) ? (trip.travelerIds as string[]) : [])
    for (const e of expenses) {
      if (typeof e.payerId === 'string') used.add(e.payerId)
      for (const p of (e.payers as Share[] | undefined) ?? []) used.add(p.personId)
      for (const s of ((e.split as { shares?: Share[] } | undefined)?.shares) ?? []) used.add(s.personId)
    }
    for (const s of settlements) {
      used.add(String(s.fromId))
      used.add(String(s.toId))
    }
    used.delete(ME)

    const rename = new Map<string, string>()
    for (const id of used) {
      const original = byId.get(id)
      if (!original) continue
      if (!assigned.has(id)) {
        assigned.add(id)
        people.push({ ...original, tripId })
      } else {
        const copyId = newId()
        rename.set(id, copyId)
        people.push({ ...original, id: copyId, tripId })
      }
    }

    if (rename.size > 0) {
      const to = (id: unknown) => (typeof id === 'string' && rename.get(id)) || id
      for (const e of expenses) {
        if (e.payerId !== undefined) e.payerId = to(e.payerId)
        for (const p of (e.payers as Share[] | undefined) ?? []) p.personId = to(p.personId) as string
        for (const s of ((e.split as { shares?: Share[] } | undefined)?.shares) ?? []) s.personId = to(s.personId) as string
      }
      for (const s of settlements) {
        s.fromId = to(s.fromId)
        s.toId = to(s.toId)
      }
      for (const g of (trip.groups as Group[] | undefined) ?? []) g.memberIds = g.memberIds.map((m) => to(m) as string)
    }
    delete trip.travelerIds
  }

  data.people.splice(0, data.people.length, ...people)
  return data
}
