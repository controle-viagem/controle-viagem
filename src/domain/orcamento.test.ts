import { describe, expect, it } from 'vitest'
import { budgetStatus, levelOf } from './orcamento'
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
