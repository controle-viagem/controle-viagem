import { ChevronDown, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useApp } from '../../app/AppContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { MoneyInput } from '../../components/MoneyInput'
import { deleteWalletMove, saveWalletMove } from '../../db/repo'
import { WALLET_MOVE_LABEL, type PaymentMethod, type WalletMove, type WalletMoveKind } from '../../db/types'
import { cardCharge, effectiveRate } from '../../domain/cambio'
import { ledger } from '../../domain/custoMedio'
import { CURRENCIES, currencyName, decimalText, parseDecimal } from '../../domain/moeda'
import { moveError } from '../../domain/movimento'
import { balances } from '../../domain/saldoCarteira'
import { formatBRL, formatMoney, formatRate, shortDate, todayISO } from '../../lib/format'
import type { WalletData } from './useWalletData'

interface Props {
  kind: WalletMoveKind
  move?: WalletMove
  /** Carteiras que podem ser escolhidas (as não arquivadas, mais a do movimento em edição). */
  wallets: PaymentMethod[]
  data: WalletData
  onClose: () => void
}

const HINT: Record<WalletMoveKind, string> = {
  carga: 'Compra de moeda com reais: carga do cartão multimoeda ou compra em casa de câmbio.',
  conversao: 'Troca de uma moeda por outra dentro da mesma carteira. O custo em reais vai junto para a moeda recebida.',
  transferencia:
    'Mesma moeda de uma carteira para outra, como o saque do cartão para espécie. A tarifa sai da origem e encarece o que chega.',
  ajuste: 'Correção do saldo quando ele não bate com o real (sobra esquecida, dinheiro perdido).',
  venda: 'A sobra vendida de volta por reais. Sai pelo custo médio e mostra o ganho ou a perda.',
}

