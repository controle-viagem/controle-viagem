import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Lock, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { MoneyInput } from '../../components/MoneyInput'
import { db } from '../../db/db'
import { addReceipt, deleteExpense, LAST_METHOD, removeReceipt, saveExpense, setLocal } from '../../db/repo'
import type { ShrunkImage } from '../../lib/image'
import { ReceiptsField, type ReceiptDraft } from './ReceiptsField'
import { ME, type Expense, type PaymentMethod, type Trip } from '../../db/types'
import { cardCharge, effectiveRate, iofInside } from '../../domain/cambio'
import { ledger } from '../../domain/custoMedio'
import { expenseError, spendId } from '../../domain/despesa'
import { isMine, methodsFor } from '../../domain/titular'
import { splitTotal, type ExtraMode } from '../../domain/impostos'
import { CURRENCIES, currencyName, decimalText, parseDecimal } from '../../domain/moeda'
import { payersError, splitError } from '../../domain/rateio'
import { balances } from '../../domain/saldoCarteira'
import { phaseOf } from '../../domain/viagem'
import { formatBRL, formatMoney, formatRate, shortDate, todayISO } from '../../lib/format'
import { useWalletData } from '../carteiras/useWalletData'
import { myPaid, payersFrom, SplitEditor, splitFrom, splitStateOf, type SplitState } from './SplitEditor'

