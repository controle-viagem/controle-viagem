import { describe, expect, it } from 'vitest'
import type { Category, Expense, PaymentMethod, Person, Settlement, Trip } from '../db/types'
import { buildReport, presetConfig, SECTIONS, type ReportInput } from './relatorio'
import { ledger } from './custoMedio'
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
    // Tudo, menos as seções opcionais, desligadas por padrão: gastos previstos e extrato das carteiras.
    expect(SECTIONS.filter((s) => !r.config.sections.includes(s))).toEqual(['previstos', 'extrato'])
    expect(r.forecast).toBeUndefined()
  })

  it('por meio de pagamento: quanto cada pessoa escolhida pagou com cada meio', () => {
    const methods = new Map([['pix', { id: 'pix', name: 'Pix', kind: 'brl' } as PaymentMethod]])
    const r = buildReport({ ...input, methods }, { ...presetConfig('completo', []), personIds: ['eu', 'leo'], sections: ['meios'] })
    expect(r.methods).toEqual([
      { person: 'Eu', method: 'Pix', brl: 55000, estimated: false, count: 2 },
      { person: 'Léo', method: 'Outro meio (sem controle)', brl: 6000, estimated: false, count: 1 },
    ])
  })

  it('extrato das carteiras: por carteira e moeda, com saldo anterior e saldo corrido', () => {
    const wise = { id: 'wise', name: 'Wise', kind: 'carteira' } as PaymentMethod
    const carga = { id: 'c1', createdAt: '2', updatedAt: '', kind: 'carga' as const, date: '2026-12-19', walletId: 'wise', currency: 'USD', amount: 10000, brlAmount: 56000, note: '' }
    const lanche = { id: 'g:eu', createdAt: '1', date: '2026-12-21', methodId: 'wise', currency: 'USD', amount: 3000, description: 'Lanche' }
    const l = ledger([carga], [lanche])
    const withWallet = { ...input, wallets: [wise], moves: [carga], spends: [lanche], walletCosts: l.expenseCosts, moveCosts: l.moveCosts, settlementCosts: l.settlementCosts }
    const base = { ...presetConfig('completo', []), sections: ['extrato'] as typeof SECTIONS }
    expect(buildReport(withWallet, base).statements).toEqual([{
      wallet: 'Wise', holder: 'Eu', currency: 'USD', opening: 0, closing: 7000,
      lines: [
        { date: '2026-12-19', title: 'Carga', units: 10000, brl: 56000, balance: 10000 },
        { date: '2026-12-21', title: 'Lanche', units: -3000, brl: 16800, balance: 7000 },
      ],
    }])
    // Com período: a carga fica antes e vira o saldo anterior.
    expect(buildReport(withWallet, { ...base, de: '2026-12-20' }).statements?.[0]).toMatchObject({ opening: 10000, closing: 7000, lines: [{ title: 'Lanche' }] })
    // Seção opcional: fora do modelo Completo.
    expect(presetConfig('completo', []).sections).not.toContain('extrato')
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
