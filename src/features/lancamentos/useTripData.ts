import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../../db/db'
import { ME, type Category, type Expense, type PaymentMethod, type Person, type Settlement } from '../../db/types'
import { referenceRates, type RateLookup } from '../../domain/custoViagem'
import type { WalletCosts } from '../../domain/despesa'
import { useWalletData } from '../carteiras/useWalletData'

export interface TripData {
  expenses: Expense[]
  settlements: Settlement[]
  categories: Map<string, Category>
  methods: Map<string, PaymentMethod>
  /** "Eu" e as pessoas desta viagem, por id. */
  people: Map<string, Person>
  /** Viajantes: "Eu" primeiro, depois as pessoas desta viagem em ordem alfabética. */
  travelers: Person[]
  /** Quantas fotos de comprovante cada gasto tem. */
  receiptCounts: Map<string, number>
  /** Custo em reais dos gastos pagos por carteira (custo médio). */
  walletCosts: WalletCosts
  /** Cotação de referência por moeda e por quem paga: médio das carteiras dele, senão a última usada na viagem. */
  rateFor: RateLookup
  loaded: boolean
}

/** Gastos e acertos da viagem (mais recentes primeiro) e os cadastros para mostrá-los. */
export function useTripData(tripId: string | undefined): TripData {
  const wallet = useWalletData()
  const data = useLiveQuery(async () => {
    const [expenses, settlements, categories, methods, people] = await Promise.all([
      tripId ? db.expenses.where('tripId').equals(tripId).toArray() : [],
      tripId ? db.settlements.where('tripId').equals(tripId).toArray() : [],
      db.categories.toArray(),
      db.paymentMethods.toArray(),
      tripId ? db.people.where('tripId').equals(tripId).toArray() : [],
    ])
    const me = await db.people.get(ME)
    // Grupos da viagem: a cotação de referência de um grupo usa as carteiras dos membros.
    const groups = tripId ? ((await db.trips.get(tripId))?.groups ?? []) : []
    // Só as chaves do índice (o id do gasto de cada foto), sem carregar as imagens.
    const receiptKeys = tripId ? ((await db.receipts.where('tripId').equals(tripId).keys()) as string[]) : []
    const receiptCounts = new Map<string, number>()
    if (receiptKeys.length) {
      for (const id of (await db.receipts.where('expenseId').anyOf(expenses.map((e) => e.id)).keys()) as string[]) {
        receiptCounts.set(id, (receiptCounts.get(id) ?? 0) + 1)
      }
    }
    const travelers = [...(me ? [me] : []), ...people.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))]
    const recent = (a: { date: string; createdAt: string }, b: { date: string; createdAt: string }) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    expenses.sort(recent)
    settlements.sort(recent)
    return {
      expenses,
      settlements,
      categories: new Map(categories.map((c) => [c.id, c])),
      methods: new Map(methods.map((m) => [m.id, m])),
      people: new Map(travelers.map((p) => [p.id, p])),
      travelers,
      groups,
      receiptCounts,
    }
  }, [tripId])
  const walletCosts = wallet.ledger.expenseCosts
  const rateFor = useMemo(
    () => referenceRates(wallet.ledger.positions, data?.expenses ?? [], [...(data?.methods.values() ?? [])], data?.travelers ?? [], data?.groups ?? []),
    [wallet.ledger, data],
  )
  return data && wallet.loaded
    ? { ...data, walletCosts, rateFor, loaded: true }
    : {
        expenses: [], settlements: [], categories: new Map(), methods: new Map(), people: new Map(), travelers: [], receiptCounts: new Map(),
        walletCosts, rateFor, loaded: false,
      }
}
