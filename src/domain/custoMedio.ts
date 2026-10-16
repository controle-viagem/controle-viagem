import type { WalletMove } from '../db/types'
import { chronological, positionKey, type WalletExpense, type WalletSettlement } from './saldoCarteira'

/** Saldo de uma moeda numa carteira e quanto ele custou em reais. */
export interface Position {
  walletId: string
  currency: string
  /** Centésimos da moeda. */
  units: number
  /** Centavos de real. */
  cost: number
  /** Custo médio: reais por 1 unidade da moeda. null antes da primeira entrada. */
  avg: number | null
}

export interface Ledger {
  positions: Position[]
  /** Custo em reais (centavos) de cada gasto pago pela carteira, pelo custo médio do momento. */
  expenseCosts: Map<string, number>
  /**
   * Custo em reais de cada movimento: o que entrou (carga, ajuste para mais) ou o que saiu pelo custo
   * médio (conversão, transferência, venda, ajuste para menos).
   */
  moveCosts: Map<string, number>
  /** Custo em reais de cada acerto em moeda que passou por carteira: o que saiu pelo médio, ou o que entrou. */
  settlementCosts: Map<string, number>
}

class Book {
  units = 0
  cost = 0
  /** Fica com o último médio quando o saldo zera, para saídas sem saldo ainda terem um custo. */
  avg: number | null = null

  constructor(readonly walletId: string, readonly currency: string) {}

  add(units: number, cost: number) {
    this.units += units
    this.cost += cost
    if (this.units > 0) this.avg = this.cost / this.units
  }

  /** Tira unidades pelo custo médio e devolve o custo delas. Esvaziar leva o custo inteiro, sem sobra de arredondamento. */
  take(units: number): number {
    const avg = this.avg ?? 0
    const cost =
      this.units > 0 && units >= this.units
        ? this.cost + Math.round((units - this.units) * avg)
        : Math.round(units * avg)
    this.units -= units
    this.cost -= cost
    return cost
  }
}

/**
 * Custo médio móvel por carteira e moeda. Percorre tudo em ordem cronológica (data, depois cadastro):
 * carga soma unidades e reais pagos; gasto, venda, transferência e conversão saem pelo médio do momento;
 * transferência e conversão levam esse custo para o destino (a tarifa da transferência encarece o que chega).
 * Por ser recalculado do zero, editar algo antigo corrige tudo o que vem depois.
 */
export function ledger(moves: WalletMove[], expenses: WalletExpense[], settlements: WalletSettlement[] = []): Ledger {
  const books = new Map<string, Book>()
  const book = (walletId: string, currency: string) => {
    const key = positionKey(walletId, currency)
    let b = books.get(key)
    if (!b) books.set(key, (b = new Book(walletId, currency)))
    return b
  }
  const expenseCosts = new Map<string, number>()
  const moveCosts = new Map<string, number>()
  const settlementCosts = new Map<string, number>()

  for (const event of chronological(moves, expenses, settlements)) {
    if (event.type === 'expense') {
      const e = event.expense
      expenseCosts.set(e.id, book(e.methodId, e.currency).take(e.amount))
      continue
    }
    if (event.type === 'settlement') {
      // Acerto em moeda: só controle de saldo. Sai pelo médio de quem pagou; entra com esse custo (como uma
      // transferência) ou, sem carteira de saída controlada, pelo médio de quem recebe (o médio não muda).
      const s = event.settlement
      const cost = s.fromWalletId ? book(s.fromWalletId, s.currency).take(s.amount) : undefined
      let received: number | undefined
      if (s.toWalletId) {
        const to = book(s.toWalletId, s.currency)
        received = cost ?? Math.round(s.amount * (to.avg ?? 0))
        to.add(s.amount, received)
      }
      settlementCosts.set(s.id, cost ?? received ?? 0)
      continue
    }
    const m = event.move
    const from = book(m.walletId, m.currency)
    let cost: number
    switch (m.kind) {
      case 'carga':
        cost = m.brlAmount ?? 0
        from.add(m.amount, cost)
        break
      case 'ajuste':
        if (m.amount >= 0) {
          // Sem custo informado, o que aparece entra pelo médio (não muda o médio).
          cost = m.brlAmount ?? Math.round(m.amount * (from.avg ?? 0))
          from.add(m.amount, cost)
        } else cost = from.take(-m.amount)
        break
      case 'venda':
        cost = from.take(m.amount)
        break
      case 'conversao':
        cost = from.take(m.amount)
        book(m.walletId, m.toCurrency ?? '').add(m.toAmount ?? 0, cost)
        break
      case 'transferencia':
        cost = from.take(m.amount + (m.fee ?? 0))
        book(m.toWalletId ?? '', m.currency).add(m.amount, cost)
        break
    }
    moveCosts.set(m.id, cost)
  }

  const positions = [...books.values()].map(({ walletId, currency, units, cost, avg }) => ({
    walletId,
    currency,
    units,
    cost,
    avg: units > 0 ? cost / units : avg,
  }))
  return { positions, expenseCosts, moveCosts, settlementCosts }
}

/**
 * Total e médio de cada moeda nas posições indicadas (ex.: as carteiras de um viajante), **só com saldo positivo**:
 * carteira zerada ou negativa (falta lançar carga) não entra, para não distorcer o médio.
 */
export function positiveByCurrency(positions: Position[]): Omit<Position, 'walletId'>[] {
  const out = new Map<string, Omit<Position, 'walletId'>>()
  for (const p of positions) {
    if (p.units <= 0) continue
    let c = out.get(p.currency)
    if (!c) out.set(p.currency, (c = { currency: p.currency, units: 0, cost: 0, avg: null }))
    c.units += p.units
    c.cost += p.cost
  }
  for (const c of out.values()) c.avg = c.units > 0 ? c.cost / c.units : null
  return [...out.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

/** Resultado da venda da sobra: recebido menos o custo médio do que foi vendido (negativo = prejuízo). */
export const saleResult = (move: Pick<WalletMove, 'id' | 'brlAmount'>, l: Pick<Ledger, 'moveCosts'>) =>
  (move.brlAmount ?? 0) - (l.moveCosts.get(move.id) ?? 0)
