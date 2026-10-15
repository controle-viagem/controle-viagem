import { ME, type Category, type Expense, type Trip } from '../db/types'
import { isEstimate, type WalletCosts } from './despesa'
import { paidBy, payersOf } from './rateio'
import { phaseOf, type Phase } from './viagem'

/** Critérios da lista de gastos. Listas = "qualquer um destes"; campo ausente = não filtra por ele. */
export interface ExpenseFilter {
  /** Categorias e subcategorias. Subcategoria escolhida restringe a categoria dela. */
  cat?: string[]
  meio?: string[]
  /** Pessoas que pagaram ou participam. */
  pessoa?: string[]
  moeda?: string[]
  fase?: Phase[]
  /** Intervalo de datas 'AAAA-MM-DD', inclusive. */
  de?: string
  ate?: string
  /** Compra no cartão em reais com o valor ainda estimado (não conferido na fatura). */
  conferir?: boolean
  divididos?: boolean
  /** Gastos em que outra pessoa pagou (tudo ou parte). */
  outros?: boolean
  /** Ainda não pagos. */
  apagar?: boolean
  q?: string
}

const PHASES: Phase[] = ['antes', 'durante', 'depois']
const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : undefined)
const isoDate = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)

// O filtro mora no endereço da tela (#/lancamentos?cat=a,b&pessoa=…): os atalhos do Início abrem a lista já
// filtrada e o "voltar" do aparelho funciona. Valores inválidos são ignorados.
export function parseFilter(params: URLSearchParams): ExpenseFilter {
  let de = isoDate(params.get('de'))
  let ate = isoDate(params.get('ate'))
  if (de && ate && de > ate) [de, ate] = [ate, de]
  const fase = list(params.get('fase'))?.filter((f): f is Phase => PHASES.includes(f as Phase))
  return {
    cat: list(params.get('cat')),
    meio: list(params.get('meio')),
    pessoa: list(params.get('pessoa')),
    moeda: list(params.get('moeda')),
    fase: fase?.length ? fase : undefined,
    de,
    ate,
    conferir: params.get('conferir') === '1' || undefined,
    divididos: params.get('divididos') === '1' || undefined,
    outros: params.get('outros') === '1' || undefined,
    apagar: params.get('apagar') === '1' || undefined,
    q: params.get('q')?.trim() || undefined,
  }
}

export function filterToParams(f: ExpenseFilter): URLSearchParams {
  const params = new URLSearchParams()
  const put = (key: string, value: string | undefined) => value && params.set(key, value)
  put('cat', f.cat?.join(','))
  put('meio', f.meio?.join(','))
  put('pessoa', f.pessoa?.join(','))
  put('moeda', f.moeda?.join(','))
  put('fase', f.fase?.join(','))
  put('de', f.de)
  put('ate', f.ate)
  put('conferir', f.conferir ? '1' : undefined)
  put('divididos', f.divididos ? '1' : undefined)
  put('outros', f.outros ? '1' : undefined)
  put('apagar', f.apagar ? '1' : undefined)
  put('q', f.q?.trim())
  return params
}

/** Endereço da lista de gastos já filtrada, para os atalhos das outras telas. */
export function lancamentosLink(filter: ExpenseFilter = {}): string {
  const query = filterToParams(filter).toString()
  return query ? `/lancamentos?${query}` : '/lancamentos'
}

/** Quantos critérios estão ativos. */
export const filterCount = (f: ExpenseFilter) =>
  Object.values(f).filter((v) => v !== undefined && !(Array.isArray(v) && v.length === 0)).length

export interface FilterContext {
  trip: Pick<Trip, 'startDate' | 'endDate'>
  categories: Map<string, Pick<Category, 'id' | 'name' | 'parentId'>>
  wallet: WalletCosts
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A pessoa pagou ou participa do gasto (sem divisão, o gasto é de "Eu"). */
export const involves = (e: Expense, personId: string) =>
  payersOf(e).some((p) => p.personId === personId) ||
  (e.split ? e.split.shares.some((s) => s.personId === personId) : personId === ME)

export function matchesFilter(e: Expense, f: ExpenseFilter, ctx: FilterContext): boolean {
  if (f.cat?.length) {
    const chosen = new Set(f.cat)
    const subsChosen = f.cat.filter((id) => ctx.categories.get(id)?.parentId === e.categoryId)
    // Com subcategoria escolhida dentro da categoria do gasto, vale só ela; senão, a categoria inteira.
    const ok = subsChosen.length > 0 ? !!e.subcategoryId && subsChosen.includes(e.subcategoryId) : chosen.has(e.categoryId)
    if (!ok) return false
  }
  // Meio de qualquer pagador: o meu ou o de outro viajante (cartão, carteira ou conta dele).
  if (f.meio?.length && !payersOf(e).some((p) => p.methodId && f.meio!.includes(p.methodId)) && !f.meio.includes(e.methodId)) return false
  if (f.pessoa?.length && !f.pessoa.some((id) => involves(e, id))) return false
  if (f.moeda?.length && !f.moeda.includes(e.currency)) return false
  if (f.fase?.length && !f.fase.includes(phaseOf(e.date, ctx.trip))) return false
  if (f.de && e.date < f.de) return false
  if (f.ate && e.date > f.ate) return false
  if (f.conferir && !isEstimate(e, ctx.wallet)) return false
  if (f.divididos && !e.split) return false
  if (f.outros && paidBy(e, ME) >= e.amount) return false
  if (f.apagar && !e.pending) return false
  if (f.q) {
    const names = [e.description, ctx.categories.get(e.categoryId)?.name, e.subcategoryId ? ctx.categories.get(e.subcategoryId)?.name : '']
    if (!plain(names.join(' ')).includes(plain(f.q))) return false
  }
  return true
}
