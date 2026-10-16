import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { CategoryIcon } from '../../components/CategoryIcon'
import { Modal } from '../../components/Modal'
import { MoneyInput } from '../../components/MoneyInput'
import { setTripBudgets } from '../../db/repo'
import type { Category, Trip } from '../../db/types'
import { budgetFor, withBudget } from '../../domain/orcamento'

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

/**
 * Limite total e por categoria, em reais, para o custo das pessoas escolhidas no "Custo de" (cada conjunto de
 * pessoas tem o seu orçamento, decisão do dono na 1.4.0).
 */
export function OrcamentoEditor({ trip, personIds, names, categories, onClose }: { trip: Trip; personIds: string[]; names: string; categories: Category[]; onClose: () => void }) {
  const current = budgetFor(trip, personIds)
  const [total, setTotal] = useState(current?.total ?? 0)
  const [byCategory, setByCategory] = useState<Record<string, number>>(current?.byCategory ?? {})
  const tops = categories.filter((c) => !c.parentId && (!c.archived || byCategory[c.id])).sort(byName)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const limits = Object.fromEntries(Object.entries(byCategory).filter(([, v]) => v > 0))
    const budget = total > 0 || Object.keys(limits).length ? { personIds, total: total || undefined, byCategory: limits } : undefined
    await setTripBudgets(trip.id, withBudget(trip, personIds, budget))
    onClose()
  }

  return (
    <Modal title="Orçamento" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Para o custo de <strong className="text-slate-900">{names}</strong>. Outra combinação de pessoas no "Custo de" tem o
          seu próprio orçamento.
        </p>
        <div>
          <label className="label" htmlFor="orc-total">Limite total (opcional)</label>
          <MoneyInput id="orc-total" value={total} onChange={setTotal} />
        </div>
        <div>
          <span className="label">Limite por categoria (opcional)</span>
          <ul className="space-y-1.5">
            {tops.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <CategoryIcon category={c} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <MoneyInput
                  className="field !w-36 !py-1 text-right text-sm"
                  aria-label={`Limite de ${c.name}`}
                  value={byCategory[c.id] ?? 0}
                  onChange={(v) => setByCategory((b) => ({ ...b, [c.id]: v }))}
                />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Em reais. Aviso a partir de 80% do limite; vermelho quando passa.</p>
        </div>
        <div className="flex gap-2 pt-2">
          {current && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                await setTripBudgets(trip.id, withBudget(trip, personIds))
                onClose()
              }}
            >
              <Trash2 size={16} /> Tirar orçamento
            </button>
          )}
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}
