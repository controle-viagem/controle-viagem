// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import Dexie from 'dexie'
import {
  deleteSettlementBatch, deleteTrip, deleteWalletMove, exportAll, removeCategory, removeMethod, resetAll, saveExpense,
  saveMethod, saveSettlementBatch, saveTravelers, saveTrip, saveWalletMove, setCategoryMany, deleteExpenses, setTripClosed,
  addReceipt, deleteExpense,
} from './repo'

async function tripWithExpense() {
  const tripId = await saveTrip({
    name: 'Orlando', destination: 'EUA', startDate: '2026-12-20', endDate: '2027-01-03', currencies: ['USD'], groups: [], archived: false,
  })
  const category = (await db.categories.toArray()).find((c) => !c.parentId)!
  const method = (await db.paymentMethods.toArray())[0]
  const expenseId = await saveExpense({
    tripId, date: '2026-12-21', description: 'jantar', categoryId: category.id, subcategoryId: null,
    methodId: method.id, currency: 'BRL', amount: 10000,
  })
  return { tripId, expenseId, category, method }
}

describe('cadastros', () => {
  beforeEach(async () => {
    await resetAll()
  })

  it('banco novo já vem com categorias de viagem e meios de pagamento', async () => {
    const categories = await db.categories.toArray()
    expect(categories.some((c) => c.name === 'Hospedagem')).toBe(true)
    expect(categories.some((c) => c.name === 'Estacionamento' && c.parentId)).toBe(true)
    const card = (await db.paymentMethods.toArray()).find((m) => m.kind === 'cartao_brl')
    expect(card).toMatchObject({ iofPct: 3.5, spreadPct: 4 })
  })

  it('excluir a viagem leva os gastos junto e deixa registro das exclusões', async () => {
    const { tripId, expenseId } = await tripWithExpense()
    await deleteTrip(tripId)
    expect(await db.trips.count()).toBe(0)
    expect(await db.expenses.count()).toBe(0)
    const deleted = (await db.deletions.toArray()).map((d) => `${d.table}:${d.id}`).sort()
    expect(deleted).toEqual([`expenses:${expenseId}`, `trips:${tripId}`])
  })

  it('categoria e meio já usados são arquivados, não excluídos', async () => {
    const { category, method } = await tripWithExpense()
    expect(await removeCategory(category.id)).toBe('arquivada')
    expect((await db.categories.get(category.id))?.archived).toBe(true)
    expect(await removeMethod(method.id)).toBe('arquivada')
    const unused = (await db.paymentMethods.toArray()).find((m) => m.id !== method.id)!
    expect(await removeMethod(unused.id)).toBe('excluida')
  })

  it('carteira com movimentos é arquivada; movimentos entram no backup e deixam registro ao excluir', async () => {
    const walletId = await saveMethod({ name: 'Wise', kind: 'carteira', walletType: 'multimoeda', archived: false })
    const moveId = await saveWalletMove({
      kind: 'carga', date: '2026-12-01', walletId, currency: 'USD', amount: 100000, brlAmount: 570000, note: '',
    })
    expect((await exportAll()).data.walletMoves).toHaveLength(1)
    expect(await removeMethod(walletId)).toBe('arquivada')
    await deleteWalletMove(moveId)
    expect(await db.walletMoves.count()).toBe(0)
    expect(await db.deletions.get(['walletMoves', moveId])).toBeTruthy()
  })
})

describe('viajantes da viagem e acertos', () => {
  beforeEach(async () => {
    await resetAll()
  })

  const newTrip = () =>
    saveTrip({ name: 'Chile', destination: '', startDate: '2026-07-01', endDate: '2026-07-10', currencies: ['CLP'], groups: [], archived: false })

  it('banco novo já tem a pessoa "Eu", sem viagem', async () => {
    expect(await db.people.get('eu')).toMatchObject({ name: 'Eu' })
    expect((await db.people.get('eu'))?.tripId).toBeUndefined()
  })

  it('viajantes ficam na viagem: cria, renomeia, tira, grava grupos e o nome de "Eu"', async () => {
    const tripId = await newTrip()
    await saveTravelers(tripId, [{ id: 'ana', name: 'Ana' }, { id: 'leo', name: 'Léo' }], [{ id: 'g', name: 'Casal', memberIds: ['eu', 'ana'] }], 'Guilherme')
    expect((await db.people.where('tripId').equals(tripId).toArray()).map((p) => p.name).sort()).toEqual(['Ana', 'Léo'])
    expect((await db.people.get('eu'))?.name).toBe('Guilherme')
    expect((await db.trips.get(tripId))?.groups).toEqual([{ id: 'g', name: 'Casal', memberIds: ['eu', 'ana'] }])

    await saveTravelers(tripId, [{ id: 'ana', name: 'Ana Paula' }], [])
    expect((await db.people.where('tripId').equals(tripId).toArray()).map((p) => p.name)).toEqual(['Ana Paula'])
    expect(await db.deletions.get(['people', 'leo'])).toBeTruthy()

    // Excluir a viagem leva os viajantes dela; "Eu" fica.
    await deleteTrip(tripId)
    expect(await db.people.count()).toBe(1)
  })

  it('encerrar e reabrir a viagem', async () => {
    const tripId = await newTrip()
    await setTripClosed(tripId, true)
    expect((await db.trips.get(tripId))?.closed).toBe(true)
    await setTripClosed(tripId, false)
    expect((await db.trips.get(tripId))?.closed).toBe(false)
  })

  it('vários gastos de uma vez: mudar categoria e excluir', async () => {
    const { tripId, expenseId, category } = await tripWithExpense()
    const other = await saveExpense({ tripId, date: '2026-12-22', description: '', categoryId: category.id, subcategoryId: null, methodId: '', currency: 'BRL', amount: 500 })
    const target = (await db.categories.toArray()).find((c) => !c.parentId && c.id !== category.id)!
    await setCategoryMany([expenseId, other], target.id, null)
    expect((await db.expenses.toArray()).every((e) => e.categoryId === target.id)).toBe(true)
    await deleteExpenses([expenseId, other])
    expect(await db.expenses.count()).toBe(0)
  })

  it('acerto em lote: grava uma linha por pessoa, sai inteiro e vai junto com a viagem', async () => {
    const base = { tripId: 'v1', date: '2026-07-05', toId: 'eu', currency: 'USD', note: '' }
    const batch = await saveSettlementBatch([{ ...base, fromId: 'ana', amount: 1000 }, { ...base, fromId: 'joao', amount: 1000 }])
    expect(await db.settlements.where('batchId').equals(batch).count()).toBe(2)
    await deleteSettlementBatch(batch)
    expect(await db.settlements.count()).toBe(0)
    await saveSettlementBatch([{ ...base, fromId: 'ana', amount: 500 }])
    await deleteTrip('v1')
    expect(await db.settlements.count()).toBe(0)
  })
})

