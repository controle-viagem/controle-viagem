import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { setCategoryMany } from '../../db/repo'
import type { Category } from '../../db/types'

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

/** Muda a categoria (e a subcategoria) de vários gastos de uma vez. */
export function CategoriaLoteModal({ ids, categories, onDone, onClose }: { ids: string[]; categories: Category[]; onDone: () => void; onClose: () => void }) {
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const tops = categories.filter((c) => !c.parentId && !c.archived).sort(byName)
  const subs = categories.filter((c) => c.parentId === categoryId && !c.archived).sort(byName)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!categoryId) return
    await setCategoryMany(ids, categoryId, subcategoryId || null)
    onDone()
  }

  return (
    <Modal title={`Mudar categoria de ${ids.length} ${ids.length === 1 ? 'gasto' : 'gastos'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="lote-cat">Categoria</label>
          <select id="lote-cat" className="field" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }}>
            <option value="">Escolha…</option>
            {tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {subs.length > 0 && (
          <div>
            <label className="label" htmlFor="lote-sub">Subcategoria</label>
            <select id="lote-sub" className="field" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
              <option value="">Nenhuma</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex pt-2">
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none" disabled={!categoryId}>Aplicar</button>
        </div>
      </form>
    </Modal>
  )
}
