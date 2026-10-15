import type { Trip } from '../db/types'

type Dates = Pick<Trip, 'startDate' | 'endDate'>

const dayIndex = (dateISO: string) => {
  const [y, m, d] = dateISO.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Dias entre duas datas 'AAAA-MM-DD' (b − a). */
export const daysBetween = (a: string, b: string) => Math.round(dayIndex(b) - dayIndex(a))

/** Duração da viagem em dias, contando o primeiro e o último. */
export const tripDays = (trip: Dates) => Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1)

export type Phase = 'antes' | 'durante' | 'depois'

export const PHASE_LABEL: Record<Phase, string> = {
  antes: 'Antes da viagem',
  durante: 'Durante a viagem',
  depois: 'Depois da viagem',
}

/** Fase de um gasto pela data: passagens compradas meses antes são "antes da viagem". */
export function phaseOf(date: string, trip: Dates): Phase {
  if (date < trip.startDate) return 'antes'
  if (date > trip.endDate) return 'depois'
  return 'durante'
}

/** Número do dia dentro da viagem (1 = primeiro dia), ou null fora dela. */
export const dayNumber = (date: string, trip: Dates) =>
  phaseOf(date, trip) === 'durante' ? daysBetween(trip.startDate, date) + 1 : null

export type TripStatus = 'planejada' | 'andamento' | 'encerrada'

export const STATUS_LABEL: Record<TripStatus, string> = {
  planejada: 'Planejada',
  andamento: 'Em andamento',
  encerrada: 'Terminou',
}

/** Situação para mostrar: "Encerrada" quando o dono encerrou; senão, pela data. */
export const statusLabel = (trip: Dates & { closed?: boolean }, today: string) =>
  trip.closed ? 'Encerrada' : STATUS_LABEL[tripStatus(trip, today)]

export function tripStatus(trip: Dates, today: string): TripStatus {
  if (today < trip.startDate) return 'planejada'
  if (today > trip.endDate) return 'encerrada'
  return 'andamento'
}

/**
 * Em andamento primeiro; depois as próximas (a mais perto antes); depois as que já terminaram (a mais recente antes);
 * por fim as encerradas pelo dono.
 */
export function sortTrips<T extends Dates & { closed?: boolean }>(trips: T[], today: string): T[] {
  const order: Record<TripStatus, number> = { andamento: 0, planejada: 1, encerrada: 2 }
  return [...trips].sort((a, b) => {
    if (!!a.closed !== !!b.closed) return a.closed ? 1 : -1
    const sa = a.closed ? 'encerrada' : tripStatus(a, today)
    const sb = b.closed ? 'encerrada' : tripStatus(b, today)
    if (sa !== sb) return order[sa] - order[sb]
    return sa === 'encerrada' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)
  })
}

/** Viagem a abrir quando nenhuma foi escolhida: a em andamento, senão a próxima, senão a mais recente. */
export const defaultTrip = <T extends Dates & { closed?: boolean }>(trips: T[], today: string): T | undefined => sortTrips(trips, today)[0]
