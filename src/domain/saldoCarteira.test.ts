import { describe, expect, it } from 'vitest'
import type { WalletMove } from '../db/types'
import { balances, balanceWarnings, chronological, type WalletExpense } from './saldoCarteira'

let n = 0
// Momento do cadastro: só precisa crescer na ordem em que os registros são criados.
const stamp = () => String(++n).padStart(6, '0')

const move = (extra: Partial<WalletMove>): WalletMove => ({
  id: `m${++n}`, createdAt: stamp(), updatedAt: '', kind: 'carga', date: '2026-12-01', walletId: 'wise',
  currency: 'USD', amount: 0, note: '', ...extra,
})

const spend = (extra: Partial<WalletExpense>): WalletExpense => ({
  id: `g${++n}`, createdAt: stamp(), date: '2026-12-21', methodId: 'wise', currency: 'USD', amount: 0, ...extra,
})

const find = (list: ReturnType<typeof balances>, walletId: string, currency = 'USD') =>
  list.find((b) => b.walletId === walletId && b.currency === currency)

describe('saldo das carteiras', () => {
  it('ordem cronológica: data, depois cadastro', () => {
    const b = move({ date: '2026-12-02' })
    const a = spend({ date: '2026-12-01' })
    const c = spend({ date: '2026-12-02' })
    expect(chronological([b], [c, a]).map((e) => (e.type === 'move' ? e.move.id : e.type === 'expense' ? e.expense.id : e.settlement.id))).toEqual([a.id, b.id, c.id])
  })

  it('soma cargas e tira gastos, conversões, transferências (com tarifa), ajustes e vendas', () => {
    const list = balances(
      [
        move({ amount: 100000, brlAmount: 570000 }),
        move({ kind: 'conversao', amount: 11000, toCurrency: 'EUR', toAmount: 10000 }),
        move({ kind: 'transferencia', amount: 20000, fee: 500, toWalletId: 'especie' }),
        move({ kind: 'ajuste', amount: -1500 }),
        move({ kind: 'venda', date: '2027-01-10', amount: 30000, brlAmount: 160000 }),
      ],
      [spend({ amount: 10000 }), spend({ methodId: 'especie', amount: 2000 })],
    )
    expect(find(list, 'wise')).toEqual({ walletId: 'wise', currency: 'USD', units: 27000, negativeOn: null })
    expect(find(list, 'wise', 'EUR')?.units).toBe(10000)
    expect(find(list, 'especie')?.units).toBe(18000)
    expect(balanceWarnings(list)).toEqual([])
  })

  it('avisa saldo negativo, inclusive quando a carga veio depois do gasto', () => {
    const list = balances(
      [move({ date: '2026-12-22', amount: 50000, brlAmount: 290000 })],
      [spend({ date: '2026-12-21', amount: 10000 }), spend({ methodId: 'especie', amount: 100 })],
    )
    expect(find(list, 'wise')).toMatchObject({ units: 40000, negativeOn: '2026-12-21' })
    expect(find(list, 'especie')).toMatchObject({ units: -100, negativeOn: '2026-12-21' })
    expect(balanceWarnings(list)).toHaveLength(2)
  })
})
