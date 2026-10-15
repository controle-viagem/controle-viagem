// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Category, Person, Trip } from '../db/types'
import { buildReport, presetConfig } from '../domain/relatorio'
import { renderReportPdf } from './pdf'

const travelers: Person[] = [
  { id: 'eu', name: 'Eu', createdAt: '', updatedAt: '' },
  { id: 'ana', name: 'Ana', tripId: 'v', createdAt: '', updatedAt: '' },
]
const trip = {
  id: 'v', name: 'Orlando', destination: '', startDate: '2026-12-20', endDate: '2026-12-29', currencies: ['USD'], groups: [],
  archived: false, createdAt: '', updatedAt: '', budget: { personIds: ['eu'], total: 500000, byCategory: { alim: 20000 } },
} as Trip
const categories = new Map<string, Category>([
  ['alim', { id: 'alim', name: 'Alimentação', parentId: null, color: '#f97316', archived: false, createdAt: '', updatedAt: '' }],
])

describe('PDF da prestação de contas', () => {
  it('gera o arquivo com todas as seções, acentos e símbolos sem erro', () => {
    const model = buildReport(
      {
        trip, today: '2026-12-23', travelers, categories, walletCosts: new Map(), rateFor: () => 5.75,
        expenses: [{
          id: 'e', createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: 'Jantar à beira-mar ≈ ação',
          categoryId: 'alim', subcategoryId: null, methodId: '', payerId: 'ana', currency: 'USD', amount: 10000,
          split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] },
        }],
        settlements: [], wallets: [], moves: [], positions: [], moveCosts: new Map(),
      },
      presetConfig('completo', []),
    )
    const blob = renderReportPdf(model, 'Prestação de contas')
    expect(blob.size).toBeGreaterThan(3000)
  })
})

describe('PDF com comprovantes anexados', () => {
  it('acrescenta uma página por foto dos gastos incluídos', () => {
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
    const model = buildReport(
      {
        trip, today: '2026-12-23', travelers, categories, walletCosts: new Map(), rateFor: () => 5.75,
        expenses: [{
          id: 'e', createdAt: '', updatedAt: '', tripId: 'v', date: '2026-12-21', description: 'Jantar',
          categoryId: 'alim', subcategoryId: null, methodId: '', currency: 'USD', amount: 10000,
        }],
        settlements: [], wallets: [], moves: [], positions: [], moveCosts: new Map(),
      },
      { ...presetConfig('completo', []), sections: ['resumo'], anexos: true },
    )
    const photo = { dataUrl: jpeg, width: 1, height: 1 }
    const without = renderReportPdf(model, 'Relatório')
    const withPhotos = renderReportPdf(model, 'Relatório', new Map([['e', [photo, photo]], ['outro', [photo]]]))
    expect(withPhotos.size).toBeGreaterThan(without.size)
  })
})
