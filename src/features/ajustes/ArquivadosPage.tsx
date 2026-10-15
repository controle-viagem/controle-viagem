import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore } from 'lucide-react'
import type { ReactNode } from 'react'
import { db } from '../../db/db'
import { restoreCategory, restoreMethod } from '../../db/repo'
import { METHOD_KIND_LABEL } from '../../db/types'
import { BackLink } from './BackLink'

interface Item {
  id: string
  name: string
  hint: string
  color?: string
  restore: () => void
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

function Section({ title, items, empty }: { title: string; items: Item[]; empty: string }): ReactNode {
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2">
            {item.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: item.color }} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              <span className="block truncate text-xs text-slate-500">{item.hint}</span>
            </span>
            <button className="btn btn-ghost shrink-0" onClick={item.restore} aria-label={`Restaurar ${item.name}`}>
              <ArchiveRestore size={16} /> Restaurar
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{empty}</p>}
      </div>
    </section>
  )
}

export function ArquivadosPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const methods = useLiveQuery(() => db.paymentMethods.toArray(), []) ?? []
  const parentName = (id: string | null) => categories.find((c) => c.id === id)?.name

  const archivedCategories: Item[] = categories
    .filter((c) => c.archived)
    .sort(byName)
    .map((c) => ({
      id: c.id,
      name: c.name,
      hint: c.parentId ? `Subcategoria de ${parentName(c.parentId) ?? '—'}` : 'Categoria',
      color: c.color,
      restore: () => restoreCategory(c.id),
    }))
  const archivedMethods: Item[] = methods
    .filter((m) => m.archived)
    .sort(byName)
    .map((m) => ({
      id: m.id,
      name: m.name,
      hint: METHOD_KIND_LABEL[m.kind],
      restore: () => restoreMethod(m.id),
    }))

  return (
    <div className="space-y-4">
      <BackLink title="Arquivados" />
      <p className="text-sm text-slate-500">
        Itens excluídos que já tinham gastos ficam guardados aqui. Ao restaurar, voltam a aparecer nas listas.
      </p>
      <Section title="Categorias" items={archivedCategories} empty="Nenhuma categoria arquivada." />
      <Section title="Meios de pagamento" items={archivedMethods} empty="Nenhum meio arquivado." />
    </div>
  )
}
