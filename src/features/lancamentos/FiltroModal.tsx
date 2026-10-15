import { useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import type { Category, PaymentMethod, Person } from '../../db/types'
import type { ExpenseFilter } from '../../domain/filtro'
import { PHASE_LABEL, type Phase } from '../../domain/viagem'

interface Props {
  filter: ExpenseFilter
  categories: Category[]
  methods: PaymentMethod[]
  people: Person[]
  currencies: string[]
  onApply: (filter: ExpenseFilter) => void
  onClose: () => void
}

type ListKey = 'cat' | 'meio' | 'pessoa' | 'moeda' | 'fase'

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

function Chips({ options, value, onToggle }: { options: { id: string; label: string }[]; value: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{title}</span>
      {hint && <p className="-mt-0.5 mb-1.5 text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}

/** Janela com todos os critérios, cada um com várias opções. Só altera a lista ao tocar em "Aplicar". */
export function FiltroModal({ filter, categories, methods, people, currencies, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<ExpenseFilter>(filter)
  const set = (changes: Partial<ExpenseFilter>) => setDraft((d) => ({ ...d, ...changes }))
  function toggle(key: ListKey, id: string) {
    const current = (draft[key] ?? []) as string[]
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    set({ [key]: next.length ? next : undefined })
  }

  const tops = categories.filter((c) => !c.parentId).sort(byName)
  const chosenTops = tops.filter((c) => draft.cat?.includes(c.id))

  function submit(e: FormEvent) {
    e.preventDefault()
    const swapped = draft.de && draft.ate && draft.de > draft.ate
    onApply(swapped ? { ...draft, de: draft.ate, ate: draft.de } : draft)
  }

  const check = (key: 'conferir' | 'divididos' | 'outros' | 'apagar', label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-5 w-5 accent-slate-900" checked={!!draft[key]} onChange={(e) => set({ [key]: e.target.checked || undefined })} />
      <span>
        <span className="block font-medium text-slate-700">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  )

  return (
    <Modal title="Filtros" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Section title="Categorias">
          <Chips options={tops.map((c) => ({ id: c.id, label: c.name }))} value={draft.cat ?? []} onToggle={(id) => toggle('cat', id)} />
        </Section>
        {chosenTops.map((top) => {
          const subs = categories.filter((c) => c.parentId === top.id).sort(byName)
          if (subs.length === 0) return null
          return (
            <Section key={top.id} title={`Subcategorias de ${top.name}`} hint="Sem nenhuma marcada, vale a categoria inteira.">
              <Chips options={subs.map((c) => ({ id: c.id, label: c.name }))} value={draft.cat ?? []} onToggle={(id) => toggle('cat', id)} />
            </Section>
          )
        })}

        {people.length > 1 && (
          <Section title="Pessoas" hint="Gastos que a pessoa pagou ou de que participa.">
            <Chips options={people.map((p) => ({ id: p.id, label: p.name }))} value={draft.pessoa ?? []} onToggle={(id) => toggle('pessoa', id)} />
          </Section>
        )}

        {methods.length > 0 && (
          <Section title="Meios de pagamento">
            <Chips options={methods.map((m) => ({ id: m.id, label: m.name }))} value={draft.meio ?? []} onToggle={(id) => toggle('meio', id)} />
          </Section>
        )}

        {currencies.length > 1 && (
          <Section title="Moedas">
            <Chips options={currencies.map((c) => ({ id: c, label: c }))} value={draft.moeda ?? []} onToggle={(id) => toggle('moeda', id)} />
          </Section>
        )}

        <Section title="Fase">
          <Chips options={(Object.keys(PHASE_LABEL) as Phase[]).map((f) => ({ id: f, label: PHASE_LABEL[f] }))} value={draft.fase ?? []} onToggle={(id) => toggle('fase', id)} />
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ft-de">De</label>
            <input id="ft-de" type="date" className="field" value={draft.de ?? ''} onChange={(e) => set({ de: e.target.value || undefined })} />
          </div>
          <div>
            <label className="label" htmlFor="ft-ate">Até</label>
            <input id="ft-ate" type="date" className="field" value={draft.ate ?? ''} onChange={(e) => set({ ate: e.target.value || undefined })} />
          </div>
        </div>

        <div className="space-y-2">
          {check('conferir', 'A conferir na fatura', 'Compras no cartão em reais em outra moeda cujo valor em reais ainda é estimado.')}
          {check('divididos', 'Divididos', 'Gastos divididos com outras pessoas.')}
          {check('apagar', 'A pagar', 'Custos já conhecidos que ainda não foram pagos.')}
          {check('outros', 'Pagos por outras pessoas', 'Alguém além de você pagou o gasto (todo ou parte).')}
        </div>

        <div>
          <label className="label" htmlFor="ft-texto">Texto</label>
          <input id="ft-texto" className="field" placeholder="Procura na descrição e na categoria" value={draft.q ?? ''} maxLength={60} onChange={(e) => set({ q: e.target.value || undefined })} />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={() => onApply({})}>Limpar tudo</button>
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Aplicar</button>
        </div>
      </form>
    </Modal>
  )
}
