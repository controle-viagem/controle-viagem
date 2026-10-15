import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { MoneyInput } from '../../components/MoneyInput'
import { deleteSettlementBatch, saveSettlementBatch } from '../../db/repo'
import type { PaymentMethod, Person, Settlement, Trip } from '../../db/types'
import { walletsOf } from '../../domain/titular'
import { cardCharge, effectiveRate } from '../../domain/cambio'
import type { RateLookup } from '../../domain/custoViagem'
import { decimalText, parseDecimal } from '../../domain/moeda'
import { settlementRows, type Balances, type Party } from '../../domain/saldos'
import { formatBRL, formatMoney, formatRate, todayISO } from '../../lib/format'

export interface SettlementDraft {
  fromId: string
  toId: string
  currency: string
  amount: number
}

interface Props {
  trip: Trip
  parties: Party[]
  /** Saldos usados para dividir um acerto de grupo entre os membros (sem o próprio acerto, quando é edição). */
  balances: Balances
  rateFor: RateLookup
  /** Moedas oferecidas: as que têm saldo e as da viagem. */
  currencies: string[]
  draft: SettlementDraft
  /** Linhas do acerto que está sendo editado (o lote inteiro). */
  editing?: Settlement[]
  /** Carteiras ativas (minhas e dos pares) e os viajantes, para "saiu de" / "entrou em". */
  wallets: PaymentMethod[]
  people: Map<string, Person>
  onClose: () => void
}

/**
 * Registrar ou corrigir um pagamento entre pessoas ou grupos. A dívida é sempre na moeda dela; o pagamento pode ter
 * sido feito em reais (ex.: Pix), pela cotação combinada, com spread e IOF quando houver (como num cartão ou casa de
 * câmbio). Entre grupos, vira uma linha por pessoa (`settlementRows`); editar substitui o lote inteiro.
 */
