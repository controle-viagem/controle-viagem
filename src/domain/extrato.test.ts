import { describe, expect, it } from 'vitest'
import type { WalletMove } from '../db/types'
import { ledger } from './custoMedio'
import { balancesBefore, statementTitle, walletStatement } from './extrato'

let n = 0
const stamp = () => String(++n).padStart(6, '0')
const move = (extra: Partial<WalletMove>): WalletMove => ({
  id: `m${++n}`, createdAt: stamp(), updatedAt: '', kind: 'carga', date: '2026-12-01', walletId: 'wise', currency: 'USD', amount: 0, note: '', ...extra,
})

describe('extrato da carteira', () => {
  // Gasto lançado antes da recarga, no mesmo dia; depois conversão, transferência e acerto recebido.
  const lanche = { id: 'g1:eu', createdAt: stamp(), date: '2026-12-01', methodId: 'wise', currency: 'USD', amount: 3000, description: 'Lanche' }
  const recarga = move({ amount: 10000, brlAmount: 56000, note: 'Recarga' })
  const conversao = move({ kind: 'conversao', date: '2026-12-02', amount: 2000, toCurrency: 'EUR', toAmount: 1800 })
  const envio = move({ kind: 'transferencia', date: '2026-12-03', amount: 1000, toWalletId: 'nomad' })
  const recebido = { id: 's1', createdAt: stamp(), date: '2026-12-04', currency: 'USD', amount: 500, toWalletId: 'wise', note: 'Léo me pagou' }
  const moves = [recarga, conversao, envio]
  const l = ledger(moves, [lanche], [recebido])
  const lines = walletStatement('wise', moves, [lanche], [recebido], l)

  it('todos os movimentos, na ordem do custo médio, com saldo corrido por moeda', () => {
    expect(lines.map((x) => [x.date, x.kind, x.currency, x.units, x.balance])).toEqual([
      ['2026-12-01', 'carga', 'USD', 10000, 10000],
      ['2026-12-01', 'gasto', 'USD', -3000, 7000],
      ['2026-12-02', 'conversao', 'USD', -2000, 5000],
      ['2026-12-02', 'conversao', 'EUR', 1800, 1800],
      ['2026-12-03', 'transferencia', 'USD', -1000, 4000],
      ['2026-12-04', 'acerto', 'USD', 500, 4500],
    ])
  })

  it('em reais: o que a carga custou e o custo médio do que saiu', () => {
    expect(lines[0].brl).toBe(56000)
    expect(lines[1]).toMatchObject({ note: 'Lanche', brl: 16800 })
    expect(lines[2]).toMatchObject({ otherCurrency: 'EUR', brl: 11200 })
    expect(lines[4]).toMatchObject({ otherWalletId: 'nomad', brl: 5600 })
    expect(lines[5]).toMatchObject({ note: 'Léo me pagou', brl: 2800 })
  })

  it('a outra carteira só vê a sua parte; o saldo antes de uma data abre o extrato do período', () => {
    const nomad = walletStatement('nomad', moves, [lanche], [recebido], l)
    expect(nomad.map((x) => [x.kind, x.units, x.balance, x.otherWalletId])).toEqual([['transferencia', 1000, 1000, 'wise']])
    expect(balancesBefore(lines, '2026-12-03')).toEqual(new Map([['USD', 5000], ['EUR', 1800]]))
  })

  it('nome de cada linha', () => {
    const name = (id: string) => (id === 'nomad' ? 'Nomad' : 'Wise')
    expect(lines.map((x) => statementTitle(x, name))).toEqual([
      'Carga · Recarga', 'Lanche', 'Conversão para EUR', 'Conversão de USD', 'Transferência para Nomad', 'Acerto recebido · Léo me pagou',
    ])
  })
})