describe('migração do banco', () => {
  it('banco da 0.2.0 passa pela 0.3.0 e 0.4.0: ganha "Eu" e a viagem fica sem lista de viajantes', async () => {
    db.close()
    await Dexie.delete('controle-viagem')
    const old = new Dexie('controle-viagem')
    old.version(2).stores({
      trips: 'id, startDate', categories: 'id, parentId', paymentMethods: 'id, kind',
      expenses: 'id, tripId, date, categoryId, subcategoryId, methodId', settings: 'key', deletions: '[table+id]',
      local: 'key', walletMoves: 'id, date, walletId, toWalletId',
    })
    await old.table('trips').add({ id: 'v1', name: 'Orlando', startDate: '2026-12-20', endDate: '2027-01-03', currencies: ['USD'], archived: false })
    old.close()

    await db.open()
    const trip = await db.trips.get('v1')
    expect(trip).toMatchObject({ groups: [], closed: false })
    expect(trip && 'travelerIds' in trip).toBe(false)
    expect(await db.people.get('eu')).toMatchObject({ name: 'Eu' })
  })

  it('banco da 0.3.0: pessoa em duas viagens vira uma por viagem', async () => {
    db.close()
    await Dexie.delete('controle-viagem')
    const old = new Dexie('controle-viagem')
    old.version(3).stores({
      trips: 'id, startDate', categories: 'id, parentId', paymentMethods: 'id, kind',
      expenses: 'id, tripId, date, categoryId, subcategoryId, methodId, payerId', settings: 'key', deletions: '[table+id]',
      local: 'key', walletMoves: 'id, date, walletId, toWalletId', people: 'id', settlements: 'id, tripId, batchId, fromId, toId',
    })
    await old.table('people').bulkAdd([{ id: 'eu', name: 'Eu' }, { id: 'ana', name: 'Ana' }])
    await old.table('trips').bulkAdd([
      { id: 'v1', name: 'A', startDate: '2026-01-01', endDate: '2026-01-02', currencies: [], travelerIds: ['eu', 'ana'], groups: [] },
      { id: 'v2', name: 'B', startDate: '2026-02-01', endDate: '2026-02-02', currencies: [], travelerIds: ['eu', 'ana'], groups: [] },
    ])
    await old.table('expenses').add({ id: 'e2', tripId: 'v2', payerId: 'ana', amount: 100, currency: 'BRL', date: '2026-02-01' })
    old.close()

    await db.open()
    const anas = await db.people.filter((p) => p.name === 'Ana').toArray()
    expect(anas.map((p) => p.tripId).sort()).toEqual(['v1', 'v2'])
    const inV2 = anas.find((p) => p.tripId === 'v2')!
    expect((await db.expenses.get('e2'))?.payerId).toBe(inV2.id)
  })
})

describe('comprovantes', () => {
  beforeEach(async () => {
    await resetAll()
  })

  it('saem junto com o gasto e com a viagem, e entram no backup', async () => {
    const { tripId, expenseId } = await tripWithExpense()
    const other = await saveExpense({ tripId, date: '2026-12-22', description: '', categoryId: (await db.categories.toArray())[0].id, subcategoryId: null, methodId: '', currency: 'BRL', amount: 500 })
    const photo = { tripId, dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 20 }
    await addReceipt({ ...photo, expenseId })
    await addReceipt({ ...photo, expenseId: other })
    expect((await exportAll()).data.receipts).toHaveLength(2)
    await deleteExpense(expenseId)
    expect(await db.receipts.count()).toBe(1)
    await deleteTrip(tripId)
    expect(await db.receipts.count()).toBe(0)
  })
})
