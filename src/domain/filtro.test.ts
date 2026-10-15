import { describe, expect, it } from 'vitest'
import type { Expense } from '../db/types'
import { filterCount, filterToParams, matchesFilter, parseFilter, type ExpenseFilter } from './filtro'

const trip = { startDate: '2026-12-20', endDate: '2026-12-29' }
const categories = new Map([
  ['alim', { id: 'alim', name: 'Alimentação', parentId: null }],
  ['rest', { id: 'rest', name: 'Restaurante', parentId: 'alim' }],
  ['merc', { id: 'merc', name: 'Mercado', parentId: 'alim' }],
  ['transp', { id: 'transp', name: 'Transporte', parentId: null }],
])
const ctx = { trip, categories, wallet: new Map<string, number>() }

let n = 0
const expense = (extra: Partial<Expense>): Expense => ({
  id: `e${++n}`, createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: 'Jantar no centro',
  categoryId: 'alim', subcategoryId: 'rest', methodId: 'visa', currency: 'USD', amount: 10000, ...extra,
})
const match = (e: Expense, f: ExpenseFilter) => matchesFilter(e, f, ctx)

describe('filtro da lista de gastos', () => {
  it('vai e volta pelo endereço', () => {
    const f: ExpenseFilter = { cat: ['alim', 'transp'], pessoa: ['ana'], fase: ['durante'], de: '2026-12-20', conferir: true, q: 'uber' }
    expect(parseFilter(filterToParams(f))).toEqual(f)
    expect(filterCount(f)).toBe(6)
    expect(parseFilter(new URLSearchParams('fase=x&de=ontem'))).toEqual({})
  })

  it('várias categorias; subcategoria escolhida restringe a categoria dela', () => {
    const jantar = expense({})
    const mercado = expense({ subcategoryId: 'merc' })
    const uber = expense({ categoryId: 'transp', subcategoryId: null })
    expect(match(jantar, { cat: ['alim', 'transp'] })).toBe(true)
    expect(match(uber, { cat: ['alim', 'transp'] })).toBe(true)
    expect(match(mercado, { cat: ['alim', 'rest'] })).toBe(false)
    expect(match(jantar, { cat: ['alim', 'rest'] })).toBe(true)
    expect(match(uber, { cat: ['alim', 'rest', 'transp'] })).toBe(true)
  })

  it('pessoa pagou ou participa', () => {
    const shared = expense({ payerId: 'joao', methodId: '', split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] } })
    expect(match(shared, { pessoa: ['ana'] })).toBe(true)
    expect(match(shared, { pessoa: ['joao'] })).toBe(true)
    expect(match(shared, { pessoa: ['leo'] })).toBe(false)
    expect(match(expense({}), { pessoa: ['eu'] })).toBe(true)
  })

  it('fase, datas, moeda e meio', () => {
    const pre = expense({ date: '2026-06-01', currency: 'BRL', methodId: 'pix' })
    expect(match(pre, { fase: ['antes'] })).toBe(true)
    expect(match(pre, { fase: ['durante'] })).toBe(false)
    expect(match(pre, { de: '2026-12-01' })).toBe(false)
    expect(match(pre, { moeda: ['USD'] })).toBe(false)
    expect(match(pre, { meio: ['pix', 'visa'] })).toBe(true)
  })

  it('a conferir na fatura, divididos e pagos por outros', () => {
    const estimado = expense({ brlAmount: 59202 })
    const conferido = expense({ brlAmount: 60000, brlConfirmed: true })
    expect(match(estimado, { conferir: true })).toBe(true)
    expect(match(conferido, { conferir: true })).toBe(false)
    const shared = expense({ split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] } })
    expect(match(shared, { divididos: true })).toBe(true)
    expect(match(estimado, { divididos: true })).toBe(false)
    const half = expense({ payers: [{ personId: 'eu', amount: 5000 }, { personId: 'ana', amount: 5000 }] })
    expect(match(half, { outros: true })).toBe(true)
    expect(match(estimado, { outros: true })).toBe(false)
  })

  it('busca por texto na descrição e nas categorias, sem acento', () => {
    expect(match(expense({}), { q: 'centro' })).toBe(true)
    expect(match(expense({ description: '' }), { q: 'alimentacao' })).toBe(true)
    expect(match(expense({}), { q: 'hotel' })).toBe(false)
  })
})
