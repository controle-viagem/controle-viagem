import { CheckSquare, SlidersHorizontal, Tags, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { deleteExpenses } from '../../db/repo'
import { ME } from '../../db/types'
import { partBRL } from '../../domain/custoViagem'
import { filterCount, filterToParams, lancamentosLink, matchesFilter, parseFilter, type ExpenseFilter } from '../../domain/filtro'
import { dayNumber, PHASE_LABEL, phaseOf, type Phase } from '../../domain/viagem'
import { dayLabel, formatBRL, fullDate } from '../../lib/format'
import { NoTrip } from '../viagens/NoTrip'
import { CategoriaLoteModal } from './CategoriaLoteModal'
import { ExpenseRow } from './ExpenseRow'
import { FiltroModal } from './FiltroModal'
import { useTripData } from './useTripData'

// Atalho usado pelo Início e pelos gráficos: o filtro mora no endereço (`domain/filtro.ts`).
export { lancamentosLink }

/** Rótulos curtos dos filtros ativos, mostrados como "chips" acima da lista. */
function activeLabels(f: ExpenseFilter, names: (id: string) => string): { key: keyof ExpenseFilter; label: string }[] {
  const out: { key: keyof ExpenseFilter; label: string }[] = []
  if (f.cat?.length) out.push({ key: 'cat', label: f.cat.map(names).join(', ') })
  if (f.pessoa?.length) out.push({ key: 'pessoa', label: f.pessoa.map(names).join(', ') })
  if (f.meio?.length) out.push({ key: 'meio', label: f.meio.map(names).join(', ') })
  if (f.moeda?.length) out.push({ key: 'moeda', label: f.moeda.join(', ') })
  if (f.fase?.length) out.push({ key: 'fase', label: f.fase.map((x: Phase) => PHASE_LABEL[x]).join(', ') })
  if (f.de) out.push({ key: 'de', label: `de ${fullDate(f.de)}` })
  if (f.ate) out.push({ key: 'ate', label: `até ${fullDate(f.ate)}` })
  if (f.conferir) out.push({ key: 'conferir', label: 'A conferir na fatura' })
  if (f.divididos) out.push({ key: 'divididos', label: 'Divididos' })
  if (f.outros) out.push({ key: 'outros', label: 'Pagos por outros' })
  if (f.apagar) out.push({ key: 'apagar', label: 'A pagar' })
  if (f.q) out.push({ key: 'q', label: `"${f.q}"` })
  return out
}

export function LancamentosPage() {
  const { trip } = useApp()
  const { expenses, categories, methods, people, travelers, walletCosts, rateFor, receiptCounts, loaded } = useTripData(trip?.id)
  const [params, setParams] = useSearchParams()
  const [filtering, setFiltering] = useState(false)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [recategorizing, setRecategorizing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!trip) return loaded ? <NoTrip /> : null

  const filter = parseFilter(params)
  const apply = (f: ExpenseFilter) => setParams(filterToParams(f), { replace: true })
  const ctx = { trip, categories, wallet: walletCosts }
  const shown = expenses.filter((e) => matchesFilter(e, filter, ctx))

  // Totais = o que os gastos custam para mim (só a minha parte nos divididos), em reais.
  const mine = (e: (typeof shown)[number]) => partBRL(e, [ME], walletCosts, rateFor).brl
  const days: { date: string; items: typeof shown; total: number }[] = []
  for (const e of shown) {
    const last = days.at(-1)
    if (last?.date === e.date) {
      last.items.push(e)
      last.total += mine(e)
    } else days.push({ date: e.date, items: [e], total: mine(e) })
  }
  const total = shown.reduce((sum, e) => sum + mine(e), 0)
  const count = filterCount(filter)
  const nameOf = (id: string) => categories.get(id)?.name ?? methods.get(id)?.name ?? people.get(id)?.name ?? '—'
  const usedMethods = [...new Set(expenses.map((e) => e.methodId))].map((id) => methods.get(id)).filter((m) => !!m)
  const usedCurrencies = [...new Set(expenses.map((e) => e.currency))].sort()

  const selecting = selected !== null
  const chosen = shown.filter((e) => selected?.has(e.id))
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // Viagem encerrada: só consulta, sem seleção para excluir ou mudar.
  const locked = !!trip.closed

  return (
    <div className={`space-y-4 ${selecting ? 'pb-16' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Gastos</h1>
          <p className="truncate text-sm text-slate-500">{trip.name}</p>
        </div>
        {expenses.length > 0 && !locked && (
          <button className={`btn !px-3 ring-1 ${selecting ? 'btn-primary ring-slate-900' : 'btn-ghost ring-slate-200'}`} onClick={() => setSelected(selecting ? null : new Set())}>
            <CheckSquare size={16} /> <span className="hidden sm:inline">{selecting ? 'Cancelar seleção' : 'Selecionar'}</span>
          </button>
        )}
        {expenses.length > 0 && (
          <button className="btn btn-ghost !px-3 ring-1 ring-slate-200" onClick={() => setFiltering(true)}>
            <SlidersHorizontal size={16} /> Filtros
            {count > 0 && <span className="rounded-full bg-slate-900 px-1.5 text-[11px] font-bold text-white">{count}</span>}
          </button>
        )}
      </div>

      {count > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeLabels(filter, nameOf).map(({ key, label }) => (
            <button
              key={key}
              className="flex max-w-full items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-2 text-xs font-medium text-slate-700"
              onClick={() => apply({ ...filter, [key]: undefined })}
              aria-label={`Tirar o filtro ${label}`}
            >
              <span className="truncate">{label}</span> <X size={12} className="shrink-0" />
            </button>
          ))}
          <button className="text-xs font-medium text-slate-500 hover:underline" onClick={() => apply({})}>Limpar</button>
        </div>
      )}
      {filter.conferir && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
          Compras em moeda estrangeira no cartão que cobra em reais cujo valor em reais ainda é uma estimativa (cotação +
          spread + IOF). Abra o gasto e marque "Já conferi o valor cobrado" quando a fatura chegar.
        </p>
      )}

      {shown.length > 0 && (
        <p className="text-sm text-slate-500">
          {shown.length} {shown.length === 1 ? 'gasto' : 'gastos'} · seu custo <span className="font-semibold text-slate-900">{formatBRL(total)}</span>
          {selecting && ' · toque nos gastos para marcar'}
        </p>
      )}

      {days.map((day) => {
        const n = dayNumber(day.date, trip)
        return (
          <section key={day.date}>
            <div className="mb-1 flex items-baseline justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>
                {dayLabel(day.date)} · {n ? `Dia ${n}` : PHASE_LABEL[phaseOf(day.date, trip)]}
              </span>
              <span className="tabular-nums">{formatBRL(day.total)}</span>
            </div>
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {day.items.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  categories={categories}
                  methods={methods}
                  people={people}
                  walletCosts={walletCosts}
                  rateFor={rateFor}
                  receipts={receiptCounts.get(e.id)}
                  select={locked ? undefined : { active: selecting, selected: !!selected?.has(e.id), toggle: () => toggle(e.id), start: () => setSelected(new Set([e.id])) }}
                />
              ))}
            </div>
          </section>
        )
      })}

      {loaded && shown.length === 0 && (
        <p className="card p-6 text-center text-sm text-slate-500">
          {count > 0 ? 'Nenhum gasto com esse filtro.' : 'Nenhum gasto ainda. Toque no + para lançar o primeiro.'}
        </p>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-slate-200 bg-white px-4 py-2 shadow-lg md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <span className="min-w-0 flex-1 text-sm">
              <strong>{chosen.length}</strong> {chosen.length === 1 ? 'selecionado' : 'selecionados'}
              {chosen.length > 0 && <span className="text-slate-500"> · {formatBRL(chosen.reduce((s, e) => s + mine(e), 0))}</span>}
            </span>
            <button className="btn btn-ghost !px-2 text-xs" onClick={() => setSelected(new Set(shown.map((e) => e.id)))}>Todos</button>
            <button className="btn btn-ghost !px-2" disabled={chosen.length === 0} onClick={() => setRecategorizing(true)} aria-label="Mudar categoria">
              <Tags size={18} />
            </button>
            <button className="btn btn-danger !px-2" disabled={chosen.length === 0} onClick={() => setDeleting(true)} aria-label="Excluir selecionados">
              <Trash2 size={18} />
            </button>
            <button className="btn btn-ghost !px-2" onClick={() => setSelected(null)} aria-label="Cancelar seleção">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {filtering && (
        <FiltroModal
          filter={filter}
          categories={[...categories.values()].filter((c) => !c.archived)}
          methods={usedMethods}
          people={travelers}
          currencies={usedCurrencies}
          onApply={(f) => {
            apply(f)
            setFiltering(false)
          }}
          onClose={() => setFiltering(false)}
        />
      )}
      {recategorizing && (
        <CategoriaLoteModal
          ids={chosen.map((e) => e.id)}
          categories={[...categories.values()]}
          onDone={() => {
            setRecategorizing(false)
            setSelected(null)
          }}
          onClose={() => setRecategorizing(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Excluir gastos"
          message={`Excluir ${chosen.length} ${chosen.length === 1 ? 'gasto' : 'gastos'}? Isso não pode ser desfeito.`}
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteExpenses(chosen.map((e) => e.id))
            setDeleting(false)
            setSelected(null)
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  )
}
