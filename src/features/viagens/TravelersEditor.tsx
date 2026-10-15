import { Plus, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '../../components/Badges'
import { saveTravelers } from '../../db/repo'
import { ME, type Expense, type Person, type Settlement, type TripGroup } from '../../db/types'
import { payersOf } from '../../domain/rateio'

export interface Travelers {
  /** Nome de "Eu" (vale para todas as viagens). */
  meName: string
  /** Quem vai junto nesta viagem (sem "Eu"). Pessoa nova já tem id gerado aqui. */
  people: { id: string; name: string }[]
  groups: TripGroup[]
}

/** Valor inicial do editor: as pessoas desta viagem (sem "Eu") e os grupos dela. */
export const travelersValue = (me: Person | undefined, people: Person[], groups: TripGroup[]): Travelers => ({
  meName: me?.name ?? 'Eu',
  people: people.filter((p) => p.id !== ME).map((p) => ({ id: p.id, name: p.name })),
  groups,
})

/** Pessoas que aparecem em gastos ou acertos: não podem sair da viagem. */
export function involvedIds(expenses: Expense[], settlements: Settlement[]): Set<string> {
  const ids = new Set<string>()
  for (const e of expenses) {
    for (const p of payersOf(e)) ids.add(p.personId)
    for (const s of e.split?.shares ?? []) ids.add(s.personId)
  }
  for (const s of settlements) {
    ids.add(s.fromId)
    ids.add(s.toId)
  }
  return ids
}

/** Grava viajantes e grupos (grupos sem ninguém saem; membros que saíram da viagem saem dos grupos). */
export async function persistTravelers(tripId: string, value: Travelers) {
  const people = value.people.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name)
  const valid = new Set([ME, ...people.map((p) => p.id)])
  const groups = value.groups
    .map((g) => ({ ...g, name: g.name.trim() || 'Grupo', memberIds: g.memberIds.filter((m) => valid.has(m)) }))
    .filter((g) => g.memberIds.length > 0)
  await saveTravelers(tripId, people, groups, value.meName)
}

interface Props {
  value: Travelers
  onChange: (next: Travelers) => void
  /** Quem já está em gastos ou acertos desta viagem. */
  locked: Set<string>
}

/**
 * Quem viaja e os grupos (ex.: casais). As pessoas são desta viagem: numa viagem nova, cadastra de novo.
 * Grupos só juntam a visão do que pagar e receber; cada pessoa continua com a sua parte nos gastos.
 */
export function TravelersEditor({ value, onChange, locked }: Props) {
  const [newName, setNewName] = useState('')
  const everyone = [{ id: ME, name: value.meName || 'Eu' }, ...value.people]

  function add() {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    onChange({ ...value, people: [...value.people, { id: crypto.randomUUID(), name }] })
  }

  const rename = (id: string, name: string) =>
    onChange({ ...value, people: value.people.map((p) => (p.id === id ? { ...p, name } : p)) })

  function removePerson(id: string) {
    onChange({
      ...value,
      people: value.people.filter((p) => p.id !== id),
      groups: value.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })),
    })
  }

  const setGroup = (id: string, patch: Partial<TripGroup>) =>
    onChange({ ...value, groups: value.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })

  /** Põe a pessoa no grupo (tirando de outro, se estava) ou tira dele. */
  function toggleMember(groupId: string, personId: string) {
    onChange({
      ...value,
      groups: value.groups.map((g) => {
        if (g.id === groupId) {
          return { ...g, memberIds: g.memberIds.includes(personId) ? g.memberIds.filter((m) => m !== personId) : [...g.memberIds, personId] }
        }
        return { ...g, memberIds: g.memberIds.filter((m) => m !== personId) }
      }),
    })
  }

  const chip = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium ring-1 ${
      on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'
    }`

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="vj-eu">Seu nome</label>
        <div className="flex items-center gap-2">
          <Avatar id={ME} name={value.meName || 'Eu'} />
          <input id="vj-eu" className="field" value={value.meName} maxLength={40} onChange={(e) => onChange({ ...value, meName: e.target.value })} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Aparece nos acertos e no texto do WhatsApp. Vale para todas as viagens.</p>
      </div>

      <div>
        <span className="label">Quem vai com você nesta viagem</span>
        <ul className="space-y-1.5">
          {value.people.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar id={p.id} name={p.name || '?'} />
              <input className="field !py-1.5" aria-label="Nome do viajante" value={p.name} maxLength={40} onChange={(e) => rename(p.id, e.target.value)} />
              <button
                type="button"
                className="btn btn-danger !p-2"
                disabled={locked.has(p.id)}
                title={locked.has(p.id) ? 'Está em gastos ou acertos desta viagem' : undefined}
                aria-label={`Tirar ${p.name} da viagem`}
                onClick={() => removePerson(p.id)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        {value.people.some((p) => locked.has(p.id)) && (
          <p className="mt-1 text-xs text-slate-500">Quem já está em gastos ou acertos não pode sair; o nome pode ser trocado.</p>
        )}
        <div className="mt-2 flex gap-2">
          <input
            className="field"
            placeholder="Nome de outro viajante"
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button type="button" className="btn btn-primary shrink-0 !px-3" onClick={add} aria-label="Adicionar viajante">
            <UserPlus size={18} />
          </button>
        </div>
      </div>

      {value.people.length > 0 && (
        <div>
          <span className="label">Grupos (opcional)</span>
          <p className="mb-2 text-xs text-slate-500">
            Juntam pessoas para ver e acertar juntas o que pagar e receber, como um casal. Cada pessoa continua com a sua
            parte nos gastos.
          </p>
          <div className="space-y-2">
            {value.groups.map((g) => (
              <div key={g.id} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 flex gap-2">
                  <input className="field !py-1.5" aria-label="Nome do grupo" value={g.name} maxLength={40} onChange={(e) => setGroup(g.id, { name: e.target.value })} />
                  <button type="button" className="btn btn-danger !p-2" aria-label={`Excluir grupo ${g.name}`} onClick={() => onChange({ ...value, groups: value.groups.filter((x) => x.id !== g.id) })}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {everyone.map((p) => (
                    <button key={p.id} type="button" className={chip(g.memberIds.includes(p.id))} onClick={() => toggleMember(g.id, p.id)} aria-pressed={g.memberIds.includes(p.id)}>
                      <Avatar id={p.id} name={p.name || '?'} size="sm" /> {p.name || '—'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost mt-2 ring-1 ring-slate-300"
            onClick={() => onChange({ ...value, groups: [...value.groups, { id: crypto.randomUUID(), name: `Grupo ${value.groups.length + 1}`, memberIds: [] }] })}
          >
            <Plus size={16} /> Novo grupo
          </button>
        </div>
      )}
    </div>
  )
}
