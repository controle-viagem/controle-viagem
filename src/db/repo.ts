// Camada única de acesso a dados: as telas nunca gravam no banco diretamente.
import { BACKUP_TABLES, buildBackup, type Backup, type BackupTable } from '../domain/backup'
import { db } from './db'
import {
  ME, type Budget, type Category, type Expense, type PaymentMethod, type Receipt, type Settlement, type Trip, type WalletMove,
} from './types'

const now = () => new Date().toISOString()

export type Input<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

/**
 * Exclui registros deixando o registro de exclusão, para que a sincronização (quando existir) leve a exclusão
 * aos outros aparelhos. Toda exclusão de dado guardado passa por aqui.
 */
async function remove(table: BackupTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const deletedAt = now()
  await db.transaction('rw', db.table(table), db.deletions, async () => {
    await db.table(table).bulkDelete(ids)
    await db.deletions.bulkPut(ids.map((id) => ({ table, id, deletedAt })))
  })
}

/** Grava um registro novo (sem id) ou as alterações de um existente. */
async function save<T extends { id: string; createdAt: string; updatedAt: string }>(
  table: BackupTable,
  input: Input<T>,
): Promise<string> {
  if (input.id) {
    const { id, ...changes } = input
    await db.table(table).update(id, { ...changes, updatedAt: now() })
    return id
  }
  const id = crypto.randomUUID()
  await db.table(table).add({ ...input, id, createdAt: now(), updatedAt: now() })
  return id
}

// ---- Viagens ----

export const saveTrip = (input: Input<Trip>) => save<Trip>('trips', input)

/** Grava (ou tira, com undefined) o orçamento da viagem. */
export const setTripBudgets = (id: string, budgets: Budget[]) => db.trips.update(id, { budgets, budget: undefined, updatedAt: now() })

/** Encerra (só consulta, acertos liberados) ou reabre a viagem. */
export const setTripClosed = (id: string, closed: boolean) => db.trips.update(id, { closed, updatedAt: now() })

/** Exclui a viagem com todos os gastos, comprovantes, acertos e viajantes dela. */
export async function deleteTrip(id: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.expenses, db.settlements, db.people, db.receipts, db.deletions], async () => {
    await remove('receipts', await db.receipts.where('tripId').equals(id).primaryKeys())
    await remove('expenses', await db.expenses.where('tripId').equals(id).primaryKeys())
    await remove('settlements', await db.settlements.where('tripId').equals(id).primaryKeys())
    await remove('people', await db.people.where('tripId').equals(id).primaryKeys())
    await remove('trips', [id])
  })
}

// ---- Viajantes (pessoas de cada viagem) ----

export interface TravelerInput {
  /** Pessoa nova já vem com id gerado na tela, para os grupos poderem apontar para ela. */
  id: string
  name: string
}

/**
 * Grava os viajantes e os grupos de uma viagem: cria os novos, renomeia os existentes e exclui quem saiu da lista
 * (a tela só deixa tirar quem não está em nenhum gasto ou acerto). `meName` renomeia "Eu" (vale para todas).
 */
export async function saveTravelers(
  tripId: string,
  travelers: TravelerInput[],
  groups: Trip['groups'],
  meName?: string,
): Promise<void> {
  await db.transaction('rw', [db.people, db.trips, db.deletions], async () => {
    const stamp = now()
    const existing = await db.people.where('tripId').equals(tripId).primaryKeys()
    for (const t of travelers) {
      if (existing.includes(t.id)) await db.people.update(t.id, { name: t.name, updatedAt: stamp })
      else await db.people.add({ id: t.id, name: t.name, tripId, createdAt: stamp, updatedAt: stamp })
    }
    const ids = travelers.map((t) => t.id)
    await remove('people', existing.filter((id) => !ids.includes(id)))
    await db.trips.update(tripId, { groups, updatedAt: stamp })
    if (meName?.trim()) await db.people.update(ME, { name: meName.trim(), updatedAt: stamp })
  })
}

// ---- Acertos ----

export type SettlementInput = Omit<Settlement, 'id' | 'createdAt' | 'updatedAt' | 'batchId'>

/** Grava um acerto (uma linha por par de pessoas), substituindo o lote anterior quando é uma edição. */
export async function saveSettlementBatch(rows: SettlementInput[], batchId?: string): Promise<string> {
  const id = batchId ?? crypto.randomUUID()
  await db.transaction('rw', [db.settlements, db.deletions], async () => {
    if (batchId) await remove('settlements', await db.settlements.where('batchId').equals(batchId).primaryKeys())
    const stamp = now()
    await db.settlements.bulkAdd(rows.map((r) => ({ ...r, batchId: id, id: crypto.randomUUID(), createdAt: stamp, updatedAt: stamp })))
  })
  return id
}

export const deleteSettlementBatch = async (batchId: string) =>
  remove('settlements', await db.settlements.where('batchId').equals(batchId).primaryKeys())

// ---- Categorias ----

export const saveCategory = (input: Input<Category>) => save<Category>('categories', input)

/**
 * Altera nome, cor e ícone. Subcategorias que ainda usam a cor da categoria-mãe acompanham a
 * mudança de cor; as que já tiveram cor própria escolhida ficam como estão.
 */
