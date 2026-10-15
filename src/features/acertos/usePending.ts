import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { ME, type Trip } from '../../db/types'
import { balances, type Amounts } from '../../domain/saldos'

export interface TripPending {
  trip: Trip
  /** Meu saldo por moeda nesta viagem: positivo = tenho a receber; negativo = tenho a pagar. */
  mine: Amounts
  /** Quantas pessoas ainda têm algo a acertar (eu inclusive). */
  people: number
}

/** Viagens com valores ainda a acertar (para o aviso de pendências e para encerrar a viagem). */
export function usePending(): TripPending[] {
  return (
    useLiveQuery(async () => {
      const [trips, expenses, settlements] = await Promise.all([db.trips.toArray(), db.expenses.toArray(), db.settlements.toArray()])
      return trips
        .map((trip) => {
          const b = balances(
            expenses.filter((e) => e.tripId === trip.id),
            settlements.filter((s) => s.tripId === trip.id),
          )
          return { trip, mine: b.get(ME) ?? new Map(), people: [...b.values()].filter((a) => a.size > 0).length }
        })
        .filter((p) => p.people > 0)
    }, []) ?? []
  )
}
