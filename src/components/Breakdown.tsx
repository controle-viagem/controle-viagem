import { CreditCard, PiggyBank } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatBRL } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Avatar } from './Badges'
import { CHART_THEME } from './chartTheme'
import { VALUE_STYLE } from './valueStyle'

export type ViewKey = 'categoria' | 'pessoa' | 'orcamento' | 'meio'

export const VIEW_LABEL: Record<ViewKey, string> = {
  categoria: 'Por categoria',
  pessoa: 'Por pessoa',
  orcamento: 'Por orçamento',
  meio: 'Por meio de pagamento',
}

/**
 * Um quadro com várias visões do custo (decisão do dono, 1.4.0): botões lado a lado no computador e lista suspensa no
 * celular, onde quatro botões não cabem. Só aparecem as visões passadas (ex.: "Por pessoa" só com mais de uma).
 */
export function Breakdown({ views }: { views: { key: ViewKey; node: ReactNode }[] }) {
  const [view, setView] = useState<ViewKey>('categoria')
  const current = views.find((v) => v.key === view) ?? views[0]
  if (!current) return null
  return (
    <div className="space-y-2">
      {views.length > 1 && (
        <>
          <select
            className="field sm:hidden"
            aria-label="Visão"
            value={current.key}
            onChange={(e) => setView(e.target.value as ViewKey)}
          >
            {views.map((v) => (
              <option key={v.key} value={v.key}>{VIEW_LABEL[v.key]}</option>
            ))}
          </select>
          <div className="hidden gap-1 rounded-lg bg-slate-200/60 p-1 text-sm font-semibold sm:grid" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}>
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                className={`truncate rounded-md px-1 py-1.5 ${v.key === current.key ? 'seg-on' : 'text-slate-600'}`}
                onClick={() => setView(v.key)}
              >
                {VIEW_LABEL[v.key]}
              </button>
            ))}
          </div>
        </>
      )}
      {current.node}
    </div>
  )
}

/** Custo de cada pessoa escolhida, em reais, com barras. */
export function PeopleBreakdown({ people }: { people: { id: string; name: string; total: number }[] }) {
  const chart = CHART_THEME[useTheme()]
  const max = Math.max(1, ...people.map((p) => p.total))
  return (
    <section className="card p-4">
      <h2 className="mb-1 font-semibold">Por pessoa</h2>
      <p className="mb-3 text-xs text-slate-500">Quanto custou a parte de cada pessoa escolhida, em reais.</p>
      <ul className="space-y-2.5">
        {[...people].sort((a, b) => b.total - a.total).map((p) => (
          <li key={p.id}>
            <div className="flex items-center gap-2 text-sm">
              <Avatar id={p.id} name={p.name} size="sm" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-medium tabular-nums">{formatBRL(p.total)}</span>
            </div>
            <div className="ml-8 mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${(p.total / max) * 100}%`, background: chart.series }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Quanto cada pessoa escolhida pagou com cada meio, em reais. */
export function MethodBreakdown({ rows, onlyMe }: { rows: { person: string; method: string; brl: number; estimated: boolean; count: number }[]; onlyMe: boolean }) {
  return (
    <section className="card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <CreditCard size={18} className="text-slate-400" /> Por meio de pagamento
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Quanto {onlyMe ? 'você pagou' : 'cada pessoa escolhida pagou'} com cada meio, em reais (sem os gastos a pagar).
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum pagamento ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate">{m.method}</span>
                <span className="block truncate text-xs text-slate-500">{onlyMe ? '' : `${m.person} · `}{m.count} {m.count === 1 ? 'gasto' : 'gastos'}</span>
              </span>
              <span className={`shrink-0 font-medium tabular-nums ${m.estimated ? VALUE_STYLE.estimado : ''}`}>{m.estimated ? '≈ ' : ''}{formatBRL(m.brl)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Sem orçamento para as pessoas escolhidas: convite para definir. */
export function NoBudget({ names, onDefine }: { names: string; onDefine: () => void }) {
  return (
    <section className="card flex items-center gap-3 p-4">
      <PiggyBank size={20} className="shrink-0 text-slate-400" />
      <p className="min-w-0 flex-1 text-sm text-slate-500">Sem orçamento para {names}. Defina um limite total ou por categoria.</p>
      <button type="button" className="btn btn-ghost shrink-0 ring-1 ring-slate-200" onClick={onDefine}>Definir</button>
    </section>
  )
}
