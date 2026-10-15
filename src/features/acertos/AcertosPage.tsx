import { ArrowRight, Check, Copy, HandCoins, Share2, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { Avatar, CurrencyBadge } from '../../components/Badges'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { balanceClass, signedMoney, VALUE_STYLE } from '../../components/valueStyle'
import { ACTIVE_TRIP, deleteSettlementBatch, setLocal } from '../../db/repo'
import { useTrips } from '../../app/useTrips'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { PendingCard } from './PendingCard'
import { usePending } from './usePending'
import { ME, type Settlement, type Trip } from '../../db/types'
import { settlementText } from '../../domain/textoAcertos'
import { formatMoney, formatRate, shortDate } from '../../lib/format'
import { useTripData } from '../lancamentos/useTripData'
import { NoTrip } from '../viagens/NoTrip'
import { involvedIds, persistTravelers, TravelersEditor, travelersValue, type Travelers } from '../viagens/TravelersEditor'
import type { TripData } from '../lancamentos/useTripData'
import { SettlementForm, type SettlementDraft } from './SettlementForm'
import { editContext, tripBalances } from './tripBalances'

function TravelersModal({ trip, data, onClose }: { trip: Trip; data: TripData; onClose: () => void }) {
  const [value, setValue] = useState<Travelers>(() => travelersValue(data.people.get(ME), data.travelers, trip.groups))
  async function save() {
    await persistTravelers(trip.id, value)
    onClose()
  }
  return (
    <Modal title="Viajantes e grupos" onClose={onClose}>
      <div className="space-y-4">
        <TravelersEditor value={value} onChange={setValue} locked={involvedIds(data.expenses, data.settlements)} />
        <div className="flex pt-2">
          <button className="btn btn-primary ml-auto flex-1 sm:flex-none" onClick={save}>Salvar</button>
        </div>
      </div>
    </Modal>
  )
}

/** Acertos já feitos, um por lote (um acerto entre grupos tem uma linha por pessoa). */
function batches(settlements: Settlement[]) {
  const map = new Map<string, Settlement[]>()
  for (const s of settlements) map.set(s.batchId, [...(map.get(s.batchId) ?? []), s])
  return [...map.values()]
}

export function AcertosPage() {
  const { trip } = useApp()
  const { trips } = useTrips()
  const pending = usePending()
  const wallets = (useLiveQuery(() => db.paymentMethods.where('kind').equals('carteira').toArray(), []) ?? []).filter((w) => !w.archived)
  const data = useTripData(trip?.id)
  const [params, setParams] = useSearchParams()
  const [byGroup, setByGroup] = useState(true)
  const [form, setForm] = useState<SettlementDraft | null>(null)
  const [deleting, setDeleting] = useState<Settlement[] | null>(null)
  const [editing, setEditing] = useState<Settlement[] | null>(null)
  const [copied, setCopied] = useState(false)
  if (!trip) return data.loaded ? <NoTrip /> : null

  const editingTravelers = params.get('viajantes') === '1'
  const setEditingTravelers = (on: boolean) => setParams(on ? { viajantes: '1' } : {}, { replace: true })
  const grouped = byGroup && trip.groups.length > 0
  const { balances, parties, byParty, transfers } = tripBalances(trip, data, grouped)
  const names = new Map(parties.map((p) => [p.id, p.name]))
  const personName = (id: string) => data.people.get(id)?.name ?? '—'
  const currencies = [...new Set(['BRL', ...trip.currencies, ...[...byParty.values()].flatMap((a) => [...a.keys()])])]
  const alone = data.travelers.length <= 1
  // Celular: abre o compartilhamento (WhatsApp); computador sem ele: copia o texto.
  const canShare = typeof navigator.share === 'function'

  async function share() {
    const text = settlementText(trip!.name, transfers, names, data.rateFor)
    try {
      if (canShare) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // compartilhamento cancelado: nada a fazer
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Acertos</h1>
          <p className="text-sm text-slate-500">Quem deve a quem, em cada moeda</p>
        </div>
        <button className="btn btn-ghost shrink-0 ring-1 ring-slate-200 !px-3" onClick={() => setEditingTravelers(true)}>
          <Users size={18} /> <span className="hidden sm:inline">Viajantes</span>
        </button>
      </div>

      {trips.length > 1 && (
        <div>
          <label className="label !text-xs" htmlFor="ac-viagem">Viagem</label>
          <select id="ac-viagem" className="field" value={trip.id} onChange={(e) => setLocal(ACTIVE_TRIP, e.target.value)}>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.closed ? ' (encerrada)' : ''}
                {pending.some((p) => p.trip.id === t.id) ? ' • a acertar' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <PendingCard pending={pending.filter((p) => p.trip.id !== trip.id)} />

      {alone ? (
        <section className="card space-y-3 p-5 text-center">
          <Users size={36} className="mx-auto text-slate-400" />
          <p className="font-medium">Você está viajando sozinho nesta viagem.</p>
          <p className="text-sm text-slate-500">
            Cadastre quem vai junto (e, se quiser, grupos como casais). Depois, em cada gasto, escolha quem pagou e entre quem
            dividir: o app calcula quanto cada um tem a pagar e a receber.
          </p>
          <button className="btn btn-primary" onClick={() => setEditingTravelers(true)}>
            <Users size={18} /> Cadastrar viajantes
          </button>
        </section>
      ) : (
        <>
          {trip.groups.length > 0 && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/60 p-1 text-sm font-semibold">
              <button className={`rounded-md py-1.5 ${!grouped ? 'seg-on' : 'text-slate-600'}`} onClick={() => setByGroup(false)}>
                Por pessoa
              </button>
              <button className={`rounded-md py-1.5 ${grouped ? 'seg-on' : 'text-slate-600'}`} onClick={() => setByGroup(true)}>
                Por grupo
              </button>
            </div>
          )}

          <section className="card divide-y divide-slate-100 overflow-hidden">
            {parties.map((p) => {
              const amounts = [...(byParty.get(p.id) ?? [])]
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar id={p.id} name={p.name} group={p.isGroup} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {p.isGroup ? p.memberIds.map(personName).join(', ') : amounts.length === 0 ? 'Tudo acertado' : amounts.some(([, v]) => v > 0) ? 'Tem a receber' : 'Tem a pagar'}
                    </span>
                  </span>
                  <span className="shrink-0 space-y-0.5 text-right">
                    {amounts.length === 0 && <span className={`text-sm ${VALUE_STYLE.apagado}`}>—</span>}
                    {amounts.map(([currency, value]) => (
                      <span key={currency} className={`flex items-center justify-end gap-1.5 font-semibold tabular-nums ${balanceClass(value)}`}>
                        <CurrencyBadge code={currency} /> {signedMoney(value, currency)}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
          </section>
          <p className="-mt-2 px-1 text-xs text-slate-500">
            <span className={VALUE_STYLE.receber}>+ verde</span> tem a receber · <span className={VALUE_STYLE.pagar}>− vermelho</span> tem a pagar.
            {grouped && ' No grupo, o que um membro deve ao outro se anula.'}
          </p>

          <section>
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamentos sugeridos</h2>
              {transfers.length > 0 && (
                <button className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:underline" onClick={share}>
                  {copied ? <Check size={14} /> : canShare ? <Share2 size={14} /> : <Copy size={14} />}
                  {copied ? 'Copiado' : 'Mandar no WhatsApp'}
                </button>
              )}
            </div>
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {transfers.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nada a acertar: ninguém deve nada.</p>}
              {transfers.map((t) => (
                <div key={`${t.fromId}-${t.toId}-${t.currency}`} className="flex items-center gap-2 px-3 py-2.5">
                  <Avatar id={t.fromId} name={names.get(t.fromId) ?? ''} size="sm" group={parties.find((p) => p.id === t.fromId)?.isGroup} />
                  <span className="min-w-0 truncate text-sm font-medium">{names.get(t.fromId)}</span>
                  <ArrowRight size={14} className="shrink-0 text-slate-400" />
                  <Avatar id={t.toId} name={names.get(t.toId) ?? ''} size="sm" group={parties.find((p) => p.id === t.toId)?.isGroup} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{names.get(t.toId)}</span>
                  <span className="flex shrink-0 items-center gap-1.5 font-semibold tabular-nums">
                    <CurrencyBadge code={t.currency} /> {formatMoney(t.amount, t.currency)}
                  </span>
                  <button className="btn btn-ghost !p-1.5" aria-label="Registrar este acerto" title="Registrar acerto" onClick={() => setForm(t)}>
                    <HandCoins size={18} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <button
            className="btn btn-primary w-full sm:w-auto"
            onClick={() => setForm({ fromId: parties.find((p) => !p.memberIds.includes('eu'))?.id ?? parties[0].id, toId: parties.find((p) => p.memberIds.includes('eu'))?.id ?? parties[0].id, currency: trip.currencies[0] ?? 'BRL', amount: 0 })}
          >
            <HandCoins size={18} /> Registrar outro acerto
          </button>

          {data.settlements.length > 0 && (
            <section>
              <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Acertos feitos</h2>
              <div className="card divide-y divide-slate-100 overflow-hidden">
                {batches(data.settlements).map((rows) => {
                  const first = rows[0]
                  const from = [...new Set(rows.map((r) => personName(r.fromId)))].join(', ')
                  const to = [...new Set(rows.map((r) => personName(r.toId)))].join(', ')
                  const amount = rows.reduce((sum, r) => sum + r.amount, 0)
                  const paid = rows.reduce((sum, r) => sum + (r.paidAmount ?? 0), 0)
                  return (
                    <div key={first.batchId} className="flex items-center gap-3 px-3 py-2.5">
                      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEditing(rows)} aria-label={`Editar acerto ${from} para ${to}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{from} → {to}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {shortDate(first.date)}
                          {first.note && ` · ${first.note}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="flex items-center justify-end gap-1.5 font-semibold tabular-nums">
                          <CurrencyBadge code={first.currency} /> {formatMoney(amount, first.currency)}
                        </span>
                        {first.paidCurrency && (
                          <span className="block text-xs text-slate-500 tabular-nums">
                            pago {formatMoney(paid, first.paidCurrency)}
                            {first.rate ? ` a ${formatRate(first.rate)}` : ''}
                            {first.spreadPct || first.iofPct ? ' + taxas' : ''}
                          </span>
                        )}
                      </span>
                      </button>
                      <button className="btn btn-danger !p-1.5" aria-label="Excluir acerto" onClick={() => setDeleting(rows)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {editingTravelers && <TravelersModal trip={trip} data={data} onClose={() => setEditingTravelers(false)} />}
      {form && (
        <SettlementForm
          trip={trip}
          parties={parties}
          balances={balances}
          rateFor={data.rateFor}
          currencies={currencies}
          wallets={wallets}
          people={data.people}
          draft={form}
          onClose={() => setForm(null)}
        />
      )}
      {editing && (() => {
        const ctx = editContext(trip, data, editing)
        return (
          <SettlementForm
            trip={trip}
            parties={ctx.parties}
            balances={ctx.balances}
            rateFor={data.rateFor}
            currencies={currencies}
            wallets={wallets}
            people={data.people}
            draft={ctx.draft}
            editing={editing}
            onClose={() => setEditing(null)}
          />
        )
      })()}
      {deleting && (
        <ConfirmDialog
          title="Excluir acerto"
          message="O valor volta a aparecer como devido. Isso não pode ser desfeito."
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteSettlementBatch(deleting[0].batchId)
            setDeleting(null)
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
