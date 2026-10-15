import { createContext, useContext } from 'react'
import type { Expense, Trip } from '../db/types'

export interface AppState {
  /** Viagem aberta neste aparelho; undefined enquanto não há nenhuma cadastrada. */
  trip: Trip | undefined
  /** Abre o formulário de gasto (novo, ou edição quando recebe um gasto). */
  openForm: (expense?: Expense) => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp fora do AppContext')
  return ctx
}
