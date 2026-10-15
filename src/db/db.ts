import Dexie, { type EntityTable, type Table } from 'dexie'
import { peoplePerTrip } from '../domain/migracao'
import type { Deletion } from '../domain/sync'
import { seedCategories, seedMe, seedMethods } from './seed'
import {
  ME, type Category, type Expense, type LocalValue, type PaymentMethod, type Person, type Setting, type Settlement,
  type Receipt, type Trip, type WalletMove,
} from './types'

export const db = new Dexie('controle-viagem') as Dexie & {
  people: EntityTable<Person, 'id'>
  settlements: EntityTable<Settlement, 'id'>
  trips: EntityTable<Trip, 'id'>
  categories: EntityTable<Category, 'id'>
  paymentMethods: EntityTable<PaymentMethod, 'id'>
  expenses: EntityTable<Expense, 'id'>
  walletMoves: EntityTable<WalletMove, 'id'>
  receipts: EntityTable<Receipt, 'id'>
  settings: EntityTable<Setting, 'key'>
  deletions: Table<Deletion, [string, string]>
  local: EntityTable<LocalValue, 'key'>
}

// Mudou o formato dos dados? Crie uma nova versão com migração; nunca edite uma versão já publicada.
db.version(1).stores({
  trips: 'id, startDate',
  categories: 'id, parentId',
  paymentMethods: 'id, kind',
  expenses: 'id, tripId, date, categoryId, subcategoryId, methodId',
  settings: 'key',
  // Registro de exclusões, para a futura sincronização não trazer de volta o que foi apagado.
  deletions: '[table+id]',
  // O que é só deste aparelho: não sincroniza nem entra no backup.
  local: 'key',
})

// 0.2.0: movimentos das carteiras multimoeda e espécie (tabela nova, nada a converter).
db.version(2).stores({
  walletMoves: 'id, date, walletId, toWalletId',
})

// 0.3.0: viajantes e acertos. Cria a pessoa "Eu"; as viagens existentes ficam com "Eu" como único viajante.
db.version(3)
  .stores({
    people: 'id',
    settlements: 'id, tripId, batchId, fromId, toId',
    expenses: 'id, tripId, date, categoryId, subcategoryId, methodId, payerId',
  })
  .upgrade(async (tx) => {
    if (!(await tx.table('people').get(ME))) await tx.table('people').add(seedMe())
    await tx.table('trips').toCollection().modify((trip: Record<string, unknown>) => {
      trip.travelerIds ??= [ME]
      trip.groups ??= []
    })
  })

// 0.4.0: cada viagem passa a ter as suas pessoas (`tripId`); quem estava em várias viagens vira uma cópia por
// viagem (`peoplePerTrip`). As viagens perdem `travelerIds` e ganham `closed`.
db.version(4)
  .stores({ people: 'id, tripId' })
  .upgrade(async (tx) => {
    const data = {
      people: await tx.table('people').toArray(),
      trips: await tx.table('trips').toArray(),
      expenses: await tx.table('expenses').toArray(),
      settlements: await tx.table('settlements').toArray(),
    }
    peoplePerTrip(data, () => crypto.randomUUID())
    for (const trip of data.trips) trip.closed ??= false
    await tx.table('people').clear()
    await tx.table('people').bulkAdd(data.people)
    await tx.table('trips').bulkPut(data.trips)
    await tx.table('expenses').bulkPut(data.expenses)
    await tx.table('settlements').bulkPut(data.settlements)
  })

// 0.7.0: fotos dos comprovantes (tabela nova, nada a converter).
db.version(5).stores({ receipts: 'id, expenseId, tripId' })

// Roda uma única vez, quando o banco é criado no aparelho.
db.on('populate', (tx) => {
  tx.table('categories').bulkAdd(seedCategories())
  tx.table('paymentMethods').bulkAdd(seedMethods())
  tx.table('people').add(seedMe())
})
