import { ME, type Category, type Expense, type PaymentMethod, type Person, type Settlement, type Trip, type WalletMove } from '../db/types'
import type { Position } from './custoMedio'
import { fullBRL, partBRL, type RateLookup } from './custoViagem'
import type { WalletCosts } from './despesa'
import { involves, matchesFilter } from './filtro'
import { budgetStatus, type BudgetStatus } from './orcamento'
import { partOf, payersOf } from './rateio'
import { summarize } from './resumo'
import { balances, parties, partyBalances, suggest } from './saldos'
import { holderLabel, walletsOf } from './titular'
import { daysBetween, tripDays } from './viagem'

/** Partes que o dono liga ou desliga na prestação de contas. */
export type SectionKey =
  | 'resumo' | 'categorias' | 'dias' | 'pessoas' | 'gastos' | 'saldos' | 'sugeridos' | 'acertos' | 'cambio' | 'carteiras' | 'orcamento'

export const SECTIONS: SectionKey[] = [
  'resumo', 'categorias', 'dias', 'pessoas', 'gastos', 'saldos', 'sugeridos', 'acertos', 'cambio', 'carteiras', 'orcamento',
]

export const SECTION_LABEL: Record<SectionKey, string> = {
  resumo: 'Resumo do custo',
  categorias: 'Por categoria',
  dias: 'Por dia',
  pessoas: 'Por pessoa',
  gastos: 'Lista de gastos',
  saldos: 'Saldos a acertar',
  sugeridos: 'Pagamentos que faltam',
  acertos: 'Acertos feitos',
  cambio: 'Câmbio, imposto e gorjeta',
  carteiras: 'Saldos das carteiras',
  orcamento: 'Orçamento',
}

export interface ReportConfig {
  /** De quem é o custo e para quem é o relatório. */
  personIds: string[]
  /** Gastos: só os que envolvem essas pessoas (pagaram ou participam) ou todos da viagem. */
  scope: 'envolvidos' | 'todos'
  de?: string
  ate?: string
  cat?: string[]
  sections: SectionKey[]
  /** Na lista de gastos: a parte dessas pessoas junto com o total, ou só o total. */
  valores: 'parte' | 'total'
  moeda: 'reais' | 'original' | 'ambas'
  /** Quem não foi escolhido: agrupado ("demais participantes", "outro viajante") ou com o nome. */
  nomes: 'agrupar' | 'mostrar'
  /** Anexar ao PDF as fotos dos comprovantes dos gastos incluídos. */
  anexos?: boolean
}

export type Preset = 'completo' | 'prestacao' | 'familia'

export const PRESET_LABEL: Record<Preset, string> = {
  completo: 'Completo (só para mim)',
  prestacao: 'Prestação de contas para…',
  familia: 'Família',
}

/** Configurações prontas; o dono ajusta a partir delas. */
export function presetConfig(preset: Preset, personIds: string[]): ReportConfig {
  const base = { scope: 'envolvidos' as const, valores: 'parte' as const, moeda: 'ambas' as const, nomes: 'agrupar' as const }
  if (preset === 'completo') return { ...base, personIds: [ME], sections: [...SECTIONS], nomes: 'mostrar' }
  if (preset === 'familia') {
    return { ...base, personIds, sections: ['resumo', 'categorias', 'dias', 'pessoas', 'gastos', 'saldos', 'sugeridos', 'acertos', 'cambio', 'carteiras', 'orcamento'] }
  }
  return { ...base, personIds, sections: ['resumo', 'categorias', 'gastos', 'saldos', 'sugeridos', 'acertos'] }
}

export interface ReportInput {
  trip: Trip
  today: string
  expenses: Expense[]
  settlements: Settlement[]
  travelers: Person[]
  categories: Map<string, Category>
  walletCosts: WalletCosts
  rateFor: RateLookup
  wallets: PaymentMethod[]
  moves: WalletMove[]
  positions: Position[]
  moveCosts: Map<string, number>
}

export interface ReportExpense {
  id: string
  date: string
  description: string
  category: string
  currency: string
  total: number
  /** Parte das pessoas escolhidas, na moeda do gasto. */
  part: number
  brlTotal: number
  brlPart: number
  estimated: boolean
  paidBy: string
  participants: string
  localTax: number
  tip: number
}

export interface ReportModel {
  tripName: string
  startDate: string
  endDate: string
  /** "Eu + Ana", para o cabeçalho. */
  forNames: string
  config: ReportConfig
  /** Gastos incluídos (com os filtros e a privacidade aplicados), na ordem: para anexar os comprovantes. */
  included: { id: string; date: string; description: string; currency: string; amount: number }[]
  summary?: {
    total: number
    estimated: number
    antes: number
    durante: number
    depois: number
    perDay: number | null
    projection: number
    days: number
    byCurrency: { currency: string; amount: number }[]
  }
  categories?: { id: string; name: string; color: string; total: number; share: number; subs: { name: string; total: number; share: number }[] }[]
  days?: { date: string; total: number }[]
  people?: { id: string; name: string; total: number }[]
  expenses?: ReportExpense[]
  balances?: { name: string; amounts: { currency: string; value: number }[] }[]
  transfers?: { from: string; to: string; currency: string; amount: number; brl: number | null }[]
  settlements?: { date: string; from: string; to: string; currency: string; amount: number; paid?: { currency: string; amount: number } }[]
  fx?: {
    cardIof: number
    cardSpread: number
    extras: { currency: string; localTax: number; tip: number }[]
    loads: { date: string; wallet: string; currency: string; amount: number; brl: number; rate: number; commercialRate?: number; spreadPct?: number; iofPct?: number }[]
  }
  wallets?: { name: string; holder: string; currency: string; units: number; avg: number | null; cost: number }[]
  budget?: BudgetStatus & { names: Map<string, string>; forNames: string }
}

