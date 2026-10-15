import { ME, type Expense, type Payer, type Split } from '../db/types'

type Paid = Pick<Expense, 'payerId' | 'payers' | 'amount'> & Partial<Pick<Expense, 'methodId'>>

/**
 * Quem pagou, quanto e com qual meio: vários pagadores (`payers`) ou um só (`payerId`, ausente = "Eu") com o total e o
 * `methodId` do gasto. Gastos antigos com vários pagadores guardavam só o meu meio, em `methodId`.
 */
export const payersOf = (e: Paid): Payer[] =>
  e.payers && e.payers.length > 0
    ? e.payers.map((p) => ({ ...p, methodId: p.methodId ?? (p.personId === ME ? e.methodId || undefined : undefined) }))
    : [{ personId: e.payerId ?? ME, amount: e.amount, methodId: e.methodId || undefined }]

/** Pagador principal: o primeiro da lista. Recebe os centavos que sobram na divisão. */
export const payerOf = (e: Paid) => payersOf(e)[0].personId

/** Quanto a pessoa pagou do gasto (centésimos da moeda do gasto). */
export const paidBy = (e: Paid, personId: string) =>
  payersOf(e).reduce((sum, p) => sum + (p.personId === personId ? p.amount : 0), 0)

/** Problema com os valores de cada pagador; null quando somam o total. */
export function payersError(amount: number, payers: Payer[] | undefined): string | null {
  if (!payers || payers.length < 2) return null
  const sum = payers.reduce((total, p) => total + p.amount, 0)
  if (sum === amount) return null
  return sum < amount ? 'O que cada um pagou soma menos que o total.' : 'O que cada um pagou soma mais que o total.'
}

/**
 * Parte de cada pessoa, em centésimos da moeda do gasto. Sem divisão, tudo é de "Eu".
 * Igual e cotas: proporcional ao peso, arredondando para baixo; os centavos que sobram vão um a um para o
 * pagador (se ele participa) e depois para os demais, na ordem da lista. Valores: as partes informadas.
 */
export function sharesOf(amount: number, split: Split | undefined, payerId: string = ME): Map<string, number> {
  if (!split || split.shares.length === 0) return new Map([[ME, amount]])
  if (split.mode === 'valores') return new Map(split.shares.map((s) => [s.personId, s.amount ?? 0]))

  const weights = split.shares.map((s) => (split.mode === 'cotas' ? Math.max(0, s.weight ?? 1) : 1))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  if (totalWeight <= 0) return new Map(split.shares.map((s) => [s.personId, 0]))
  const parts = split.shares.map((s, i) => ({ id: s.personId, value: Math.floor((amount * weights[i]) / totalWeight), w: weights[i] }))
  let left = amount - parts.reduce((sum, p) => sum + p.value, 0)
  const order = [...parts.filter((p) => p.id === payerId), ...parts.filter((p) => p.id !== payerId)].filter((p) => p.w > 0)
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) order[i].value++
  return new Map(parts.map((p) => [p.id, p.value]))
}

/** Problema que impede salvar a divisão; null quando está certa. */
export function splitError(amount: number, split: Split | undefined): string | null {
  if (!split) return null
  if (split.shares.length === 0) return 'Escolha quem participa do gasto.'
  if (split.mode === 'cotas' && split.shares.every((s) => !(s.weight && s.weight > 0))) return 'Informe as cotas de quem participa.'
  if (split.mode === 'valores') {
    const sum = split.shares.reduce((total, s) => total + (s.amount ?? 0), 0)
    if (sum !== amount) return sum < amount ? 'As partes somam menos que o total do gasto.' : 'As partes somam mais que o total do gasto.'
  }
  return null
}

/** Quanto do gasto cabe às pessoas indicadas (soma das partes delas), em centésimos da moeda do gasto. */
export function partOf(e: Pick<Expense, 'amount' | 'split' | 'payerId' | 'payers'>, personIds: readonly string[]): number {
  const shares = sharesOf(e.amount, e.split, payerOf(e))
  return personIds.reduce((sum, id) => sum + (shares.get(id) ?? 0), 0)
}
