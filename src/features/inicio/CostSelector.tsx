import { useLiveQuery } from 'dexie-react-hooks'
import { Avatar } from '../../components/Badges'
import { db } from '../../db/db'
import { setLocal } from '../../db/repo'
import { ME, type Person, type Trip } from '../../db/types'

/** Chave (neste aparelho) de quem compõe o custo mostrado no Início e nos relatórios, por viagem. */
const costKey = (tripId: string) => `custoDe:${tripId}`

/** Pessoas escolhidas no "Custo de" (padrão: só eu), guardadas por viagem neste aparelho. */
export function useCostPeople(trip: Trip | undefined, travelers: Person[]) {
  const saved = useLiveQuery(() => (trip ? db.local.get(costKey(trip.id)) : undefined), [trip?.id])
  const valid = new Set(travelers.map((p) => p.id))
  const savedIds = Array.isArray(saved?.value) ? (saved.value as string[]).filter((id) => valid.has(id)) : []
  const personIds = savedIds.length ? savedIds : [ME]
  const choose = (ids: string[]) => trip && setLocal(costKey(trip.id), ids.length ? ids : [ME])
  const names = personIds.map((id) => travelers.find((p) => p.id === id)?.name ?? '—').join(' + ')
  return { personIds, choose, names, onlyMe: personIds.length === 1 && personIds[0] === ME }
}

interface Props {
  trip: Trip
  travelers: Person[]
  personIds: string[]
  onChange: (ids: string[]) => void
  label?: string
}

/** Chips com cada viajante e atalhos (só eu, grupos, todos) para escolher de quem é o custo. */
export function CostSelector({ trip, travelers, personIds, onChange, label = 'Custo de' }: Props) {
  const toggle = (id: string) => onChange(personIds.includes(id) ? personIds.filter((x) => x !== id) : [...personIds, id])
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="flex flex-wrap gap-2 text-xs font-medium">
          <button type="button" className="text-slate-500 hover:underline" onClick={() => onChange([ME])}>Só eu</button>
          {trip.groups.map((g) => (
            <button key={g.id} type="button" className="text-slate-500 hover:underline" onClick={() => onChange(g.memberIds)}>{g.name}</button>
          ))}
          <button type="button" className="text-slate-500 hover:underline" onClick={() => onChange(travelers.map((p) => p.id))}>Todos</button>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {travelers.map((p) => {
          const on = personIds.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.id)}
              className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium ring-1 ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}
            >
              <Avatar id={p.id} name={p.name} size="sm" /> {p.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