const OTHER = 'outro viajante'

/**
 * Monta a prestação de contas só com dados, para a tela e para o PDF. Privacidade: com "só os que envolvem", nenhum
 * gasto ou acerto sem as pessoas escolhidas entra; com "agrupar", quem não foi escolhido (exceto "Eu") aparece sem
 * nome nos gastos.
 * Nos saldos, pagamentos e acertos o outro lado sempre tem nome (é a quem pagar ou de quem receber).
 */
export function buildReport(input: ReportInput, config: ReportConfig): ReportModel {
  const { trip, today, categories, walletCosts, rateFor } = input
  const chosen = new Set(config.personIds.length ? config.personIds : [ME])
  const personIds = [...chosen]
  const nameOf = new Map(input.travelers.map((p) => [p.id, p.name]))
  const realName = (id: string) => nameOf.get(id) ?? '—'
  // Quem emite ("Eu") sempre aparece com o nome: é a quem os outros pagam e de quem recebem.
  const shown = (id: string) => (id === ME || chosen.has(id) || config.nomes === 'mostrar' ? realName(id) : null)
  const has = (s: SectionKey) => config.sections.includes(s)
  const forNames = personIds.map(realName).join(' + ')

  const filter = { cat: config.cat, de: config.de, ate: config.ate }
  const ctx = { trip, categories, wallet: walletCosts }
  const expenses = input.expenses
    .filter((e) => matchesFilter(e, filter, ctx))
    .filter((e) => config.scope === 'todos' || personIds.some((id) => involves(e, id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

  const s = summarize(trip, expenses, today, walletCosts, { personIds, rateFor })
  function categoryNameOf(id: string) {
    return categories.get(id)?.name ?? '—'
  }
  const model: ReportModel = {
    tripName: trip.name, startDate: trip.startDate, endDate: trip.endDate, forNames, config,
    included: expenses.map((e) => ({ id: e.id, date: e.date, description: e.description || categoryNameOf(e.subcategoryId ?? e.categoryId), currency: e.currency, amount: e.amount })),
  }
  const categoryName = categoryNameOf

  if (has('resumo')) {
    model.summary = {
      total: s.total,
      estimated: s.estimated.total,
      antes: s.byPhase.antes,
      durante: s.byPhase.durante,
      depois: s.byPhase.depois,
      perDay: s.perDay,
      projection: s.perDay === null ? s.total : Math.max(s.total, s.byPhase.antes + s.byPhase.depois + Math.round(s.perDay * tripDays(trip))),
      days: tripDays(trip),
      byCurrency: s.byCurrency,
    }
  }
  if (has('categorias')) {
    model.categories = s.byCategory.map((c) => ({
      id: c.id,
      name: categoryName(c.id),
      color: categories.get(c.id)?.color ?? '#64748b',
      total: c.total,
      share: c.share,
      subs: c.subs.map((sub) => ({ name: sub.id ? categoryName(sub.id) : 'Sem subcategoria', total: sub.total, share: sub.share })),
    }))
  }
  if (has('dias')) model.days = s.byDay
  if (has('pessoas')) {
    const ids = config.scope === 'todos' && config.nomes === 'mostrar' ? input.travelers.map((p) => p.id) : personIds
    model.people = ids
      .map((id) => ({ id, name: realName(id), total: summarize(trip, expenses, today, walletCosts, { personIds: [id], rateFor }).total }))
      .sort((a, b) => b.total - a.total)
  }
  if (has('gastos')) {
    model.expenses = expenses.map((e) => {
      const full = fullBRL(e, walletCosts, rateFor)
      const part = partBRL(e, personIds, walletCosts, rateFor)
      const paidBy = [...new Set(payersOf(e).map((p) => shown(p.personId) ?? OTHER))].join(', ')
      const participantIds = e.split?.shares.map((x) => x.personId) ?? [ME]
      const visible = participantIds.map(shown).filter((n): n is string => !!n)
      const hidden = participantIds.length - visible.length
      const participants = [...visible, ...(hidden > 0 ? [`+${hidden} ${hidden === 1 ? 'pessoa' : 'pessoas'}`] : [])].join(', ')
      const sub = e.subcategoryId ? categories.get(e.subcategoryId)?.name : undefined
      return {
        id: e.id,
        date: e.date,
        description: e.description || sub || categoryName(e.categoryId),
        category: sub ? `${categoryName(e.categoryId)} / ${sub}` : categoryName(e.categoryId),
        currency: e.currency,
        total: e.amount,
        part: partOf(e, personIds),
        brlTotal: full.brl,
        brlPart: part.brl,
        estimated: full.estimated,
        paidBy,
        participants,
        localTax: e.localTax ?? 0,
        tip: e.tip ?? 0,
      }
    })
  }

  // Saldos, pagamentos e acertos valem para a viagem inteira (não dependem do período escolhido).
  const b = balances(input.expenses, input.settlements)
  if (has('saldos')) {
    const rows = personIds.map((id) => ({
      name: realName(id),
      amounts: [...(b.get(id) ?? [])].map(([currency, value]) => ({ currency, value })),
    }))
    if (personIds.length > 1) {
      const sum = new Map<string, number>()
      for (const id of personIds) for (const [c, v] of b.get(id) ?? []) sum.set(c, (sum.get(c) ?? 0) + v)
      rows.push({ name: `Total (${forNames})`, amounts: [...sum].filter(([, v]) => v !== 0).map(([currency, value]) => ({ currency, value })) })
    }
    model.balances = rows
  }
  if (has('sugeridos')) {
    const ids = [...new Set([...input.travelers.map((p) => p.id), ...b.keys()])]
    const list = parties(trip, ids, nameOf, true)
    const byId = new Map(list.map((p) => [p.id, p]))
    const touches = (partyId: string) => byId.get(partyId)?.memberIds.some((m) => chosen.has(m)) ?? false
    model.transfers = suggest(partyBalances(b, list))
      .filter((t) => touches(t.fromId) || touches(t.toId))
      .map((t) => {
        const rate = t.currency === 'BRL' ? null : rateFor(t.currency)
        return { from: byId.get(t.fromId)?.name ?? '—', to: byId.get(t.toId)?.name ?? '—', currency: t.currency, amount: t.amount, brl: rate ? Math.round(t.amount * rate) : null }
      })
  }
  if (has('acertos')) {
    const batches = new Map<string, Settlement[]>()
    for (const st of input.settlements) {
      if (!chosen.has(st.fromId) && !chosen.has(st.toId)) continue
      batches.set(st.batchId, [...(batches.get(st.batchId) ?? []), st])
    }
    model.settlements = [...batches.values()]
      .map((rows) => {
        const first = rows[0]
        const paid = rows.reduce((sum, r) => sum + (r.paidAmount ?? 0), 0)
        return {
          date: first.date,
          from: [...new Set(rows.map((r) => realName(r.fromId)))].join(' + '),
          to: [...new Set(rows.map((r) => realName(r.toId)))].join(' + '),
          currency: first.currency,
          amount: rows.reduce((sum, r) => sum + r.amount, 0),
          paid: first.paidCurrency ? { currency: first.paidCurrency, amount: paid } : undefined,
        }
      })
      .sort((a, b2) => a.date.localeCompare(b2.date))
  }

  // Carteiras das pessoas escolhidas (as minhas e as dos pares, pelo nome do titular).
  const people = input.travelers.filter((p) => chosen.has(p.id))
  const theirWallets = people.flatMap((p) => walletsOf(p, input.wallets))
  const walletIds = new Set(theirWallets.map((w) => w.id))
  const walletName = new Map(input.wallets.map((w) => [w.id, w.name]))
  if (has('cambio')) {
    model.fx = {
      cardIof: s.fx.iof,
      cardSpread: s.fx.spread,
      extras: s.extras,
      // Cargas até o fim da viagem, dos últimos seis meses antes dela.
      loads: input.moves
        .filter((m) => m.kind === 'carga' && walletIds.has(m.walletId) && m.date <= trip.endDate && daysBetween(m.date, trip.startDate) <= 180)
        .sort((a, b2) => a.date.localeCompare(b2.date))
        .map((m) => {
          const brl = input.moveCosts.get(m.id) ?? m.brlAmount ?? 0
          return {
            date: m.date, wallet: walletName.get(m.walletId) ?? '—', currency: m.currency, amount: m.amount, brl,
            rate: m.amount > 0 ? brl / m.amount : 0, commercialRate: m.rate, spreadPct: m.spreadPct, iofPct: m.iofPct,
          }
        }),
    }
  }
  if (has('carteiras')) {
    model.wallets = input.positions
      .filter((p) => walletIds.has(p.walletId) && p.units !== 0)
      .map((p) => {
        const w = theirWallets.find((x) => x.id === p.walletId)!
        return { name: w.name, holder: holderLabel(w), currency: p.currency, units: p.units, avg: p.avg, cost: p.cost }
      })
  }
  if (has('orcamento') && trip.budget) {
    const budgetSummary = summarize(trip, input.expenses, today, walletCosts, { personIds: trip.budget.personIds, rateFor })
    model.budget = {
      ...budgetStatus(trip.budget, budgetSummary, trip),
      names: new Map([...categories].map(([id, c]) => [id, c.name])),
      forNames: trip.budget.personIds.map(realName).join(' + '),
    }
  }
  return model
}
