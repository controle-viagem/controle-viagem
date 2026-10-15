import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
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

type Mode = 'meu' | 'grupos' | 'viajantes'

const MODE_LABEL: Record<Mode, string> = { meu: 'Eu e meu grupo', grupos: 'Grupos', viajantes: 'Viajantes' }

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/** Visão que combina com a escolha atual: só eu ou um grupo meu → "meu"; soma de grupos → "grupos"; senão, viajantes. */
function modeOf(trip: Trip, personIds: string[]): Mode {
  const mine = trip.groups.filter((g) => g.memberIds.includes(ME))
  if (sameSet(personIds, [ME]) || mine.some((g) => sameSet(personIds, g.memberIds))) return 'meu'
  const covering = trip.groups.filter((g) => g.memberIds.every((id) => personIds.includes(id)))
  if (covering.length && sameSet(personIds, [...new Set(covering.flatMap((g) => g.memberIds))])) return 'grupos'
  return 'viajantes'
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium ring-1 ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}
    >
      {children}
    </button>
  )
}

interface Props {
  trip: Trip
  travelers: Person[]
  personIds: string[]
  onChange: (ids: string[]) => void
  label?: string
}

/**
 * Escolhe de quem é o custo, em três visões: "Eu e meu grupo" (eu ou o grupo de que faço parte), "Grupos" (um ou
 * mais grupos da viagem, somados) e "Viajantes" (cada pessoa, livre). Sem grupos na viagem, só os viajantes.
 */
export function CostSelector({ trip, travelers, personIds, onChange, label = 'Custo de' }: Props) {
  const hasGroups = trip.groups.length > 0
  // Até a pessoa tocar numa visão, ela segue a escolha guardada (que chega depois de abrir) e vale por viagem.
  const [picked, setPicked] = useState<{ tripId: string; mode: Mode } | null>(null)
  const setMode = (m: Mode) => setPicked({ tripId: trip.id, mode: m })
  const current: Mode = !hasGroups ? 'viajantes' : picked?.tripId === trip.id ? picked.mode : modeOf(trip, personIds)
  const me = travelers.find((p) => p.id === ME)
  const myGroups = trip.groups.filter((g) => g.memberIds.includes(ME))
  const groupOn = (memberIds: string[]) => memberIds.length > 0 && memberIds.every((id) => personIds.includes(id))

  const togglePerson = (id: string) => onChange(personIds.includes(id) ? personIds.filter((x) => x !== id) : [...personIds, id])
  function toggleGroup(groupId: string) {
    const chosen = trip.groups.filter((g) => groupOn(g.memberIds))
    const next = chosen.some((g) => g.id === groupId) ? chosen.filter((g) => g.id !== groupId) : [...chosen, trip.groups.find((g) => g.id === groupId)!]
    onChange([...new Set(next.flatMap((g) => g.memberIds))])
  }
  const link = (text: string, ids: string[]) => (
    <button type="button" className="text-slate-500 hover:underline" onClick={() => onChange(ids)}>{text}</button>
  )

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="flex flex-wrap gap-3 text-xs font-medium">
          {current === 'grupos' && link('Todos os grupos', [...new Set(trip.groups.flatMap((g) => g.memberIds))])}
          {current === 'viajantes' && link('Só eu', [ME])}
          {current === 'viajantes' && link('Todos', travelers.map((p) => p.id))}
        </span>
      </div>

      {hasGroups && (
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-200/60 p-1 text-xs font-semibold sm:text-sm">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} type="button" className={`rounded-md py-1.5 ${current === m ? 'seg-on' : 'text-slate-600'}`} onClick={() => setMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {current === 'meu' && (
          <>
            <Chip on={sameSet(personIds, [ME])} onClick={() => onChange([ME])}>
              <Avatar id={ME} name={me?.name ?? 'Eu'} size="sm" /> {me?.name ?? 'Eu'}
            </Chip>
            {myGroups.map((g) => (
              <Chip key={g.id} on={sameSet(personIds, g.memberIds)} onClick={() => onChange(g.memberIds)}>
                <Avatar id={g.id} name={g.name} size="sm" group /> {g.name}
              </Chip>
            ))}
            {myGroups.length === 0 && (
              <p className="self-center text-xs text-slate-500">Você não está em nenhum grupo desta viagem (Acertos → Viajantes).</p>
            )}
          </>
        )}
        {current === 'grupos' &&
          trip.groups.map((g) => (
            <Chip key={g.id} on={groupOn(g.memberIds)} onClick={() => toggleGroup(g.id)}>
              <Avatar id={g.id} name={g.name} size="sm" group /> {g.name}
            </Chip>
          ))}
        {current === 'viajantes' &&
          travelers.map((p) => (
            <Chip key={p.id} on={personIds.includes(p.id)} onClick={() => togglePerson(p.id)}>
              <Avatar id={p.id} name={p.name} size="sm" /> {p.name}
            </Chip>
          ))}
      </div>
    </div>
  )
}