export async function updateCategoryLook(
  category: Category,
  look: Pick<Category, 'name' | 'color' | 'icon'>,
): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await db.categories.update(category.id, { ...look, updatedAt: now() })
    if (!category.parentId && look.color !== category.color) {
      await db.categories
        .where('parentId')
        .equals(category.id)
        .filter((sub) => sub.color === category.color)
        .modify({ color: look.color, updatedAt: now() })
    }
  })
}

/** Exclui a categoria; se já houver gastos nela (ou nas subcategorias), apenas arquiva. */
export async function removeCategory(id: string): Promise<'excluida' | 'arquivada'> {
  return db.transaction('rw', [db.categories, db.expenses, db.deletions], async () => {
    const subIds = (await db.categories.where('parentId').equals(id).toArray()).map((c) => c.id)
    const used =
      (await db.expenses.where('categoryId').equals(id).count()) +
      (await db.expenses.where('subcategoryId').equals(id).count())
    if (used > 0) {
      await db.categories.update(id, { archived: true, updatedAt: now() })
      return 'arquivada'
    }
    await remove('categories', [id, ...subIds])
    return 'excluida'
  })
}

/** Desarquiva a categoria; uma subcategoria traz a categoria-mãe junto, senão continuaria escondida. */
export async function restoreCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const category = await db.categories.get(id)
    await db.categories.update(id, { archived: false, updatedAt: now() })
    if (category?.parentId) await db.categories.update(category.parentId, { archived: false, updatedAt: now() })
  })
}

// ---- Meios de pagamento ----

export const saveMethod = (input: Input<PaymentMethod>) => save<PaymentMethod>('paymentMethods', input)

/** Exclui o meio de pagamento; se já houver gastos ou movimentos de carteira com ele, apenas arquiva. */
export async function removeMethod(id: string): Promise<'excluida' | 'arquivada'> {
  const used =
    (await db.expenses.where('methodId').equals(id).count()) +
    (await db.walletMoves.where('walletId').equals(id).count()) +
    (await db.walletMoves.where('toWalletId').equals(id).count())
  if (used > 0) {
    await db.paymentMethods.update(id, { archived: true, updatedAt: now() })
    return 'arquivada'
  }
  await remove('paymentMethods', [id])
  return 'excluida'
}

export const restoreMethod = (id: string) => db.paymentMethods.update(id, { archived: false, updatedAt: now() })

// ---- Gastos ----

export const saveExpense = (input: Input<Expense>) => save<Expense>('expenses', input)

export const deleteExpense = (id: string) => deleteExpenses([id])

/** Exclui gastos com as fotos dos comprovantes deles. */
export async function deleteExpenses(ids: string[]): Promise<void> {
  await db.transaction('rw', [db.expenses, db.receipts, db.deletions], async () => {
    await remove('receipts', await db.receipts.where('expenseId').anyOf(ids).primaryKeys())
    await remove('expenses', ids)
  })
}

// ---- Comprovantes ----

export const addReceipt = (input: Input<Receipt>) => save<Receipt>('receipts', input)

export const removeReceipt = (id: string) => remove('receipts', [id])

/** Muda a categoria (e a subcategoria) de vários gastos de uma vez. */
export async function setCategoryMany(ids: string[], categoryId: string, subcategoryId: string | null): Promise<void> {
  const stamp = now()
  await db.expenses.where('id').anyOf(ids).modify({ categoryId, subcategoryId, updatedAt: stamp })
}

// ---- Movimentos de carteira ----

export const saveWalletMove = (input: Input<WalletMove>) => save<WalletMove>('walletMoves', input)

export const deleteWalletMove = (id: string) => remove('walletMoves', [id])

// ---- Valores deste aparelho ----

/** Viagem aberta neste aparelho. */
export const ACTIVE_TRIP = 'viagemAberta'
/** Último meio de pagamento usado, sugerido no próximo gasto. */
export const LAST_METHOD = 'ultimoMeio'
export const LAST_BACKUP = 'ultimoBackup'

export const setLocal = (key: string, value: unknown) => db.local.put({ key, value })

// ---- Backup ----

/** Tudo que está guardado no aparelho, pronto para virar arquivo de backup. */
export async function exportAll(): Promise<Backup> {
  const exportedAt = now()
  await db.local.put({ key: LAST_BACKUP, value: exportedAt })
  const data = {} as Record<BackupTable, unknown[]>
  for (const table of BACKUP_TABLES) data[table] = await db.table(table).toArray()
  return buildBackup(data, exportedAt)
}

/** Substitui todos os dados do aparelho pelos do backup. Tudo ou nada: se algo falhar, nada muda. */
export async function importAll(backup: Backup): Promise<void> {
  await db.transaction('rw', BACKUP_TABLES.map((table) => db.table(table)), async () => {
    for (const table of BACKUP_TABLES) {
      await db.table(table).clear()
      await db.table(table).bulkAdd(backup.data[table])
    }
  })
}

/** Apaga tudo e recria o banco só com os cadastros iniciais. */
export async function resetAll(): Promise<void> {
  await db.delete()
  await db.open()
}
