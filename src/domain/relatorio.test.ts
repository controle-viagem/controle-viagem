import { describe, expect, it } from 'vitest'
import type { Category, Expense, Person, Settlement, Trip } from '../db/types'
import { buildReport, presetConfig, SECTIONS, type ReportInput } from './relatorio'
import { summarize } from './resumo'

const person = (id: string, name: string): Person => ({ id, name, tripId: 'v', createdAt: '', updatedAt: '' })
const travelers = [person('eu', 'Eu'), person('ana', 'Ana'), person('joao', 'João'), person('leo', 'Léo')]
const trip = {
  id: 'v', name: 'Orlando', destination: '', startDate: '2026-12-20', endDate: '2026-12-29', currencies: ['USD'],
  groups: [{ id: 'silva', name: 'Casal Silva', memberIds: ['ana', 'joao'] }], archived: false, createdAt: '', updatedAt: '',
  budget: { personIds: ['eu'], total: 100000, byCategory: { alim: 20000 } },
} as Trip
const categories = new Map<string, Category>([
  ['alim', { id: 'alim', name: 'Alimentação', parentId: null, color: '#f97316', archived: false, createdAt: '', updatedAt: '' }],
  ['transp', { id: 'transp', name: 'Transporte', parentId: null, color: '#0ea5e9', archived: false, createdAt: '', updatedAt: '' }],
])
const equal = (ids: string[]) => ({ mode: 'igual' as const, shares: ids.map((personId) => ({ personId })) })
let n = 0
const expense = (extra: Partial<Expense>): Expense => ({
  id: `e${++n}`, createdAt: `2026-12-2${n % 10}`, updatedAt: '', tripId: 'v', date: '2026-12-21', description: '', categoryId: 'alim',
  subcategoryId: null, methodId: 'pix', currency: 'BRL', amount: 10000, ...extra,
})

const parking = expense({ description: 'Estacionamento', categoryId: 'transp', amount: 40000, split: equal(['eu', 'ana', 'joao', 'leo']) })
const myDinner = expense({ description: 'Meu jantar sozinho', amount: 15000 })
const leoTaxi = expense({ description: 'Táxi do Léo', payerId: 'leo', methodId: '', amount: 6000, split: equal(['leo', 'eu']) })
const settled: Settlement = {
  id: 's', batchId: 'b', tripId: 'v', date: '2026-12-22', fromId: 'leo', toId: 'eu', currency: 'BRL', amount: 5000, note: '', createdAt: '', updatedAt: '',
}

const input: ReportInput = {
  trip, today: '2026-12-23', expenses: [parking, myDinner, leoTaxi], settlements: [settled], travelers, categories,
  walletCosts: new Map(), rateFor: () => null, wallets: [], moves: [], positions: [], moveCosts: new Map(),
}

describe('prestação de contas', () => {
  it('para o Casal Silva: só gastos e acertos que os envolvem, sem nomes de terceiros', () => {
    const r = buildReport(input, presetConfig('prestacao', ['ana', 'joao']))
    expect(r.forNames).toBe('Ana + João')
    expect(r.expenses?.map((e) => e.description)).toEqual(['Estacionamento'])
    // Eu (quem emite) aparece com nome; o Léo, não escolhido, fica agrupado.
    expect(r.expenses?.[0]).toMatchObject({ paidBy: 'Eu', participants: 'Eu, Ana, João, +1 pessoa', part: 20000, total: 40000 })
    // O acerto entre o Léo e eu não envolve o casal.
    expect(r.settlements).toEqual([])
    // Seções que não estão no modelo não aparecem.
    expect(r.wallets).toBeUndefined()
    expect(r.budget).toBeUndefined()
    // Pagamentos que faltam: o casal me deve (o outro lado tem nome).
    expect(r.transfers).toEqual([{ from: 'Casal Silva', to: 'Eu', currency: 'BRL', amount: 20000, brl: null }])
  })

  it('completo para mim: tudo, com nomes', () => {
    const r = buildReport(input, presetConfig('completo', []))
    expect(r.expenses?.map((e) => e.description)).toEqual(['Estacionamento', 'Meu jantar sozinho', 'Táxi do Léo'])
    expect(r.expenses?.[2]).toMatchObject({ paidBy: 'Léo', participants: 'Léo, Eu' })
    expect(r.settlements).toEqual([{ date: '2026-12-22', from: 'Léo', to: 'Eu', currency: 'BRL', amount: 5000, paid: undefined }])
    // Alimentação: meu jantar R$ 150 + minha metade do táxi do Léo R$ 30 = R$ 180 de R$ 200 (90%).
    expect(r.budget?.categories.map((c) => [c.id, c.level])).toEqual([['alim', 'atencao']])
    // Tudo, menos os gastos previstos (seção opcional, desligada por padrão).
    expect(SECTIONS.filter((s) => !r.config.sections.includes(s))).toEqual(['previstos'])
    expect(r.forecast).toBeUndefined()
  })

  it('gastos previstos: fora dos saldos, à parte na seção própria', () => {
    const van = expense({ description: 'Van do aeroporto', amount: 24000, pending: true, split: equal(['eu', 'ana', 'joao', 'leo']) })
    const config = { ...presetConfig('completo', []), sections: ['saldos', 'previstos'] as typeof SECTIONS }
    const r = buildReport({ ...input, expenses: [...input.expenses, van] }, config)
    // Meu saldo não muda com a van: R$ 300 (estacionamento) − R$ 30 (táxi do Léo) − R$ 50 (acerto recebido) = R$ 220.
    expect(r.balances?.find((b) => b.name === 'Eu')?.amounts).toEqual([{ currency: 'BRL', value: 30000 - 3000 - 5000 }])
    expect(r.forecast?.items).toEqual([{ date: '2026-12-21', description: 'Van do aeroporto', currency: 'BRL', amount: 24000, part: 6000 }])
    // Quando eu pagar a van, os outros três me devem R$ 60 cada.
    expect(r.forecast?.balances).toEqual([{ name: 'Eu', amounts: [{ currency: 'BRL', value: 18000 }] }])
  })

  it('somas por categoria e pessoa batem com o resumo', () => {
    const r = buildReport(input, { ...presetConfig('familia', ['eu', 'ana']), scope: 'todos', nomes: 'mostrar' })
    const s = summarize(trip, input.expenses, '2026-12-23', new Map(), { personIds: ['eu', 'ana'] })
    expect(r.summary?.total).toBe(s.total)
    expect(r.categories?.reduce((sum, c) => sum + c.total, 0)).toBe(s.total)
    expect(r.people?.map((p) => [p.name, p.total])).toEqual([['Eu', 28000], ['Léo', 13000], ['Ana', 10000], ['João', 10000]])
  })

  it('período e categorias filtram a lista de gastos', () => {
    const r = buildReport(input, { ...presetConfig('completo', []), cat: ['transp'] })
    expect(r.expenses?.map((e) => e.description)).toEqual(['Estacionamento'])
  })
})
