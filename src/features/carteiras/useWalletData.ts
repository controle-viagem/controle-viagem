import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Expense, PaymentMethod, Settlement, WalletMove } from '../../db/types'
import { ledger, type Ledger } from '../../domain/custoMedio'
import { spendId } from '../../domain/despesa'
import { payersOf } from '../../domain/rateio'
import { balances, type Balance, type WalletExpense } from '../../domain/saldoCarteira'

/** Saída de carteira num gasto: a parte que uma pessoa pagou com a carteira. */
export interface WalletSpend extends WalletExpense {
  expense: Expense
  personId: string
}

export interface WalletData {
  /** Carteiras cadastradas (minhas e dos pares), inclusive as arquivadas (para mostrar o histórico). */
  wallets: PaymentMethod[]
  moves: WalletMove[]
  /** Saídas de carteira nos gastos, de todas as viagens (as carteiras são globais), uma por pagador. */
  spends: WalletSpend[]
  /** Acertos pagos em moeda com carteira de saída ou de entrada controlada. */
  settlements: Settlement[]
  ledger: Ledger
  balances: Balance[]
  loaded: boolean
}

const EMPTY: WalletData = {
  wallets: [], moves: [], spends: [], settlements: [], ledger: ledger([], []), balances: [], loaded: false,
}

/** Carteiras, movimentos, gastos e acertos que passam por elas, com custo médio e saldos já calculados. */
export function useWalletData(): WalletData {
  const data = useLiveQuery(async () => {
    const wallets = await db.paymentMethods.where('kind').equals('carteira').toArray()
    const ids = new Set(wallets.map((w) => w.id))
    const [moves, expenses, settlements] = await Promise.all([
      db.walletMoves.toArray(),
      wallets.length ? db.expenses.toArray() : [],
      wallets.length ? db.settlements.filter((s) => !!(s.fromWalletId || s.toWalletId)).toArray() : [],
    ])
    wallets.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    // Cada pagador pode ter usado uma carteira diferente; só a parte dele sai dela.
    // Gasto a pagar ainda não saiu da carteira.
    const spends: WalletSpend[] = expenses.filter((e) => !e.pending).flatMap((e) =>
      payersOf(e)
        .filter((p) => p.amount > 0 && p.methodId && ids.has(p.methodId))
        .map((p) => ({
          id: spendId(e.id, p.personId), date: e.date, createdAt: e.createdAt, methodId: p.methodId!, currency: e.currency,
          amount: p.amount, expense: e, personId: p.personId,
        })),
    )
    return { wallets, moves, spends, settlements }
  }, [])
  if (!data) return EMPTY
  return {
    ...data,
    ledger: ledger(data.moves, data.spends, data.settlements),
    balances: balances(data.moves, data.spends, data.settlements),
    loaded: true,
  }
}
