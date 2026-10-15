import { CircleAlert, CircleCheck, PiggyBank, TriangleAlert } from 'lucide-react'
import { CategoryIcon } from '../../components/CategoryIcon'
import type { Category } from '../../db/types'
import { BUDGET_LEVEL_LABEL, type BudgetLevel, type BudgetLine, type BudgetStatus } from '../../domain/orcamento'
import { formatBRL } from '../../lib/format'

/** Cor da barra e do texto por situação (tons com versão própria no tema escuro). */
const LEVEL: Record<BudgetLevel, { bar: string; text: string; icon: typeof CircleCheck }> = {
  ok: { bar: 'bg-emerald-600', text: 'text-emerald-600', icon: CircleCheck },
  atencao: { bar: 'bg-amber-600', text: 'text-amber-600', icon: TriangleAlert },
  estourou: { bar: 'bg-rose-600', text: 'text-rose-600', icon: CircleAlert },
}

function Line({ line, label, category }: { line: BudgetLine; label: string; category?: Category }) {
  const style = LEVEL[line.level]
  const Icon = style.icon
  return (
    <li>
      <div className="flex items-center gap-2 text-sm">
        {category && <CategoryIcon category={category} size="sm" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="tabular-nums text-slate-500">{formatBRL(line.spent)} de {formatBRL(line.limit)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.min(100, line.share * 100)}%` }} />
        </div>
        <span className={`flex w-16 items-center justify-end gap-1 text-xs font-semibold tabular-nums ${style.text}`}>
          <Icon size={12} /> {Math.round(line.share * 100)}%
        </span>
      </div>
    </li>
  )
}

interface Props {
  status: BudgetStatus
  categories: Map<string, Category>
  forNames: string
  /** Compacto (Início): só o total e as categorias em atenção ou estouradas. */
  compact?: boolean
  onEdit?: () => void
}

/** Orçamento: barras com a cor da situação (verde ok, âmbar a partir de 80%, vermelho estourou) e o rótulo. */
export function BudgetCard({ status, categories, forNames, compact, onEdit }: Props) {
  const lines = compact ? status.categories.filter((c) => c.level !== 'ok') : status.categories
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <PiggyBank size={18} className="text-slate-400" /> Orçamento
        </h2>
        {onEdit && (
          <button className="text-xs font-medium text-slate-500 hover:underline" onClick={onEdit}>
            Editar
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Custo de {forNames} · <span className={LEVEL[status.worst].text}>{BUDGET_LEVEL_LABEL[status.worst]}</span>
      </p>
      <ul className="space-y-3">
        {status.total && <Line line={status.total} label="Total da viagem" />}
        {lines.map((l) => (
          <Line key={l.id} line={l} label={categories.get(l.id)?.name ?? '—'} category={categories.get(l.id)} />
        ))}
      </ul>
      {status.total && (
        <p className={`mt-2 text-xs ${LEVEL[status.total.projectedLevel].text}`}>
          No ritmo atual, a viagem deve fechar em {formatBRL(status.total.projection)}
          {status.total.projectedLevel === 'estourou' ? ', acima do limite.' : '.'}
        </p>
      )}
      {compact && lines.length === 0 && status.categories.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">Todas as categorias com limite estão dentro do orçamento.</p>
      )}
    </section>
  )
}