export function MoveForm({ kind, move, wallets, data, onClose }: Props) {
  const { trip } = useApp()
  const currencies = [...(trip?.currencies ?? []), ...CURRENCIES.filter((c) => c !== 'BRL' && !trip?.currencies.includes(c))]
  const [date, setDate] = useState(move?.date ?? todayISO())
  const [walletId, setWalletId] = useState(move?.walletId ?? wallets[0]?.id ?? '')
  const [currency, setCurrency] = useState(move?.currency ?? currencies[0] ?? 'USD')
  const [amount, setAmount] = useState(Math.abs(move?.amount ?? 0))
  const [out, setOut] = useState((move?.amount ?? 0) < 0)
  const [brlAmount, setBrlAmount] = useState(move?.brlAmount ?? 0)
  const [showDetails, setShowDetails] = useState(!!(move?.rate || move?.brlFee))
  const [rate, setRate] = useState(decimalText(move?.rate))
  const [spread, setSpread] = useState(decimalText(move?.spreadPct))
  const [iof, setIof] = useState(decimalText(move?.iofPct))
  const [brlFee, setBrlFee] = useState(move?.brlFee ?? 0)
  const [toCurrency, setToCurrency] = useState(move?.toCurrency ?? currencies.find((c) => c !== currency) ?? 'EUR')
  const [toAmount, setToAmount] = useState(move?.toAmount ?? 0)
  const [toWalletId, setToWalletId] = useState(move?.toWalletId ?? wallets.find((w) => w.id !== walletId)?.id ?? '')
  const [fee, setFee] = useState(move?.fee ?? 0)
  const [note, setNote] = useState(move?.note ?? '')
  const [createdAt] = useState(() => move?.createdAt ?? new Date().toISOString())
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const rateN = parseDecimal(rate)
  const spreadN = parseDecimal(spread) ?? 0
  const iofN = parseDecimal(iof) ?? 0
  const fromDetails = kind === 'carga' && rateN && amount > 0 ? cardCharge(amount, rateN, spreadN, iofN).total + brlFee : null

  const fields: Omit<WalletMove, 'id' | 'createdAt' | 'updatedAt'> = {
    kind,
    date,
    walletId,
    currency,
    amount: kind === 'ajuste' && out ? -amount : amount,
    // Só os campos do tipo do movimento; undefined apaga o campo ao editar.
    brlAmount: kind === 'carga' || kind === 'venda' || (kind === 'ajuste' && !out && brlAmount) ? brlAmount : undefined,
    rate: kind === 'carga' && showDetails ? (rateN ?? undefined) : undefined,
    spreadPct: kind === 'carga' && showDetails && rateN ? spreadN : undefined,
    iofPct: kind === 'carga' && showDetails && rateN ? iofN : undefined,
    brlFee: kind === 'carga' && showDetails && brlFee ? brlFee : undefined,
    toCurrency: kind === 'conversao' ? toCurrency : undefined,
    toAmount: kind === 'conversao' ? toAmount : undefined,
    toWalletId: kind === 'transferencia' ? toWalletId : undefined,
    fee: kind === 'transferencia' && fee ? fee : undefined,
    note: note.trim(),
  }

  // Prévia com este movimento no lugar dele: custo pelo médio e saldo da origem.
  const id = move?.id ?? 'novo'
  const draft: WalletMove = { ...fields, id, createdAt, updatedAt: '' }
  const ready = !!walletId && amount > 0
  const moves = [...data.moves.filter((m) => m.id !== id), draft]
  const cost = ready ? (ledger(moves, data.spends, data.settlements).moveCosts.get(id) ?? 0) : 0
  const origin = ready ? balances(moves, data.spends, data.settlements).find((b) => b.walletId === walletId && b.currency === currency) : undefined
  const walletName = wallets.find((w) => w.id === walletId)?.name ?? ''
  const takesOut = kind !== 'carga' && !(kind === 'ajuste' && !out)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = moveError(fields)
    if (problem) return setError(problem)
    await saveWalletMove({ id: move?.id, ...fields })
    onClose()
  }

  const walletSelect = (htmlId: string, label: string, value: string, onChange: (v: string) => void, except?: string) => (
    <div>
      <label className="label" htmlFor={htmlId}>{label}</label>
      <select id={htmlId} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">Escolha…</option>}
        {wallets.filter((w) => w.id !== except).map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </div>
  )

  const currencySelect = (htmlId: string, value: string, onChange: (v: string) => void) => (
    <select id={htmlId} className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Moeda">
      {currencies.map((c) => (
        <option key={c} value={c} title={currencyName(c)}>{c}</option>
      ))}
    </select>
  )

  return (
    <Modal title={`${move ? 'Editar' : 'Nova'} ${WALLET_MOVE_LABEL[kind].toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-slate-500">{HINT[kind]}</p>

        {kind === 'transferencia' ? (
          <div className="grid grid-cols-2 gap-3">
            {walletSelect('mv-cart', 'De', walletId, setWalletId)}
            {walletSelect('mv-dest', 'Para', toWalletId, setToWalletId, walletId)}
          </div>
        ) : (
          walletSelect('mv-cart', 'Carteira', walletId, setWalletId)
        )}

        {kind === 'ajuste' && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {[false, true].map((o) => (
              <label key={String(o)} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm font-medium ${out === o ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                <input type="radio" name="sentido" className="accent-slate-900" checked={out === o} onChange={() => setOut(o)} />
                {o ? 'Tirar do saldo' : 'Somar ao saldo'}
              </label>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="label" htmlFor="mv-valor">
              {kind === 'carga' ? 'Valor carregado' : kind === 'conversao' ? 'Valor que sai' : kind === 'transferencia' ? 'Valor que chega' : kind === 'venda' ? 'Valor vendido' : 'Valor'}
            </label>
            <MoneyInput id="mv-valor" value={amount} onChange={setAmount} currency={currency} autoFocus={!move} />
          </div>
          <div>
            <span className="label">Moeda</span>
            {currencySelect('mv-moeda', currency, setCurrency)}
          </div>
        </div>

        {kind === 'conversao' && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="label" htmlFor="mv-recebido">Valor recebido</label>
              <MoneyInput id="mv-recebido" value={toAmount} onChange={setToAmount} currency={toCurrency} />
            </div>
            <div>
              <span className="label">Moeda</span>
              {currencySelect('mv-moeda2', toCurrency, setToCurrency)}
            </div>
            {amount > 0 && toAmount > 0 && (
              <p className="col-span-2 text-xs text-slate-500">
                {formatMoney(100, toCurrency)} = {formatMoney(Math.round((amount / toAmount) * 100), currency)}
              </p>
            )}
          </div>
        )}

        {kind === 'transferencia' && (
          <div>
            <label className="label" htmlFor="mv-tarifa">Tarifa do saque (opcional)</label>
            <MoneyInput id="mv-tarifa" value={fee} onChange={setFee} currency={currency} />
            <p className="mt-1 text-xs text-slate-500">Sai da carteira de origem, além do valor que chega.</p>
          </div>
        )}

        {(kind === 'carga' || kind === 'venda' || (kind === 'ajuste' && !out)) && (
          <div>
            <label className="label" htmlFor="mv-brl">
              {kind === 'carga' ? 'Total pago em reais' : kind === 'venda' ? 'Total recebido em reais' : 'Quanto custou em reais (opcional)'}
            </label>
            <MoneyInput id="mv-brl" value={brlAmount} onChange={setBrlAmount} />
            {kind === 'carga' && brlAmount > 0 && amount > 0 && (
              <p className="mt-1 text-xs text-slate-500">Cotação efetiva {formatRate(effectiveRate(amount, brlAmount))} (com spread, IOF e tarifa)</p>
            )}
            {kind === 'ajuste' && <p className="mt-1 text-xs text-slate-500">Em branco, entra pelo custo médio atual.</p>}
          </div>
        )}

        {kind === 'carga' &&
          (showDetails ? (
            <section className="space-y-3 rounded-xl bg-slate-50 p-3">
              <h3 className="text-sm font-semibold">Detalhes da carga (opcional)</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label !text-xs" htmlFor="mv-cot">Cotação (R$)</label>
                  <input id="mv-cot" className="field" inputMode="decimal" placeholder="5,50" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
                <div>
                  <label className="label !text-xs" htmlFor="mv-spread">Spread (%)</label>
                  <input id="mv-spread" className="field" inputMode="decimal" placeholder="0" value={spread} onChange={(e) => setSpread(e.target.value)} />
                </div>
                <div>
                  <label className="label !text-xs" htmlFor="mv-iof">IOF (%)</label>
                  <input id="mv-iof" className="field" inputMode="decimal" placeholder="0" value={iof} onChange={(e) => setIof(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label !text-xs" htmlFor="mv-tarifa-brl">Tarifa em reais</label>
                <MoneyInput id="mv-tarifa-brl" value={brlFee} onChange={setBrlFee} />
              </div>
              {fromDetails !== null && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-500">Pela cotação e taxas: <span className="font-semibold text-slate-900 tabular-nums">{formatBRL(fromDetails)}</span></span>
                  {fromDetails !== brlAmount && (
                    <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => setBrlAmount(fromDetails)}>
                      Usar como total
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">Só para os relatórios: o custo médio usa o total pago acima.</p>
            </section>
          ) : (
            <button type="button" className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:underline" onClick={() => setShowDetails(true)}>
              <ChevronDown size={16} /> Detalhar cotação, spread, IOF e tarifa
            </button>
          ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="mv-data">Data</label>
            <input id="mv-data" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mv-obs">Observação</label>
            <input id="mv-obs" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Opcional" />
          </div>
        </div>

        {ready && takesOut && (
          <section className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Custo pelo médio</span>
              <span className="font-semibold tabular-nums">{formatBRL(cost)}</span>
            </div>
            {kind === 'venda' && brlAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">{brlAmount >= cost ? 'Ganho na venda' : 'Perda na venda'}</span>
                <span className={`font-semibold tabular-nums ${brlAmount >= cost ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatBRL(Math.abs(brlAmount - cost))}
                </span>
              </div>
            )}
            {origin && (
              <p className="text-xs text-slate-500">
                Saldo de {currency} em {walletName}, já com este movimento: {formatMoney(origin.units, currency)}
              </p>
            )}
            {origin?.negativeOn && (
              <p className="text-xs text-amber-600">O saldo fica negativo a partir de {shortDate(origin.negativeOn)}. Confira se falta lançar alguma carga.</p>
            )}
          </section>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          {move && (
            <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar</button>
        </div>
      </form>

      {deleting && move && (
        <ConfirmDialog
          title="Excluir movimento"
          message="Este movimento será excluído e o custo médio dos gastos depois dele será recalculado. Isso não pode ser desfeito."
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteWalletMove(move.id)
            onClose()
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Modal>
  )
}
