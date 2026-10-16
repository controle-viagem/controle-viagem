import type { Budget, Trip } from '../db/types'
import type { TripSummary } from './resumo'
import { tripDays } from './viagem'

/** Situação de um limite: ok, atenção (a partir de 80%) ou estourou (passou do limite). */
export type BudgetLevel = 'ok' | 'atencao' | 'estourou'

export const BUDGET_LEVEL_LABEL: Record<BudgetLevel, string> = {
  ok: 'Dentro do orçamento',
  atencao: 'Atenção: perto do limite',
  estourou: 'Passou do limite',
}

export interface BudgetLine {
  /** Id da categoria; '' no total. */
  id: string
  limit: number
  spent: number
  /** Fração usada (gasto ÷ limite). */
  share: number
  level: BudgetLevel
}

export interface BudgetStatus {
  total: (BudgetLine & { projection: number; projectedLevel: BudgetLevel }) | null
  categories: BudgetLine[]
  /** Pior situação entre o total e as categorias. */
  worst: BudgetLevel
}

export const levelOf = (spent: number, limit: number): BudgetLevel =>
  limit <= 0 ? 'ok' : spent > limit ? 'estourou' : spent >= limit * 0.8 ? 'atencao' : 'ok'

const ORDER: Record<BudgetLevel, number> = { ok: 0, atencao: 1, estourou: 2 }

/**
 * Compara o custo (o resumo de `summarize` para `budget.personIds`) com os limites. A projeção do total supõe que o
 * resto da viagem segue a média por dia até agora: antes da viagem + média por dia × dias + depois da viagem.
 */
export function budgetStatus(budget: Budget, summary: TripSummary, trip: Pick<Trip, 'startDate' | 'endDate'>): BudgetStatus {
  const line = (id: string, limit: number, spent: number): BudgetLine => ({
    id, limit, spent, share: limit > 0 ? spent / limit : 0, level: levelOf(spent, limit),
  })
  const projection =
    summary.perDay === null
      ? summary.total
      : summary.byPhase.antes + summary.byPhase.depois + Math.round(summary.perDay * tripDays(trip))
  const total = budget.total
    ? { ...line('', budget.total, summary.total), projection: Math.max(projection, summary.total), projectedLevel: levelOf(Math.max(projection, summary.total), budget.total) }
    : null
  const spentBy = new Map(summary.byCategory.map((c) => [c.id, c.total]))
  const categories = Object.entries(budget.byCategory)
    .filter(([, limit]) => limit > 0)
    .map(([id, limit]) => line(id, limit, spentBy.get(id) ?? 0))
    .sort((a, b) => b.share - a.share)
  const worst = [total, ...categories].reduce<BudgetLevel>((w, l) => (l && ORDER[l.level] > ORDER[w] ? l.level : w), 'ok')
  return { total, categories, worst }
}

// ---------- um orçamento por conjunto de pessoas (1.4.0) ----------
// Cada combinação do "Custo de" (só eu, o casal, um grupo…) pode ter o seu orçamento. O antigo `trip.budget` vale
// como o primeiro da lista até a viagem ganhar `budgets`.

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x))

/** Todos os orçamentos da viagem. */
export const budgetsOf = (trip: Pick<Trip, 'budget' | 'budgets'>): Budget[] => trip.budgets ?? (trip.budget ? [trip.budget] : [])

/** O orçamento das pessoas escolhidas (mesmo conjunto, em qualquer ordem), se houver. */
export const budgetFor = (trip: Pick<Trip, 'budget' | 'budgets'>, personIds: readonly string[]) =>
  budgetsOf(trip).find((b) => sameSet(b.personIds, personIds))

/** A lista com o orçamento dessas pessoas trocado (ou tirado, com `budget` ausente). */
export function withBudget(trip: Pick<Trip, 'budget' | 'budgets'>, personIds: readonly string[], budget?: Budget): Budget[] {
  const others = budgetsOf(trip).filter((b) => !sameSet(b.personIds, personIds))
  return budget ? [...others, budget] : others
}
