import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Lock, LockOpen, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTrips } from '../../app/useTrips'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { db } from '../../db/db'
import { ACTIVE_TRIP, deleteTrip, saveTrip, setLocal, setTripClosed } from '../../db/repo'
import { balanceClass, signedMoney } from '../../components/valueStyle'
import { usePending } from '../acertos/usePending'
import { CloseTripDialog } from './CloseTripDialog'
import { ME, type Trip } from '../../db/types'
import { partBRL } from '../../domain/custoViagem'
import { useWalletData } from '../carteiras/useWalletData'
import { CURRENCIES, currencyName, decimalText, parseDecimal } from '../../domain/moeda'
import { statusLabel, tripDays } from '../../domain/viagem'
import { formatBRL, fullDate, todayISO } from '../../lib/format'
import { involvedIds, persistTravelers, TravelersEditor, travelersValue, type Travelers } from './TravelersEditor'

const FOREIGN = CURRENCIES.filter((c) => c !== 'BRL')

function TripForm({ trip, onClose }: { trip?: Trip; onClose: () => void }) {
  const [name, setName] = useState(trip?.name ?? '')
  const [destination, setDestination] = useState(trip?.destination ?? '')
  const [startDate, setStartDate] = useState(trip?.startDate ?? todayISO())
  const [endDate, setEndDate] = useState(trip?.endDate ?? todayISO())
  const [currencies, setCurrencies] = useState<string[]>(trip?.currencies ?? ['USD'])
  const [tax, setTax] = useState(decimalText(trip?.localTaxPct))
  const [tip, setTip] = useState(decimalText(trip?.tipPct))
  const [travelers, setTravelers] = useState<Travelers | null>(null)
  const [error, setError] = useState('')
  // Pessoas e uso delas (quem está em gastos/acertos não pode sair da viagem).
  const loaded = useLiveQuery(async () => {
    const [me, people, expenses, settlements] = await Promise.all([
      db.people.get(ME),
      trip ? db.people.where('tripId').equals(trip.id).sortBy('name') : [],
      trip ? db.expenses.where('tripId').equals(trip.id).toArray() : [],
      trip ? db.settlements.where('tripId').equals(trip.id).toArray() : [],
    ])
    return { value: travelersValue(me, people, trip?.groups ?? []), locked: involvedIds(expenses, settlements) }
  }, [trip?.id])
  const value = travelers ?? loaded?.value

  const toggle = (code: string) =>
    setCurrencies((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Dê um nome para a viagem.')
    if (!startDate || !endDate) return setError('Informe as datas de ida e de volta.')
    if (endDate < startDate) return setError('A volta não pode ser antes da ida.')
    const taxPct = parseDecimal(tax)
    const tipPct = parseDecimal(tip)
    if ((tax.trim() && taxPct === null) || (tip.trim() && tipPct === null)) return setError('Imposto e gorjeta em % (ex.: 6,5).')
    const id = await saveTrip({
      id: trip?.id,
      name: name.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
      currencies,
      localTaxPct: taxPct || undefined,
      tipPct: tipPct || undefined,
      groups: trip?.groups ?? [],
      closed: trip?.closed ?? false,
      archived: trip?.archived ?? false,
    })
    if (value) await persistTravelers(id, value)
    // Viagem nova já fica aberta: é nela que os próximos gastos vão entrar.
    if (!trip) await setLocal(ACTIVE_TRIP, id)
    onClose()
  }

  return (
    <Modal title={trip ? 'Editar viagem' : 'Nova viagem'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="vg-nome">Nome</label>
          <input id="vg-nome" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Orlando 2026" maxLength={40} autoFocus={!trip} />
        </div>
        <div>
          <label className="label" htmlFor="vg-dest">Destino (opcional)</label>
          <input id="vg-dest" className="field" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Ex.: Flórida, EUA" maxLength={60} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="vg-ida">Ida</label>
            <input id="vg-ida" type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="vg-volta">Volta</label>
            <input id="vg-volta" type="date" className="field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <span className="label">Moedas da viagem</span>
          <p className="mb-2 text-xs text-slate-500">Aparecem primeiro ao lançar um gasto. O real está sempre disponível.</p>
          <div className="flex flex-wrap gap-1.5">
            {FOREIGN.map((code) => {
              const on = currencies.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  title={currencyName(code)}
                  onClick={() => toggle(code)}
                  aria-pressed={on}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {code}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="vg-imp">Imposto local (%)</label>
            <input id="vg-imp" className="field" inputMode="decimal" placeholder="Ex.: 6,5" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="vg-gorj">Gorjeta padrão (%)</label>
            <input id="vg-gorj" className="field" inputMode="decimal" placeholder="Ex.: 18" value={tip} onChange={(e) => setTip(e.target.value)} />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-slate-500">
            O imposto é separado automaticamente do total nos gastos nas moedas da viagem (dá para mudar ou tirar em cada
            gasto). A gorjeta padrão é sugerida quando o gasto tem gorjeta.
          </p>
        </div>
        {value && loaded && <TravelersEditor value={value} onChange={setTravelers} locked={loaded.locked} />}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex pt-2">
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

export function ViagensPage() {
  const { trips, active } = useTrips()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<{ trip?: Trip } | null>(null)
  // "?nova=1" (vindo do "+" ou da tela de boas-vindas) abre o cadastro mesmo com a tela já aberta.
  const form = editing ?? (params.get('nova') ? {} : null)
  const [deleting, setDeleting] = useState<Trip | null>(null)
  const [closing, setClosing] = useState<Trip | null>(null)
  const pending = usePending()
  const wallet = useWalletData()
  const expenses = useLiveQuery(() => db.expenses.toArray(), [])
  // Custo de cada viagem para mim: a minha parte, em reais (o que outra pessoa pagou em moeda estrangeira fica de fora).
  const totals = new Map<string, { total: number; count: number }>()
  for (const e of expenses ?? []) {
    const t = totals.get(e.tripId) ?? { total: 0, count: 0 }
    t.total += partBRL(e, [ME], wallet.ledger.expenseCosts, () => null).brl
    t.count++
    totals.set(e.tripId, t)
  }
  const today = todayISO()

  function closeForm() {
    setEditing(null)
    if (params.get('nova')) setParams({}, { replace: true })
  }

  async function open(trip: Trip) {
    await setLocal(ACTIVE_TRIP, trip.id)
    navigate('/')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Viagens</h1>

      {trips.length === 0 && (
        <div className="card p-6 text-center">
          <p className="font-medium">Nenhuma viagem cadastrada ainda.</p>
          <p className="mt-1 text-sm text-slate-500">Cadastre a viagem para começar a lançar os gastos dela.</p>
        </div>
      )}

      <div className="space-y-2">
        {trips.map((trip) => {
          const isActive = trip.id === active?.id
          const t = totals.get(trip.id)
          return (
            <div key={trip.id} className={`card p-4 ${isActive ? 'border-slate-900' : ''}`}>
              <div className="flex items-start gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => open(trip)}>
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{trip.name}</span>
                    {isActive && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
                        <Check size={12} /> Aberta
                      </span>
                    )}
                  </span>
                  {trip.destination && (
                    <span className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                      <MapPin size={14} /> {trip.destination}
                    </span>
                  )}
                  <span className="mt-1 block text-xs text-slate-500">
                    {fullDate(trip.startDate)} a {fullDate(trip.endDate)} · {tripDays(trip)} dias ·{' '}
                    {statusLabel(trip, today)}
                    {trip.currencies.length > 0 && ` · ${trip.currencies.join(', ')}`}
                  </span>
                  <span className="mt-2 block text-sm">
                    <span className="font-semibold tabular-nums">{formatBRL(t?.total ?? 0)}</span>
                    <span className="text-slate-500"> em {t?.count ?? 0} {t?.count === 1 ? 'gasto' : 'gastos'}</span>
                  </span>
                  {(() => {
                    const mine = pending.find((p) => p.trip.id === trip.id)?.mine
                    if (!mine || mine.size === 0) return null
                    return (
                      <span className="mt-1 flex flex-wrap gap-x-3 text-xs font-semibold">
                        {[...mine].map(([currency, value]) => (
                          <span key={currency} className={`tabular-nums ${balanceClass(value)}`}>
                            {value > 0 ? 'a receber' : 'a pagar'} {signedMoney(value, currency)}
                          </span>
                        ))}
                      </span>
                    )
                  })()}
                </button>
                {trip.closed ? (
                  <button className="btn btn-ghost !p-2" onClick={() => setTripClosed(trip.id, false)} aria-label={`Reabrir ${trip.name}`} title="Reabrir viagem">
                    <LockOpen size={16} />
                  </button>
                ) : (
                  <button className="btn btn-ghost !p-2" onClick={() => setClosing(trip)} aria-label={`Encerrar ${trip.name}`} title="Encerrar viagem">
                    <Lock size={16} />
                  </button>
                )}
                <button className="btn btn-ghost !p-2" onClick={() => setEditing({ trip })} aria-label={`Editar ${trip.name}`}>
                  <Pencil size={16} />
                </button>
                <button className="btn btn-danger !p-2" onClick={() => setDeleting(trip)} aria-label={`Excluir ${trip.name}`}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button className="btn btn-primary w-full sm:w-auto" onClick={() => setEditing({})}>
        <Plus size={18} /> Nova viagem
      </button>

      {form && <TripForm trip={form.trip} onClose={closeForm} />}
      {closing && <CloseTripDialog trip={closing} onClose={() => setClosing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Excluir viagem"
          message={
            <>
              Excluir <strong>{deleting.name}</strong> e os {totals.get(deleting.id)?.count ?? 0} gastos dela? Isso não pode
              ser desfeito.
            </>
          }
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteTrip(deleting.id)
            setDeleting(null)
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
