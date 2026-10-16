import { describe, expect, it } from 'vitest'
import type { WalletMove } from '../db/types'
import { ledger, positiveByCurrency, saleResult } from './custoMedio'
import { balances, type WalletExpense } from './saldoCarteira'

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

// US$ 1.000 por R$ 5.700 e US$ 500 por R$ 2.925.
const loads = [
  move({ amount: 100000, brlAmount: 570000 }),
  move({ date: '2026-12-10', amount: 50000, brlAmount: 292500 }),
]

const pos = (l: ReturnType<typeof ledger>, walletId: string, currency = 'USD') =>
  l.positions.find((p) => p.walletId === walletId && p.currency === currency)

describe('custo médio móvel', () => {
  it('duas cargas dão médio 5,75 e um gasto de US$ 100 custa R$ 575', () => {
    const jantar = spend({ amount: 10000 })
    const l = ledger(loads, [jantar])
    expect(l.expenseCosts.get(jantar.id)).toBe(57500)
    expect(pos(l, 'wise')).toEqual({ walletId: 'wise', currency: 'USD', units: 140000, cost: 805000, avg: 5.75 })
  })

  it('o gasto sai pelo médio do momento: antes da segunda carga, vale só a primeira', () => {
    const cedo = spend({ date: '2026-12-05', amount: 10000 })
    const l = ledger(loads, [cedo])
    expect(l.expenseCosts.get(cedo.id)).toBe(57000)
    // Restam US$ 900 a 5,70 + US$ 500 a 5,85 = R$ 8.055 por US$ 1.400.
    expect(pos(l, 'wise')).toMatchObject({ units: 140000, cost: 805500 })
  })

  it('no mesmo dia vale a ordem de cadastro', () => {
    const mesmoDia = spend({ date: '2026-12-10', amount: 10000 })
    const depois = move({ date: '2026-12-10', amount: 100000, brlAmount: 600000 })
    const l = ledger([...loads, depois], [mesmoDia])
    // Lançado depois da carga do dia 10 e antes da carga de 6,00: médio 5,75.
    expect(l.expenseCosts.get(mesmoDia.id)).toBe(57500)
  })

  it('editar uma carga antiga recalcula os gastos depois dela', () => {
    const jantar = spend({ amount: 10000 })
    const corrigida = [{ ...loads[0], brlAmount: 580000 }, loads[1]]
    // (5.800 + 2.925) / 1.500 = 5,8166…
    expect(ledger(corrigida, [jantar]).expenseCosts.get(jantar.id)).toBe(58167)
  })

  it('esvaziar a carteira leva o custo inteiro, sem sobra de arredondamento', () => {
    const terco = move({ amount: 30000, brlAmount: 100000 })
    const tudo = [spend({ amount: 10000 }), spend({ amount: 10000 }), spend({ amount: 10000 })]
    const l = ledger([terco], tudo)
    const costs = tudo.map((g) => l.expenseCosts.get(g.id) ?? 0)
    expect(costs[0]).toBe(33333)
    expect(costs.reduce((a, b) => a + b, 0)).toBe(100000)
    expect(pos(l, 'wise')).toMatchObject({ units: 0, cost: 0 })
  })

  it('transferência leva o custo para o destino e a tarifa encarece o que chega', () => {
    const saque = move({ kind: 'transferencia', date: '2026-12-15', amount: 20000, fee: 500, toWalletId: 'especie' })
    const taxi = spend({ methodId: 'especie', amount: 4000 })
    const l = ledger([...loads, saque], [taxi])
    // US$ 205 saem a 5,75 = R$ 1.178,75; chegam US$ 200, médio 5,894.
    expect(l.moveCosts.get(saque.id)).toBe(117875)
    expect(pos(l, 'wise')).toMatchObject({ units: 129500, cost: 744625, avg: 5.75 })
    expect(pos(l, 'especie')?.avg).toBeCloseTo(5.894, 3)
    expect(l.expenseCosts.get(taxi.id)).toBe(23575)
  })

  it('conversão entre moedas leva o custo para a moeda recebida', () => {
    const troca = move({ kind: 'conversao', date: '2026-12-15', amount: 11000, toCurrency: 'EUR', toAmount: 10000 })
    const l = ledger([...loads, troca], [])
    expect(l.moveCosts.get(troca.id)).toBe(63250)
    expect(pos(l, 'wise', 'EUR')).toEqual({ walletId: 'wise', currency: 'EUR', units: 10000, cost: 63250, avg: 6.325 })
  })

  it('venda da sobra: sai pelo médio e mostra o ganho ou a perda', () => {
    const venda = move({ kind: 'venda', date: '2027-01-10', amount: 10000, brlAmount: 55000 })
    const l = ledger([...loads, venda], [])
    expect(l.moveCosts.get(venda.id)).toBe(57500)
    expect(saleResult(venda, l)).toBe(-2500)
  })

  it('ajuste: para menos sai pelo médio; para mais entra pelo custo informado ou pelo médio', () => {
    const perdi = move({ kind: 'ajuste', date: '2026-12-15', amount: -10000 })
    const achei = move({ kind: 'ajuste', date: '2026-12-16', amount: 2000 })
    const sobra = move({ kind: 'ajuste', date: '2026-12-17', amount: 10000, brlAmount: 0 })
    const l = ledger([...loads, perdi, achei, sobra], [])
    expect(l.moveCosts.get(perdi.id)).toBe(57500)
    expect(l.moveCosts.get(achei.id)).toBe(11500)
    expect(l.moveCosts.get(sobra.id)).toBe(0)
    expect(pos(l, 'wise')).toMatchObject({ units: 152000, cost: 816500 })
  })

  it('gasto sem saldo usa o último médio; sem nenhuma carga, custo zero', () => {
    const l = ledger([move({ amount: 10000, brlAmount: 57500 })], [spend({ amount: 10000 }), spend({ id: 'extra', amount: 5000 })])
    expect(l.expenseCosts.get('extra')).toBe(28750)
    expect(pos(l, 'wise')).toMatchObject({ units: -5000, avg: 5.75 })
    const vazio = spend({ methodId: 'nova', amount: 1000 })
    expect(ledger([], [vazio]).expenseCosts.get(vazio.id)).toBe(0)
  })

  it('total por moeda soma só as carteiras com saldo positivo', () => {
    const casaDeCambio = move({ walletId: 'especie', amount: 50000, brlAmount: 300000 })
    // Carteira sem carga, com um gasto: saldo negativo, fica de fora do total e do médio.
    const semCarga = spend({ id: 'sem-carga', methodId: 'revolut', amount: 30000 })
    const l = ledger([...loads, casaDeCambio], [semCarga])
    expect(positiveByCurrency(l.positions)).toEqual([{ currency: 'USD', units: 200000, cost: 1162500, avg: 5.8125 }])
  })
})