export function SettlementForm({ trip, parties, balances, rateFor, currencies, draft, editing, wallets, people, onClose }: Props) {
  const first = editing?.[0]
  const sum = (key: 'amount' | 'paidAmount') => (editing ?? []).reduce((total, r) => total + (r[key] ?? 0), 0)
  const [currency, setCurrency] = useState(draft.currency)
  const [fromId, setFromId] = useState(draft.fromId)
  const [toId, setToId] = useState(draft.toId)
  const [amount, setAmount] = useState(draft.amount)
  const [date, setDate] = useState(first?.date ?? todayISO())
  const [inBRL, setInBRL] = useState(!!first?.paidCurrency)
  const [rate, setRate] = useState(decimalText(first?.rate ?? rateFor(draft.currency) ?? undefined, 4))
  const [spread, setSpread] = useState(decimalText(first?.spreadPct ?? 0))
  const [iof, setIof] = useState(decimalText(first?.iofPct ?? 0))
  // Valor em reais digitado; sem ele, vale o calculado pela cotação, spread e IOF.
  const [brlTyped, setBrlTyped] = useState<number | null>(first?.paidCurrency && first.rate === undefined ? sum('paidAmount') : null)
  const [note, setNote] = useState(first?.note ?? '')
  const [fromWallet, setFromWallet] = useState(first?.fromWalletId ?? '')
  const [toWallet, setToWallet] = useState(first?.toWalletId ?? '')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const foreign = currency !== 'BRL'
  const rateN = parseDecimal(rate)
  const spreadN = parseDecimal(spread) ?? 0
  const iofN = parseDecimal(iof) ?? 0
  const charge = rateN ? cardCharge(amount, rateN, spreadN, iofN) : null
  const brl = brlTyped ?? charge?.total ?? 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    const from = parties.find((p) => p.id === fromId)
    const to = parties.find((p) => p.id === toId)
    if (!from || !to || fromId === toId) return setError('Escolha quem pagou e quem recebeu (pessoas diferentes).')
    if (!(amount > 0)) return setError('Informe o valor.')
    if (inBRL && !(brl > 0)) return setError('Informe a cotação ou o valor pago em reais.')
    const paidInBRL = foreign && inBRL
    // Carteiras só no pagamento em moeda (não em reais) e só as que ainda servem para as partes escolhidas.
    const inCurrency = foreign && !inBRL
    const fromWalletId = inCurrency && walletsOfParty(fromId).some((w) => w.id === fromWallet) ? fromWallet : undefined
    const toWalletId = inCurrency && walletsOfParty(toId).some((w) => w.id === toWallet) ? toWallet : undefined
    const rows = settlementRows(from, to, currency, amount, balances, paidInBRL ? brl : undefined)
    if (rows.length === 0) return setError('Nada a registrar entre essas pessoas.')
    await saveSettlementBatch(
      rows.map((r) => ({
        tripId: trip.id, date, fromId: r.fromId, toId: r.toId, currency, amount: r.amount,
        fromWalletId,
        toWalletId,
        paidCurrency: paidInBRL ? 'BRL' : undefined,
        paidAmount: paidInBRL ? r.paidAmount : undefined,
        // Valor em reais digitado à mão não guarda cotação: ao editar, ele volta como digitado.
        rate: paidInBRL && brlTyped === null ? (rateN ?? undefined) : undefined,
        spreadPct: paidInBRL && brlTyped === null && spreadN ? spreadN : undefined,
        iofPct: paidInBRL && brlTyped === null && iofN ? iofN : undefined,
        note: note.trim(),
      })),
      first?.batchId,
    )
    onClose()
  }

  /** Carteiras dos membros de uma parte (pessoa ou grupo), pelo titular. */
  function walletsOfParty(partyId: string): PaymentMethod[] {
    const members = parties.find((p) => p.id === partyId)?.memberIds ?? []
    return members.flatMap((id) => {
      const person = people.get(id)
      return person ? walletsOf(person, wallets) : []
    })
  }
  const walletSelect = (id: string, label: string, partyId: string, value: string, onChange: (v: string) => void) => (
    <div>
      <label className="label !text-xs" htmlFor={id}>{label}</label>
      <select id={id} className="field !py-1.5 text-sm" value={walletsOfParty(partyId).some((w) => w.id === value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Não controlar</option>
        {walletsOfParty(partyId).map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </div>
  )

  const select = (id: string, value: string, onChange: (v: string) => void, label: string) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )

  const percent = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div>
      <label className="label !text-xs" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setBrlTyped(null)
        }}
      />
    </div>
  )

  return (
    <Modal title={editing ? 'Editar acerto' : 'Registrar acerto'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {select('ac-de', fromId, setFromId, 'Quem pagou')}
          {select('ac-para', toId, setToId, 'Quem recebeu')}
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-3">
          <div>
            <label className="label" htmlFor="ac-valor">Dívida quitada</label>
            <div className="flex gap-1">
              <MoneyInput id="ac-valor" value={amount} onChange={setAmount} currency={currency} />
              <select
                className="field !w-auto !px-2"
                aria-label="Moeda da dívida"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value)
                  setRate(decimalText(rateFor(e.target.value) ?? undefined, 4))
                  setBrlTyped(null)
                  if (e.target.value === 'BRL') setInBRL(false)
                }}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ac-data">Data</label>
            <input id="ac-data" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {foreign && (
          <section className="space-y-3 rounded-xl bg-slate-50 p-3">
            {!inBRL && (walletsOfParty(fromId).length > 0 || walletsOfParty(toId).length > 0) && (
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  {walletSelect('ac-saiu', 'Saiu de', fromId, fromWallet, setFromWallet)}
                  {walletSelect('ac-entrou', 'Entrou em', toId, toWallet, setToWallet)}
                </div>
                <p className="text-xs text-slate-500">
                  Só para o saldo das carteiras (ex.: dinheiro em espécie ou transferência entre Wise); não muda o custo da viagem.
                </p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-slate-900" checked={inBRL} onChange={(e) => setInBRL(e.target.checked)} />
              Pago em reais (ex.: Pix)
            </label>
            {inBRL && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {percent('ac-cot', 'Cotação (R$)', rate, setRate)}
                  {percent('ac-spread', 'Spread (%)', spread, setSpread)}
                  {percent('ac-iof', 'IOF (%)', iof, setIof)}
                </div>
                {charge && brlTyped === null && (
                  <dl className="space-y-0.5 text-sm">
                    <div className="flex justify-between text-slate-500">
                      <dt>{formatMoney(amount, currency)} × {formatRate(rateN!)}</dt>
                      <dd className="tabular-nums">{formatBRL(charge.base)}</dd>
                    </div>
                    {charge.spread > 0 && (
                      <div className="flex justify-between text-slate-500"><dt>Spread</dt><dd className="tabular-nums">{formatBRL(charge.spread)}</dd></div>
                    )}
                    {charge.iof > 0 && (
                      <div className="flex justify-between text-slate-500"><dt>IOF</dt><dd className="tabular-nums">{formatBRL(charge.iof)}</dd></div>
                    )}
                  </dl>
                )}
                <div>
                  <label className="label !text-xs" htmlFor="ac-brl">Valor pago em reais</label>
                  <MoneyInput id="ac-brl" value={brl} onChange={setBrlTyped} />
                  <p className="mt-1 text-xs text-slate-500">
                    {brlTyped !== null
                      ? `Digitado à mão${amount > 0 ? ` · cotação efetiva ${formatRate(effectiveRate(amount, brl))}` : ''}. `
                      : 'Calculado pela cotação, spread e IOF; dá para digitar o valor exato. '}
                    A cotação sugerida é o custo médio das suas carteiras (ou a última usada na viagem). Spread e IOF só se
                    o pagamento teve (ex.: casa de câmbio ou cartão).
                  </p>
                  {brlTyped !== null && (
                    <button type="button" className="mt-1 text-xs font-medium text-slate-500 hover:underline" onClick={() => setBrlTyped(null)}>
                      Voltar a calcular pela cotação
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        <div>
          <label className="label" htmlFor="ac-obs">Observação (opcional)</label>
          <input id="ac-obs" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Ex.: Pix no fim da viagem" />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-2">
          {editing && (
            <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar acerto</button>
        </div>
      </form>

      {deleting && first && (
        <ConfirmDialog
          title="Excluir acerto"
          message="O valor volta a aparecer como devido. Isso não pode ser desfeito."
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteSettlementBatch(first.batchId)
            onClose()
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Modal>
  )
}
