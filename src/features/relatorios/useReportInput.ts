import type { Trip } from '../../db/types'
import type { ReportInput } from '../../domain/relatorio'
import { todayISO } from '../../lib/format'
import { useWalletData } from '../carteiras/useWalletData'
import { useTripData, type TripData } from '../lancamentos/useTripData'

/** Tudo o que o relatório e a prestação de contas precisam da viagem, já carregado. */
export function useReportInput(trip: Trip | undefined): { input: ReportInput | null; data: TripData } {
  const data = useTripData(trip?.id)
  const wallet = useWalletData()
  if (!trip || !data.loaded || !wallet.loaded) return { input: null, data }
  return {
    data,
    input: {
      trip,
      today: todayISO(),
      expenses: data.expenses,
      settlements: data.settlements,
      travelers: data.travelers,
      categories: data.categories,
      walletCosts: data.walletCosts,
      rateFor: data.rateFor,
      wallets: wallet.wallets,
      methods: data.methods,
      moves: wallet.moves,
      positions: wallet.ledger.positions,
      moveCosts: wallet.ledger.moveCosts,
      spends: wallet.spends.map((x) => ({ ...x, description: x.expense.description })),
      walletSettlements: wallet.settlements,
      settlementCosts: wallet.ledger.settlementCosts,
    },
  }
}