interface Props {
  trip: Trip
  expense?: Expense
  onClose: () => void
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')

/** Moedas na ordem de uso: as da viagem, o real e as demais. */
const currencyOptions = (trip: Trip) => [
  ...trip.currencies,
  'BRL',
  ...CURRENCIES.filter((c) => c !== 'BRL' && !trip.currencies.includes(c)),
]

/**
 * Meus meios que pagam na moeda escolhida: em reais, os em reais e os cartões; em outra moeda, os cartões e as minhas
 * carteiras. Os dos outros viajantes (com titular) aparecem para eles, na divisão.
 */
const accepts = (m: PaymentMethod, currency: string) =>
  isMine(m) && (currency === 'BRL' ? m.kind !== 'carteira' : m.kind !== 'brl')

const TAX_MODES: [ExtraMode, string][] = [['pct', 'Taxa %'], ['valor', 'Valor'], ['sem', 'Sem']]
const TIP_MODES: [ExtraMode, string][] = [['sem', 'Sem'], ['pct', '%'], ['valor', 'Valor']]

function Segmented({ value, options, onChange, label }: { value: ExtraMode; options: [ExtraMode, string][]; onChange: (m: ExtraMode) => void; label: string }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200/60 p-1" role="radiogroup" aria-label={label}>
      {options.map(([m, text]) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)} className={`rounded-md py-1 text-xs font-semibold ${value === m ? 'seg-on' : 'text-slate-600'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

export function ExpenseForm({ trip, expense, onClose }: Props) {
  const today = todayISO()
  // Viagem encerrada: só consulta.
  const readOnly = !!trip.closed
  const [date, setDate] = useState(expense?.date ?? today)
  // A pagar: custo já conhecido, ainda não pago (a data vira a data prevista do pagamento).
  const [pending, setPending] = useState(!!expense?.pending)
  // Gasto novo durante a viagem já vem na moeda dela; antes da viagem (passagens, seguro), em reais.
  const [currency, setCurrency] = useState(
    expense?.currency ?? (phaseOf(today, trip) === 'durante' ? (trip.currencies[0] ?? 'BRL') : 'BRL'),
  )
  const [amount, setAmount] = useState(expense?.amount ?? 0)
  const [description, setDescription] = useState(expense?.description ?? '')
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '')
  const [subcategoryId, setSubcategoryId] = useState(expense?.subcategoryId ?? '')
  const [methodId, setMethodId] = useState(expense?.methodId ?? '')
  // Imposto: null = automático (taxa da viagem nas moedas dela); escolhido pela pessoa = fixo.
  const [taxMode, setTaxMode] = useState<ExtraMode | null>(
    expense ? (expense.localTaxPct !== undefined ? 'pct' : expense.localTax ? 'valor' : 'sem') : null,
  )
  const [taxRate, setTaxRate] = useState(decimalText(expense?.localTaxPct ?? trip.localTaxPct))
  const [taxValue, setTaxValue] = useState(expense?.localTax ?? 0)
  const [tipMode, setTipMode] = useState<ExtraMode>(expense ? (expense.tipPct !== undefined ? 'pct' : expense.tip ? 'valor' : 'sem') : 'sem')
  const [tipRate, setTipRate] = useState(decimalText(expense?.tipPct ?? trip.tipPct))
  const [tipValue, setTipValue] = useState(expense?.tip ?? 0)
  const [showExtras, setShowExtras] = useState(!!(expense?.localTax || expense?.tip))
  const [rate, setRate] = useState(decimalText(expense?.rate))
  const [spread, setSpread] = useState(decimalText(expense?.spreadPct))
  const [iof, setIof] = useState(decimalText(expense?.iofPct))
  const [confirmed, setConfirmed] = useState(!!expense?.brlConfirmed)
  const [brlTyped, setBrlTyped] = useState(expense?.brlConfirmed ? (expense.brlAmount ?? 0) : 0)
  const [split, setSplit] = useState<SplitState>(() => splitStateOf(expense))
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  // Comprovantes: os já gravados (menos os tirados agora) e as fotos novas, gravadas ao salvar.
  const savedReceipts = useLiveQuery(() => (expense ? db.receipts.where('expenseId').equals(expense.id).sortBy('createdAt') : []), [expense?.id]) ?? []
  const [newReceipts, setNewReceipts] = useState<ShrunkImage[]>([])
  const [removedReceipts, setRemovedReceipts] = useState<string[]>([])
  const receipts: ReceiptDraft[] = [...savedReceipts.filter((r) => !removedReceipts.includes(r.id)), ...newReceipts]
  function removeReceiptAt(index: number) {
    const photo = receipts[index]
    if (photo.id) setRemovedReceipts((ids) => [...ids, photo.id!])
    else setNewReceipts((list) => list.filter((p) => p !== photo))
  }
  // Momento do cadastro: desempata gastos e movimentos do mesmo dia no custo médio.
  const [createdAt] = useState(() => expense?.createdAt ?? new Date().toISOString())
  const wallet = useWalletData()

  const categories = (useLiveQuery(() => db.categories.toArray(), []) ?? []).sort(byName)
  const methods = (useLiveQuery(() => db.paymentMethods.toArray(), []) ?? []).sort(byName)
  const people = useLiveQuery(async () => {
    const [me, others] = await Promise.all([db.people.get(ME), db.people.where('tripId').equals(trip.id).sortBy('name')])
    return [...(me ? [me] : []), ...others]
  }, [trip.id]) ?? []
  const lastMethod = useLiveQuery(() => db.local.get(LAST_METHOD), [])
  // Cotação do último gasto nesta moeda, nesta viagem: sugerida no próximo.
  const lastRate = useLiveQuery(
    async () =>
      currency === 'BRL'
        ? undefined
        : (await db.expenses.where('tripId').equals(trip.id).filter((e) => e.currency === currency && !!e.rate).sortBy('date'))
            .at(-1)?.rate,
    [trip.id, currency],
  )

  const tops = categories.filter((c) => !c.parentId && (!c.archived || c.id === expense?.categoryId))
  const subs = categories.filter((c) => c.parentId === categoryId && categoryId && (!c.archived || c.id === expense?.subcategoryId))
  const usable = methods.filter((m) => (!m.archived || m.id === expense?.methodId) && accepts(m, currency))

  // Meio escolhido; sem escolha (ou incompatível com a moeda), o último usado, senão o primeiro que serve.
  const lastId = lastMethod?.value as string | undefined
  const method = usable.find((m) => m.id === methodId) ?? usable.find((m) => m.id === lastId) ?? usable[0]
  const foreign = currency !== 'BRL'
  // Meio de pagamento e câmbio valem só para a parte que eu paguei.
  const mine = myPaid(split, amount)
  const paidByMe = mine > 0
  const card = paidByMe && foreign && method?.kind === 'cartao_brl'
  const walletPaid = paidByMe && foreign && method?.kind === 'carteira'

  // Campos de câmbio vazios usam as sugestões: cotação do último gasto, IOF e spread do cartão.
  const rateText = rate || (lastRate !== undefined ? decimalText(lastRate) : '')
  const spreadText = spread || decimalText(method?.spreadPct ?? 0)
  const iofText = iof || decimalText(method?.iofPct ?? 0)
  const rateN = parseDecimal(rateText)
  const spreadN = parseDecimal(spreadText) ?? 0
  const iofN = parseDecimal(iofText) ?? 0
  const estimate = card && rateN ? cardCharge(mine, rateN, spreadN, iofN) : null
  const brlAmount = card ? (confirmed ? brlTyped : estimate?.total) : undefined

  // Imposto local: automático nas moedas da viagem quando ela tem taxa cadastrada.
  const tripTaxApplies = trip.currencies.includes(currency) && !!trip.localTaxPct
  const effectiveTaxMode: ExtraMode = taxMode ?? (tripTaxApplies ? 'pct' : 'sem')
  const extrasOpen = showExtras || effectiveTaxMode !== 'sem' || tipMode !== 'sem'
  const parts = splitTotal(
    amount,
    { mode: effectiveTaxMode, pct: parseDecimal(taxRate) ?? 0, value: taxValue },
    { mode: tipMode, pct: parseDecimal(tipRate) ?? 0, value: tipValue },
  )

  // Pela carteira, o custo em reais é o custo médio no momento do gasto, recalculado com este gasto no lugar dele.
  let fromWallet: { cost: number; units: number; negativeOn: string | null } | null = null
  if (walletPaid && method && mine > 0) {
    const id = spendId(expense?.id ?? 'novo', ME)
    const spends = [...wallet.spends.filter((x) => x.id !== id), { id, date, createdAt, methodId: method.id, currency, amount: mine }]
    const balance = balances(wallet.moves, spends, wallet.settlements).find((b) => b.walletId === method.id && b.currency === currency)
    fromWallet = {
      cost: ledger(wallet.moves, spends, wallet.settlements).expenseCosts.get(id) ?? 0,
      units: balance ? balance.units : -mine,
      negativeOn: balance ? balance.negativeOn : date,
    }
  }

  function toggleConfirmed(on: boolean) {
    setConfirmed(on)
    if (on && !brlTyped && estimate) setBrlTyped(estimate.total)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (readOnly) return
    const draft = {
      currency, amount, categoryId, brlAmount,
      localTax: parts.tax || undefined,
      tip: parts.tip || undefined,
      localTaxPct: effectiveTaxMode === 'pct' ? (parseDecimal(taxRate) ?? undefined) : undefined,
      tipPct: tipMode === 'pct' ? (parseDecimal(tipRate) ?? undefined) : undefined,
    }
    const paid = payersFrom(split, paidByMe ? method!.id : '', (personId, methodId) => {
      const person = people.find((p) => p.id === personId)
      return !!person && methodsFor(person, methods, currency).some((m) => m.id === methodId)
    })
    const division = splitFrom(split)
    const problem = expenseError(draft, method, paidByMe) ?? payersError(amount, paid.payers) ?? splitError(amount, division)
    if (problem) return setError(problem)
    const savedId = await saveExpense({
      id: expense?.id,
      tripId: expense?.tripId ?? trip.id,
      date,
      description: description.trim(),
      subcategoryId: subcategoryId || null,
      ...paid,
      split: division,
      ...draft,
      // Sem câmbio, os campos dele saem do registro (undefined apaga o campo ao editar).
      rate: card ? (rateN ?? undefined) : undefined,
      spreadPct: card ? spreadN : undefined,
      iofPct: card ? iofN : undefined,
      brlConfirmed: card ? confirmed : undefined,
      pending: pending || undefined,
    })
    for (const photo of newReceipts) await addReceipt({ expenseId: savedId, tripId: expense?.tripId ?? trip.id, ...photo })
    for (const id of removedReceipts) await removeReceipt(id)
    if (paidByMe) await setLocal(LAST_METHOD, method!.id)
    onClose()
  }

  return (
    <Modal title={readOnly ? 'Gasto (viagem encerrada)' : expense ? 'Editar gasto' : 'Novo gasto'} onClose={onClose}>
      <form onSubmit={submit}>
        {readOnly && (
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            <Lock size={16} /> A viagem foi encerrada: o gasto fica só para consulta. Reabra a viagem para editar.
          </p>
        )}
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="label" htmlFor="gs-valor">Valor total pago</label>
              <MoneyInput id="gs-valor" value={amount} onChange={setAmount} currency={currency} autoFocus={!expense} />
            </div>
            <div>
              <label className="label" htmlFor="gs-moeda">Moeda</label>
              <select
                id="gs-moeda"
                className="field"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value)
                  setRate('')
                }}
              >
                {currencyOptions(trip).map((c) => (
                  <option key={c} value={c} title={currencyName(c)}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="gs-desc">Descrição (opcional)</label>
            <input id="gs-desc" className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Jantar no Disney Springs" maxLength={80} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="gs-cat">Categoria</label>
              <select
                id="gs-cat"
                className="field"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value)
                  setSubcategoryId('')
                }}
              >
                <option value="">Escolha…</option>
                {tops.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="gs-sub">Subcategoria</label>
              <select id="gs-sub" className="field" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={subs.length === 0}>
                <option value="">{subs.length ? 'Nenhuma' : '—'}</option>
                {subs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-slate-900" checked={!pending} onChange={(e) => setPending(!e.target.checked)} />
            <span>
              <span className="block font-medium">Já foi pago</span>
              <span className="block text-xs text-slate-500">
                {pending
                  ? 'A pagar: entra no custo da viagem como previsto, mas não sai da carteira nem vira dívida em Acertos até você marcar como pago.'
                  : 'Desmarque se o custo já é conhecido mas ainda não foi pago (ex.: transfer, aluguel na retirada).'}
              </span>
            </span>
          </label>

          <SplitEditor trip={trip} people={people} methods={methods.filter((m) => !m.archived)} amount={amount} currency={currency} state={split} onChange={setSplit} />

          <div className="grid grid-cols-2 gap-3">
            <div className={paidByMe ? '' : 'col-span-2'}>
              <label className="label" htmlFor="gs-data">{pending ? 'Pagamento previsto' : 'Data'}</label>
              <input id="gs-data" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {paidByMe && (
              <div>
                <label className="label" htmlFor="gs-meio">{split.payers.length > 1 ? 'Sua parte pagou com' : 'Pago com'}</label>
                <select
                  id="gs-meio"
                  className="field"
                  value={method?.id ?? ''}
                  onChange={(e) => {
                    setMethodId(e.target.value)
                    // Outro cartão: valem o IOF e o spread dele.
                    setSpread('')
                    setIof('')
                  }}
                >
                  {usable.length === 0 && <option value="">Nenhum cartão ou carteira cadastrado</option>}
                  {usable.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {card && (
            <section className="space-y-3 rounded-xl bg-slate-50 p-3">
              <h3 className="text-sm font-semibold">Conversão para reais{mine !== amount && ` (sua parte: ${formatMoney(mine, currency)})`}</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label !text-xs" htmlFor="gs-cot">Cotação (R$)</label>
                  <input id="gs-cot" className="field" inputMode="decimal" placeholder="5,50" value={rateText} onChange={(e) => setRate(e.target.value)} />
                </div>
                <div>
                  <label className="label !text-xs" htmlFor="gs-spread">Spread (%)</label>
                  <input id="gs-spread" className="field" inputMode="decimal" value={spreadText} onChange={(e) => setSpread(e.target.value)} />
                </div>
                <div>
                  <label className="label !text-xs" htmlFor="gs-iof">IOF (%)</label>
                  <input id="gs-iof" className="field" inputMode="decimal" value={iofText} onChange={(e) => setIof(e.target.value)} />
                </div>
              </div>
              {estimate ? (
                <dl className="space-y-0.5 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <dt>{formatMoney(mine, currency)} × {formatRate(rateN!)}</dt>
                    <dd className="tabular-nums">{formatBRL(estimate.base)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <dt>Spread</dt>
                    <dd className="tabular-nums">{formatBRL(estimate.spread)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <dt>IOF</dt>
                    <dd className="tabular-nums">{formatBRL(estimate.iof)}</dd>
                  </div>
                  <div className={`flex justify-between font-semibold ${confirmed ? 'text-slate-400 line-through' : ''}`}>
                    <dt>Estimado na fatura</dt>
                    <dd className="tabular-nums">{formatBRL(estimate.total)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-slate-500">Informe a cotação do dia para estimar, ou o valor da fatura abaixo.</p>
              )}
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="accent-slate-900" checked={confirmed} onChange={(e) => toggleConfirmed(e.target.checked)} />
                Já conferi o valor cobrado em reais (fatura ou app do banco)
              </label>
              {!confirmed && <p className="-mt-2 text-xs text-slate-500">Até conferir, o gasto aparece em "A conferir na fatura".</p>}
              {confirmed && (
                <div>
                  <label className="sr-only" htmlFor="gs-brl">Valor cobrado em reais</label>
                  <MoneyInput id="gs-brl" value={brlTyped} onChange={setBrlTyped} />
                  {brlTyped > 0 && mine > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Cotação efetiva {formatRate(effectiveRate(mine, brlTyped))}
                      {iofN > 0 && ` · IOF incluído ${formatBRL(iofInside(brlTyped, iofN))}`}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {walletPaid && method && (
            <section className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <h3 className="font-semibold">Custo em reais pela carteira</h3>
              {fromWallet ? (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>Custo médio do {currency} no dia</span>
                    <span className="tabular-nums">{fromWallet.cost ? formatRate(effectiveRate(mine, fromWallet.cost)) : '—'}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Custo {mine !== amount ? 'da sua parte' : 'deste gasto'}</span>
                    <span className="tabular-nums">{formatBRL(fromWallet.cost)}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Saldo de {currency} em {method.name}, já com este gasto: {formatMoney(fromWallet.units, currency)}
                  </p>
                  {fromWallet.negativeOn && (
                    <p className="text-xs text-amber-600">
                      {fromWallet.cost === 0
                        ? `A carteira não tem ${currency} nesta data. Lance a carga em Carteiras para o custo em reais ser calculado.`
                        : `O saldo fica negativo a partir de ${shortDate(fromWallet.negativeOn)}. Lance a carga que falta em Carteiras para o custo ficar certo.`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">Calculado pelo custo médio das cargas da carteira, ao informar o valor.</p>
              )}
            </section>
          )}

          {extrasOpen ? (
            <section className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Imposto local e gorjeta</h3>
                <span className="text-xs text-slate-500">dentro do total pago</span>
              </div>
              <div className="grid grid-cols-[1fr_7rem] items-end gap-2">
                <div>
                  <span className="label !text-xs">Imposto</span>
                  <Segmented label="Imposto" value={effectiveTaxMode} options={TAX_MODES} onChange={setTaxMode} />
                </div>
                {effectiveTaxMode === 'pct' && (
                  <input className="field !py-1.5" inputMode="decimal" aria-label="Taxa de imposto (%)" placeholder="%" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                )}
                {effectiveTaxMode === 'valor' && (
                  <MoneyInput className="field !py-1.5" aria-label="Valor do imposto" value={taxValue} onChange={setTaxValue} currency={currency} />
                )}
              </div>
              <div className="grid grid-cols-[1fr_7rem] items-end gap-2">
                <div>
                  <span className="label !text-xs">Gorjeta</span>
                  <Segmented label="Gorjeta" value={tipMode} options={TIP_MODES} onChange={setTipMode} />
                </div>
                {tipMode === 'pct' && (
                  <input className="field !py-1.5" inputMode="decimal" aria-label="Gorjeta (%)" placeholder="%" value={tipRate} onChange={(e) => setTipRate(e.target.value)} />
                )}
                {tipMode === 'valor' && (
                  <MoneyInput className="field !py-1.5" aria-label="Valor da gorjeta" value={tipValue} onChange={setTipValue} currency={currency} />
                )}
              </div>
              {amount > 0 && (
                <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white p-1.5"><dt className="text-slate-500">Preço</dt><dd className="font-semibold tabular-nums">{formatMoney(parts.base, currency)}</dd></div>
                  <div className="rounded-lg bg-white p-1.5"><dt className="text-slate-500">Imposto</dt><dd className="font-semibold tabular-nums">{formatMoney(parts.tax, currency)}</dd></div>
                  <div className="rounded-lg bg-white p-1.5"><dt className="text-slate-500">Gorjeta</dt><dd className="font-semibold tabular-nums">{formatMoney(parts.tip, currency)}</dd></div>
                </dl>
              )}
            </section>
          ) : (
            <button type="button" className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:underline" onClick={() => setShowExtras(true)}>
              <ChevronDown size={16} /> Detalhar imposto local e gorjeta
            </button>
          )}

          <ReceiptsField photos={receipts} onAdd={(list) => setNewReceipts((cur) => [...cur, ...list])} onRemove={removeReceiptAt} readOnly={readOnly} />

          {error && <p className="text-sm text-rose-600">{error}</p>}

          {!readOnly && (
            <div className="flex gap-2 pt-2">
              {expense && (
                <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
                  <Trash2 size={16} /> Excluir
                </button>
              )}
              <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar</button>
            </div>
          )}
        </fieldset>
      </form>

      {deleting && expense && (
        <ConfirmDialog
          title="Excluir gasto"
          message="Este gasto será excluído. Isso não pode ser desfeito."
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteExpense(expense.id)
            onClose()
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Modal>
  )
}
