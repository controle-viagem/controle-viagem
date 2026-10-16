import { describe, expect, it } from 'vitest'
import { budgetFor, budgetsOf, budgetStatus, levelOf, withBudget } from './orcamento'
import type { TripSummary } from './resumo'

const trip = { startDate: '2026-12-20', endDate: '2026-12-29' } // 10 dias

const summary = (extra: Partial<TripSummary>): TripSummary => ({
  total: 0, estimated: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, byCurrency: [], byCategory: [], byPhase: { antes: 0, durante: 0, depois: 0 },
  byDay: [], perDay: null, extras: [], fx: { iof: 0, spread: 0 }, ...extra,
})

describe('orçamento da viagem', () => {
  it('situação: ok, atenção a partir de 80%, estourou acima do limite', () => {
    expect(levelOf(7900, 10000)).toBe('ok')
    expect(levelOf(8000, 10000)).toBe('atencao')
    expect(levelOf(10000, 10000)).toBe('atencao')
    expect(levelOf(10001, 10000)).toBe('estourou')
    expect(levelOf(500, 0)).toBe('ok')
  })

  it('total com projeção pela média por dia', () => {
    // Passagens R$ 4.000 antes; R$ 1.000 por dia nos dias até agora → projeção 4.000 + 10 × 1.000 = 14.000.
    const s = summary({ total: 700000, byPhase: { antes: 400000, durante: 300000, depois: 0 }, perDay: 100000 })
    const r = budgetStatus({ personIds: ['eu'], total: 1200000, byCategory: {} }, s, trip)
    expect(r.total).toMatchObject({ spent: 700000, share: 700000 / 1200000, level: 'ok', projection: 1400000, projectedLevel: 'estourou' })
  })

  it('categorias da mais usada para a menos, e a pior situação', () => {
    const s = summary({
      total: 30000,
      byCategory: [
        { id: 'alim', total: 25000, share: 0, subs: [] },
        { id: 'transp', total: 5000, share: 0, subs: [] },
      ],
    })
    const r = budgetStatus({ personIds: ['eu'], byCategory: { alim: 20000, transp: 10000, hosp: 0 } }, s, trip)
    expect(r.categories.map((c) => [c.id, c.level])).toEqual([['alim', 'estourou'], ['transp', 'ok']])
    expect(r.total).toBeNull()
    expect(r.worst).toBe('estourou')
  })
})

describe('um orçamento por conjunto de pessoas', () => {
  const eu = { personIds: ['eu'], total: 100000, byCategory: {} }
  const casal = { personIds: ['eu', 'iza'], total: 300000, byCategory: {} }

  it('o antigo orçamento único vale como o primeiro da lista', () => {
    expect(budgetsOf({ budget: eu })).toEqual([eu])
    expect(budgetsOf({ budget: eu, budgets: [casal] })).toEqual([casal])
  })

  it('acha pelo conjunto de pessoas, em qualquer ordem', () => {
    const trip = { budgets: [eu, casal] }
    expect(budgetFor(trip, ['iza', 'eu'])).toBe(casal)
    expect(budgetFor(trip, ['iza'])).toBeUndefined()
  })

  it('troca ou tira só o orçamento daquelas pessoas', () => {
    const novo = { ...casal, total: 350000 }
    expect(withBudget({ budgets: [eu, casal] }, ['iza', 'eu'], novo)).toEqual([eu, novo])
    expect(withBudget({ budget: eu }, ['eu'])).toEqual([])
  })
})