describe('acertos em moeda nas carteiras', () => {
  const at = (id: string, date: string) => ({ id, date, createdAt: `${date}T00:00:00Z` })
  const load = { ...at('c1', '2026-12-01'), kind: 'carga' as const, walletId: 'wise', currency: 'USD', amount: 50000, brlAmount: 287500, note: '', updatedAt: '' }

  it('gasto de US$ 500 dividido por 5 tira os 500 da minha carteira; o Léo me paga US$ 100 em espécie', () => {
    const spend = { ...at('g:eu', '2026-12-02'), methodId: 'wise', currency: 'USD', amount: 50000 }
    const cashLoad = { ...at('c2', '2026-12-01'), kind: 'carga' as const, walletId: 'especie', currency: 'USD', amount: 10000, brlAmount: 60000, note: '', updatedAt: '' }
    const paid = { ...at('s1', '2026-12-03'), currency: 'USD', amount: 10000, toWalletId: 'especie' }
    const b = balances([load, cashLoad], [spend], [paid])
    expect(b.find((x) => x.walletId === 'wise')?.units).toBe(0)
    expect(b.find((x) => x.walletId === 'especie')?.units).toBe(20000)
    // Entra pelo médio da espécie (6,00): o médio não muda.
    const l = ledger([load, cashLoad], [spend], [paid])
    expect(l.positions.find((p) => p.walletId === 'especie')?.avg).toBe(6)
  })

  it('entre duas carteiras controladas, funciona como transferência (leva o custo de quem pagou)', () => {
    const paid = { ...at('s1', '2026-12-03'), currency: 'USD', amount: 10000, fromWalletId: 'wise', toWalletId: 'wise-ana' }
    const l = ledger([load], [], [paid])
    expect(l.positions.find((p) => p.walletId === 'wise-ana')).toMatchObject({ units: 10000, cost: 57500 })
    expect(l.positions.find((p) => p.walletId === 'wise')).toMatchObject({ units: 40000, cost: 230000 })
  })

  it('acerto sem carteira controlada não mexe em nada', () => {
    expect(balances([load], [], [{ ...at('s1', '2026-12-03'), currency: 'USD', amount: 10000 }])).toHaveLength(1)
  })
})
