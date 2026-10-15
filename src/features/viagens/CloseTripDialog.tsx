import { CurrencyBadge } from '../../components/Badges'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { balanceClass, signedMoney } from '../../components/valueStyle'
import { setTripClosed } from '../../db/repo'
import type { Trip } from '../../db/types'
import { usePending } from '../acertos/usePending'

/**
 * Encerrar a viagem: ela fica só para consulta (sem gastos novos nem edição), mas os acertos continuam liberados.
 * Se ainda houver valores a acertar, mostra quanto antes de confirmar.
 */
export function CloseTripDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const pending = usePending().find((p) => p.trip.id === trip.id)
  return (
    <ConfirmDialog
      title="Encerrar viagem"
      message={
        <div className="space-y-2">
          <p>
            <strong>{trip.name}</strong> fica só para consulta: sem gastos novos nem edição. Os acertos continuam podendo ser
            registrados, e dá para reabrir depois.
          </p>
          {pending && (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="font-medium text-amber-600">Ainda há valores a acertar nesta viagem.</p>
              {[...pending.mine].map(([currency, value]) => (
                <p key={currency} className={`flex items-center gap-1.5 font-semibold tabular-nums ${balanceClass(value)}`}>
                  <CurrencyBadge code={currency} /> {value > 0 ? 'A receber' : 'A pagar'} {signedMoney(value, currency)}
                </p>
              ))}
              <p className="mt-1 text-xs text-slate-500">Eles vão aparecer em "Acertos pendentes de outras viagens".</p>
            </div>
          )}
        </div>
      }
      confirmLabel="Encerrar"
      onConfirm={async () => {
        await setTripClosed(trip.id, true)
        onClose()
      }}
      onClose={onClose}
    />
  )
}
