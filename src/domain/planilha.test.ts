import { describe, expect, it } from 'vitest'
import type { Category, Expense, PaymentMethod, Person, Settlement, Trip } from '../db/types'
import { buildSpreadsheet } from './planilha'
import { presetConfig, type ReportInput } from './relatorio'

const person = (id: string, name: string): Person => ({ id, name, tripId: 'v', createdAt: '', updatedAt: '' })
const travelers = [person('eu', 'Eu'), person('ana', 'Ana'), person('joao', 'João'), person('leo', 'Léo')]
const trip = {
  id: 'v', name: 'Orlando', destination: '', startDate: '2026-12-20', endDate: '2026-12-29', currencies: ['USD'],
  groups: [{ id: 'silva', name: 'Casal Silva', memberIds: ['ana', 'joao'] }], archived: false, createdAt: '', updatedAt: '',
} as Trip
const categories = new Map<string, Category>([
  ['alim', { id: 'alim', name: 'Alimentação', parentId: null, color: '#f97316', archived: false, createdAt: '', updatedAt: '' }],
])
const equal = (ids: string[]) => ({ mode: 'igual' as const, shares: ids.map((personId) => ({ personId })) })
const expense = (id: string, extra: Partial<Expense>): Expense => ({
  id, createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: id, categoryId: 'alim', subcategoryId: null,
  methodId: 'pix', currency: 'BRL', amount: 10000, ...extra,
})
const settlement = (fromId: string, toId: string): Settlement => ({
  id: `${fromId}-${toId}`, batchId: 'b', tripId: 'v', date: '2026-12-22', fromId, toId, currency: 'BRL', amount: 1000, note: '', createdAt: '', updatedAt: '',
})
const methods = new Map<string, PaymentMethod>([['pix', { id: 'pix', name: 'Pix', kind: 'brl', archived: false, createdAt: '', updatedAt: '' }]])

const input: ReportInput = {
  trip, today: '2026-12-23', travelers, categories, walletCosts: new Map(), rateFor: () => null,
  expenses: [
    expense('Hotel', { amount: 40000, split: equal(['eu', 'ana', 'joao', 'leo']) }),
    expense('Meu jantar', { amount: 15000 }),
    expense('Táxi do Léo', { payerId: 'leo', methodId: '', amount: 6000, split: equal(['leo', 'eu']) }),
  ],
  settlements: [settlement('ana', 'eu'), settlement('leo', 'eu')],
  wallets: [], moves: [], positions: [], moveCosts: new Map(),
}

describe('planilha', () => {
  it('para o Casal Silva: só gastos e acertos deles, com uma coluna de parte por pessoa', () => {
    const [gastos, acertos, , saldos, resumo] = buildSpreadsheet(input, presetConfig('prestacao', ['ana', 'joao']), methods)
    expect(gastos.columns.map((c) => c.header)).toContain('Parte de Ana')
    expect(gastos.columns.map((c) => c.header)).toContain('Parte de João')
    expect(gastos.rows.map((r) => r[1])).toEqual(['Hotel'])
    const header = gastos.columns.map((c) => c.header)
    const row = gastos.rows[0]
    expect(row[header.indexOf('Valor')]).toBe(400)
    expect(row[header.indexOf('Parte de Ana')]).toBe(100)
    expect(row[header.indexOf('Parte em R$')]).toBe(200)
    expect(row[header.indexOf('Participantes')]).toBe('Eu, Ana, João, +1 pessoa')
    expect(acertos.rows.map((r) => [r[1], r[2]])).toEqual([['Ana', 'Eu']])
    expect(saldos.rows.map((r) => r[0])).toEqual(['Ana', 'João', 'Total (Ana + João)'])
    expect(resumo.rows[0]).toEqual(['Alimentação', '', 200, 1])
  })

  it('completo para mim: todos os meus gastos', () => {
    const [gastos] = buildSpreadsheet(input, presetConfig('completo', []), methods)
    expect(gastos.rows.map((r) => r[1])).toEqual(['Hotel', 'Meu jantar', 'Táxi do Léo'])
    const header = gastos.columns.map((c) => c.header)
    expect(gastos.rows[1][header.indexOf('Meio')]).toBe('Pix')
    expect(gastos.rows[2][header.indexOf('Quem pagou')]).toBe('Léo')
  })
})
