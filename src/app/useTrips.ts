import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { ACTIVE_TRIP } from '../db/repo'
import type { Trip } from '../db/types'
import { defaultTrip, sortTrips } from '../domain/viagem'
import { todayISO } from '../lib/format'

/**
 * Viagens em ordem (em andamento, próximas, encerradas) e a viagem aberta: a escolhida neste aparelho,
 * ou, se ela não existe mais, a em andamento / a próxima. `loaded` evita piscar a tela de "sem viagens".
 */
export function useTrips(): { trips: Trip[]; active: Trip | undefined; loaded: boolean } {
  const data = useLiveQuery(async () => {
    const [trips, chosen] = await Promise.all([db.trips.toArray(), db.local.get(ACTIVE_TRIP)])
    return { trips, chosenId: chosen?.value as string | undefined }
  }, [])
  if (!data) return { trips: [], active: undefined, loaded: false }
  const today = todayISO()
  const visible = data.trips.filter((t) => !t.archived)
  const trips = sortTrips(visible, today)
  const active = visible.find((t) => t.id === data.chosenId) ?? defaultTrip(visible, today)
  return { trips, active, loaded: true }
}
