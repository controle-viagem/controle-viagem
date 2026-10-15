import { ChevronRight, CircleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CurrencyBadge } from '../../components/Badges'
import { balanceClass, signedMoney } from '../../components/valueStyle'
import { ACTIVE_TRIP, setLocal } from '../../db/repo'
import type { TripPending } from './usePending'

/** Aviso com o que ainda falta acertar em outras viagens; tocar abre os acertos daquela viagem. */
export function PendingCard({ pending }: { pending: TripPending[] }) {
  const navigate = useNavigate()
  if (pending.length === 0) return null

  async function open(tripId: string) {
    await setLocal(ACTIVE_TRIP, tripId)
    navigate('/acertos')
  }

  return (
    <section className="card border-amber-300 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CircleAlert size={16} className="text-amber-600" /> Acertos pendentes de outras viagens
      </h2>
      <ul className="divide-y divide-slate-100">
        {pending.map(({ trip, mine, people }) => (
          <li key={trip.id}>
            <button className="flex w-full items-center gap-2 py-2 text-left" onClick={() => open(trip.id)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{trip.name}</span>
                <span className="block text-xs text-slate-500">
                  {trip.closed ? 'Encerrada · ' : ''}
                  {mine.size === 0 ? `${people} pessoas ainda acertando entre si` : 'Seu saldo'}
                </span>
              </span>
              <span className="space-y-0.5 text-right">
                {[...mine].map(([currency, value]) => (
                  <span key={currency} className={`flex items-center justify-end gap-1.5 text-sm font-semibold tabular-nums ${balanceClass(value)}`}>
                    <CurrencyBadge code={currency} /> {signedMoney(value, currency)}
                  </span>
                ))}
              </span>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
