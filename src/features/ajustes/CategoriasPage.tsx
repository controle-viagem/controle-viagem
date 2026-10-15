import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { CategoryIcon } from '../../components/CategoryIcon'
import { CATEGORY_COLORS, CATEGORY_ICONS, iconKeyFor } from '../../components/categoryIcons'
import { Modal } from '../../components/Modal'
import { db } from '../../db/db'
import { removeCategory, saveCategory, updateCategoryLook } from '../../db/repo'
import { PALETTE } from '../../db/seed'
import type { Category } from '../../db/types'
import { BackLink } from './BackLink'

function AddInput({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input className="field" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      <button className="btn btn-primary shrink-0" aria-label="Adicionar">
        <Plus size={18} />
      </button>
    </form>
  )
}

/** Janela de edição: nome, cor e ícone. */
function CategoryEditor({ category, parent, onClose }: { category: Category; parent?: Category; onClose: () => void }) {
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  // undefined = sem escolha própria: usa o sugerido pelo nome ou o da categoria-mãe.
  const [icon, setIcon] = useState(category.icon)
  const shown = iconKeyFor({ ...category, name, icon }, parent)
  // Cor atual fora da paleta (cadastro antigo) continua disponível para não ser trocada sem querer.
  const colors = CATEGORY_COLORS.includes(color) ? CATEGORY_COLORS : [color, ...CATEGORY_COLORS]

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await updateCategoryLook(category, { name: name.trim(), color, icon })
    onClose()
  }

  return (
    <Modal title={parent ? `Subcategoria de ${parent.name}` : 'Editar categoria'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-end gap-3">
          <CategoryIcon category={{ ...category, name, color, icon }} parent={parent} />
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="cat-nome">Nome</label>
            <input id="cat-nome" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
        </div>

        <div>
          <span className="label">Cor</span>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`flex h-8 w-8 items-center justify-center rounded-full ${color === c ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-white' : ''}`}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
              >
                {color === c && <Check size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-600">Ícone</span>
            {icon && (
              <button type="button" className="text-xs font-medium text-slate-500 hover:underline" onClick={() => setIcon(undefined)}>
                Usar o sugerido
              </button>
            )}
          </div>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-9">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                className={`flex aspect-square items-center justify-center rounded-lg ${
                  shown === key ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={shown === key ? { background: color } : undefined}
                aria-label={`Ícone ${key}`}
                aria-pressed={shown === key}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex pt-2">
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

interface RowProps {
  category: Category
  parent?: Category
  onEdit: () => void
  children?: ReactNode
}

function CategoryRow({ category, parent, onEdit, children }: RowProps) {
  async function remove() {
    if (!confirm(`Excluir "${category.name}"?`)) return
    if ((await removeCategory(category.id)) === 'arquivada') {
      alert('Esta categoria já tem gastos, então foi arquivada: some das listas, mas o histórico é mantido.')
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {children}
      <CategoryIcon category={category} parent={parent} size={parent ? 'sm' : 'md'} />
      <span className="min-w-0 flex-1 truncate">{category.name}</span>
      <button className="btn btn-ghost !p-2" onClick={onEdit} aria-label={`Editar ${category.name}`}>
        <Pencil size={16} />
      </button>
      <button className="btn btn-danger !p-2" onClick={remove} aria-label={`Excluir ${category.name}`}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function CategoriasPage() {
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const all = (useLiveQuery(() => db.categories.toArray(), []) ?? []).filter((c) => !c.archived)
  const top = all.filter((c) => !c.parentId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const subsOf = (id: string) =>
    all.filter((c) => c.parentId === id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const edited = all.find((c) => c.id === editing)

  return (
    <div className="space-y-4">
      <BackLink title="Categorias" />

      <p className="text-sm text-slate-500">
        Toque no lápis para mudar nome, cor e ícone; a seta abre as subcategorias. As categorias valem para todas as
        viagens.
      </p>

      <div className="card divide-y divide-slate-100">
        {top.map((c) => {
          const subs = subsOf(c.id)
          const expanded = open === c.id
          return (
            <div key={c.id}>
              <CategoryRow category={c} onEdit={() => setEditing(c.id)}>
                <button
                  className="btn btn-ghost !p-1"
                  onClick={() => setOpen(expanded ? null : c.id)}
                  aria-label={`Subcategorias de ${c.name}`}
                >
                  {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="text-xs text-slate-400">{subs.length}</span>
                </button>
              </CategoryRow>
              {expanded && (
                <div className="space-y-1 border-t border-slate-100 bg-slate-50 py-2 pl-8 pr-3">
                  {subs.map((s) => (
                    <CategoryRow key={s.id} category={s} parent={c} onEdit={() => setEditing(s.id)} />
                  ))}
                  <div className="px-3 py-1">
                    <AddInput
                      placeholder={`Nova subcategoria de ${c.name}`}
                      onAdd={(name) =>
                        saveCategory({ name, parentId: c.id, color: c.color, archived: false })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {top.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nenhuma categoria cadastrada.</p>}
      </div>

      <AddInput
        placeholder="Nova categoria"
        onAdd={(name) =>
          saveCategory({ name, parentId: null, color: PALETTE[all.length % PALETTE.length], archived: false })
        }
      />

      {edited && (
        <CategoryEditor
          category={edited}
          parent={all.find((c) => c.id === edited.parentId)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
