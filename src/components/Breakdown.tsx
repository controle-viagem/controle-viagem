import { useState } from 'react'
import type { Category } from '../db/types'
import type { CategoryRow } from '../domain/resumo'
import { formatBRL } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Avatar } from './Badges'
import { CategoryBreakdown } from './CategoryBreakdown'
import { CHART_THEME } from './chartTheme'

interface Props {
  rows: CategoryRow[]
  categories: Map<string, Category>
  /** Custo de cada pessoa escolhida no "Custo de". Com uma pessoa só, não há visão por pessoa. */
  people: { id: string; name: string; total: number }[]
}

/**
 * "Por categoria" e "Por pessoa" no mesmo quadro, com dois botões (decisão do dono, 1.3.0). A visão por pessoa só
 * existe com mais de uma pessoa escolhida e mostra apenas as escolhidas.
 */
export function Breakdown({ rows, categories, people }: Props) {
  const [view, setView] = useState<'categoria' | 'pessoa'>('categoria')
  const chart = CHART_THEME[useTheme()]
  const byPerson = people.length > 1
  const current = byPerson ? view : 'categoria'
  const max = Math.max(1, ...people.map((p) => p.total))
  const sorted = [...people].sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-2">
      {byPerson && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/60 p-1 text-sm font-semibold">
          <button type="button" className={`rounded-md py-1.5 ${current === 'categoria' ? 'seg-on' : 'text-slate-600'}`} onClick={() => setView('categoria')}>
            Por categoria
          </button>
          <button type="button" className={`rounded-md py-1.5 ${current === 'pessoa' ? 'seg-on' : 'text-slate-600'}`} onClick={() => setView('pessoa')}>
            Por pessoa
          </button>
        </div>
      )}
      {current === 'categoria' ? (
        <CategoryBreakdown rows={rows} categories={categories} />
      ) : (
        <section className="card p-4">
          <h2 className="mb-1 font-semibold">Por pessoa</h2>
          <p className="mb-3 text-xs text-slate-500">Quanto custou a parte de cada pessoa escolhida, em reais.</p>
          <ul className="space-y-2.5">
            {sorted.map((p) => (
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
      )}
    </div>
  )
}
