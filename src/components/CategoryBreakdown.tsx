import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '../db/types'
import type { CategoryRow } from '../domain/resumo'
import { lancamentosLink } from '../domain/filtro'
import { formatBRL } from '../lib/format'
import { CategoryIcon } from './CategoryIcon'

interface Props {
  rows: CategoryRow[]
  categories: Map<string, Category>
}

export const percent = (share: number) => `${Math.round(share * 100)}%`

/**
 * Gastos por categoria, em reais: peso de cada uma no total. A seta abre as subcategorias; tocar em uma
 * categoria ou subcategoria abre os gastos dela.
 */
export function CategoryBreakdown({ rows, categories }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const max = rows[0]?.total ?? 0

  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">Por categoria</h2>
      {rows.length === 0 && <p className="text-sm text-slate-500">Nenhum gasto ainda.</p>}
      <ul className="space-y-3">
        {rows.map((row) => {
          const category = categories.get(row.id)
          const hasSubs = row.subs.some((s) => s.id)
          const expanded = open === row.id
          return (
            <li key={row.id}>
              <div className="flex items-center gap-1">
                {hasSubs ? (
                  <button
                    className="-ml-1 rounded p-1 text-slate-400 hover:bg-slate-100"
                    onClick={() => setOpen(expanded ? null : row.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Fechar' : 'Abrir'} subcategorias de ${category?.name ?? ''}`}
                  >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <Link
                  to={lancamentosLink({ cat: [row.id] })}
                  className="-my-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-sm hover:bg-slate-50"
                >
                  <CategoryIcon category={category} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{category?.name ?? '—'}</span>
                  <span className="text-xs text-slate-500">{percent(row.share)}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{formatBRL(row.total)}</span>
                </Link>
              </div>
              <div className="ml-5 mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${max > 0 ? (row.total / max) * 100 : 0}%`, background: category?.color ?? '#94a3b8' }}
                />
              </div>
              {expanded && (
                <ul className="ml-5 mt-2 divide-y divide-slate-100 rounded-lg bg-slate-50 px-3 text-sm">
                  {row.subs.map((sub) => (
                    <li key={sub.id}>
                      <Link to={lancamentosLink({ cat: sub.id ? [row.id, sub.id] : [row.id] })} className="flex items-center gap-2 py-2 hover:underline">
                        <span className="min-w-0 flex-1 truncate text-slate-600">
                          {sub.id ? (categories.get(sub.id)?.name ?? '—') : 'Sem subcategoria'}
                        </span>
                        <span className="text-xs text-slate-500">{percent(sub.share)}</span>
                        <span className="w-24 text-right tabular-nums">{formatBRL(sub.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
