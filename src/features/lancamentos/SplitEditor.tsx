import { ChevronDown, ChevronUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Badges'
import { MoneyInput } from '../../components/MoneyInput'
import { ME, SPLIT_MODE_LABEL, type Expense, type PaymentMethod, type Person, type SplitMode, type Trip } from '../../db/types'
import { walletsOf } from '../../domain/titular'
import { decimalText, parseDecimal } from '../../domain/moeda'
import { payersOf, sharesOf } from '../../domain/rateio'
import { allocate } from '../../domain/saldos'
import { formatMoney } from '../../lib/format'

export interface SplitState {
  /** Seção aberta: o gasto é dividido ou foi pago por outra pessoa. Fechada = gasto meu, pago por mim. */
  open: boolean
  payers: string[]
  /** Quanto cada pagador pagou, quando são vários. */
  payerAmounts: Record<string, number>
  /** Meio que cada outra pessoa usou (carteira dela); '' = outro meio, sem controle. O meu fica no formulário. */
  payerMethods: Record<string, string>
  participants: string[]
  mode: SplitMode
  /** Cotas digitadas (texto), por pessoa. */
  weights: Record<string, string>
  /** Valores exatos, por pessoa. */
  amounts: Record<string, number>
}

/** Estado inicial a partir do gasto (ou de um gasto novo: fechado, meu). */
export function splitStateOf(expense?: Expense): SplitState {
  const payers = expense ? payersOf(expense) : [{ personId: ME, amount: 0 }]
  const shares = expense?.split?.shares ?? []
  return {
    open: !!expense && (!!expense.split || payers.length > 1 || payers[0].personId !== ME),
    payers: payers.map((p) => p.personId),
    payerAmounts: Object.fromEntries(payers.map((p) => [p.personId, p.amount])),
    payerMethods: Object.fromEntries(payers.filter((p) => p.personId !== ME).map((p) => [p.personId, p.methodId ?? ''])),
    participants: shares.length ? shares.map((s) => s.personId) : [ME],
    mode: expense?.split?.mode ?? 'igual',
    weights: Object.fromEntries(shares.map((s) => [s.personId, decimalText(s.weight ?? 1)])),
    amounts: Object.fromEntries(shares.map((s) => [s.personId, s.amount ?? 0])),
  }
}

/**
 * Quem pagou, para gravar: um só (`payerId` + `methodId`) ou vários com o valor e o meio de cada (`payers`, e o meu
 * meio também em `methodId`). `myMethodId` = o meio que escolhi no formulário.
 */
export function payersFrom(s: SplitState, myMethodId = '') {
  const methodOf = (id: string) => (id === ME ? myMethodId : (s.payerMethods[id] ?? ''))
  if (!s.open) return { payerId: ME, payers: undefined, methodId: myMethodId }
  if (s.payers.length <= 1) {
    const payerId = s.payers[0] ?? ME
    return { payerId, payers: undefined, methodId: methodOf(payerId) }
  }
  return {
    payerId: undefined,
    payers: s.payers.map((personId) => ({ personId, amount: s.payerAmounts[personId] ?? 0, methodId: methodOf(personId) || undefined })),
    methodId: s.payers.includes(ME) ? myMethodId : '',
  }
}

/** Quanto eu paguei do total (é a parte que usa meio de pagamento e câmbio). */
export function myPaid(s: SplitState, amount: number): number {
  const { payerId, payers } = payersFrom(s)
  if (payers) return payers.find((p) => p.personId === ME)?.amount ?? 0
  return payerId === ME ? amount : 0
}

/** Divisão a gravar: fechada, ou só "Eu" participando, não precisa de divisão. */
export function splitFrom(s: SplitState) {
  if (!s.open || (s.participants.length === 1 && s.participants[0] === ME)) return undefined
  return {
    mode: s.mode,
    shares: s.participants.map((personId) => ({
      personId,
      weight: s.mode === 'cotas' ? (parseDecimal(s.weights[personId] ?? '1') ?? 0) : undefined,
      amount: s.mode === 'valores' ? (s.amounts[personId] ?? 0) : undefined,
    })),
  }
}

interface Props {
  trip: Trip
  people: Person[]
  /** Carteiras ativas (minhas e dos pares), para o "pago com" de quem não sou eu. */
  wallets: PaymentMethod[]
  amount: number
  currency: string
  state: SplitState
  onChange: (next: SplitState) => void
}

const MODES: SplitMode[] = ['igual', 'cotas', 'valores']

/** Quem pagou e entre quem o gasto é dividido. Recolhido por padrão: a maioria dos gastos é só minha. */
export function SplitEditor({ trip, people, wallets, amount, currency, state, onChange }: Props) {
  const set = (patch: Partial<SplitState>) => onChange({ ...state, ...patch })
  const chosen = new Set(state.participants)
  const paying = new Set(state.payers)
  const toggle = (id: string) =>
    set({ participants: chosen.has(id) ? state.participants.filter((p) => p !== id) : [...state.participants, id] })
  const setMany = (ids: string[]) => {
    const allIn = ids.every((id) => chosen.has(id))
    set({ participants: allIn ? state.participants.filter((p) => !ids.includes(p)) : [...new Set([...state.participants, ...ids])] })
  }
  /** Carteiras da pessoa que pagam nesta moeda (carteira só paga em moeda estrangeira). */
  const walletsFor = (p: Person) => (currency === 'BRL' ? [] : walletsOf(p, wallets))
  function togglePayer(id: string) {
    const next = paying.has(id) ? state.payers.filter((p) => p !== id) : [...state.payers, id]
    if (next.length === 0) return // alguém precisa ter pagado
    // Quem entra pagando já vem com a carteira dele, se tiver uma.
    const person = people.find((p) => p.id === id)
    const payerMethods = { ...state.payerMethods }
    if (person && id !== ME && !(id in payerMethods)) payerMethods[id] = walletsFor(person)[0]?.id ?? ''
    set({ payers: next, payerAmounts: equalAmounts(next), payerMethods })
  }
  const equalAmounts = (ids: string[]) =>
    Object.fromEntries(allocate(amount, ids.map((id) => ({ id, weight: 1 }))).map((a) => [a.id, a.amount]))

  const split = splitFrom(state)
  const shares = sharesOf(amount, split, state.payers[0])
  const typed = state.participants.reduce((sum, id) => sum + (state.amounts[id] ?? 0), 0)
  const paidTyped = state.payers.reduce((sum, id) => sum + (state.payerAmounts[id] ?? 0), 0)

  if (people.length <= 1) {
    return (
      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        Viajando com mais gente?{' '}
        <Link to="/acertos?viajantes=1" className="font-medium text-slate-700 underline">Cadastre os viajantes</Link> para
        dividir gastos e controlar o que cada um deve.
      </p>
    )
  }

  if (!state.open) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl bg-slate-50 p-3 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
        onClick={() => set({ open: true, payerAmounts: equalAmounts(state.payers) })}
      >
        <Users size={16} className="text-slate-400" />
        <span className="flex-1">Dividir ou pago por outra pessoa</span>
        <ChevronDown size={16} />
      </button>
    )
  }

  const chip = (on: boolean) =>
    `flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium ring-1 ${
      on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'
    }`

  return (
    <section className="space-y-3 rounded-xl bg-slate-50 p-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm font-semibold"
        onClick={() => set({ open: false, payers: [ME], participants: [ME] })}
        title="Voltar a ser um gasto só meu, pago por mim"
      >
        <Users size={16} className="text-slate-400" />
        <span className="flex-1">Divisão do gasto</span>
        <span className="text-xs font-medium text-slate-500">só meu</span>
        <ChevronUp size={16} />
      </button>

      <div>
        <span className="label !text-xs">Quem pagou {state.payers.length > 1 && '(várias pessoas)'}</span>
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button key={p.id} type="button" className={chip(paying.has(p.id))} onClick={() => togglePayer(p.id)} aria-pressed={paying.has(p.id)}>
              <Avatar id={p.id} name={p.name} size="sm" /> {p.name}
            </button>
          ))}
        </div>
        {(state.payers.length > 1 || !paying.has(ME)) && (
          <div className="mt-2 space-y-2">
            {people.filter((p) => paying.has(p.id)).map((p) => (
              <div key={p.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Avatar id={p.id} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name} pagou</span>
                  {state.payers.length > 1 && (
                    <MoneyInput
                      className="field !w-32 !py-1 text-right text-sm"
                      aria-label={`Quanto ${p.name} pagou`}
                      value={state.payerAmounts[p.id] ?? 0}
                      currency={currency}
                      onChange={(v) => set({ payerAmounts: { ...state.payerAmounts, [p.id]: v } })}
                    />
                  )}
                </div>
                {p.id !== ME && (
                  <select
                    className="field !py-1 text-sm"
                    aria-label={`Meio que ${p.name} usou`}
                    value={state.payerMethods[p.id] ?? ''}
                    onChange={(e) => set({ payerMethods: { ...state.payerMethods, [p.id]: e.target.value } })}
                  >
                    {walletsFor(p).map((w) => (
                      <option key={w.id} value={w.id}>{w.name} (sai do saldo)</option>
                    ))}
                    <option value="">Outro meio (sem controle de saldo)</option>
                  </select>
                )}
              </div>
            ))}
            {state.payers.length > 1 && <div className="flex items-center justify-between text-xs">
              <button type="button" className="font-medium text-slate-500 hover:underline" onClick={() => set({ payerAmounts: equalAmounts(state.payers) })}>
                Dividir igual entre quem pagou
              </button>
              {paidTyped !== amount && (
                <span className="text-amber-600">
                  {paidTyped < amount ? `Faltam ${formatMoney(amount - paidTyped, currency)}` : `Passou ${formatMoney(paidTyped - amount, currency)}`}
                </span>
              )}
            </div>}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">Dividir entre</span>
          <span className="flex flex-wrap gap-2 text-xs font-medium">
            <button type="button" className="text-slate-500 hover:underline" onClick={() => set({ participants: people.map((p) => p.id) })}>Todos</button>
            {trip.groups.map((g) => (
              <button key={g.id} type="button" className="text-slate-500 hover:underline" onClick={() => setMany(g.memberIds)}>{g.name}</button>
            ))}
            <button type="button" className="text-slate-500 hover:underline" onClick={() => set({ participants: [ME] })}>Só eu</button>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button key={p.id} type="button" className={chip(chosen.has(p.id))} onClick={() => toggle(p.id)} aria-pressed={chosen.has(p.id)}>
              <Avatar id={p.id} name={p.name} size="sm" /> {p.name}
            </button>
          ))}
        </div>
      </div>

      {state.participants.length > 1 && (
        <>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200/60 p-1">
            {MODES.map((m) => (
              <button key={m} type="button" onClick={() => set({ mode: m })} className={`rounded-md py-1.5 text-xs font-semibold ${state.mode === m ? 'seg-on' : 'text-slate-600'}`}>
                {SPLIT_MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-slate-200/70">
            {people.filter((p) => chosen.has(p.id)).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <Avatar id={p.id} name={p.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                {state.mode === 'cotas' && (
                  <input
                    className="field !w-16 !py-1 text-center text-sm"
                    inputMode="decimal"
                    aria-label={`Cotas de ${p.name}`}
                    value={state.weights[p.id] ?? '1'}
                    onChange={(e) => set({ weights: { ...state.weights, [p.id]: e.target.value } })}
                  />
                )}
                {state.mode === 'valores' ? (
                  <MoneyInput
                    className="field !w-32 !py-1 text-right text-sm"
                    aria-label={`Parte de ${p.name}`}
                    value={state.amounts[p.id] ?? 0}
                    currency={currency}
                    onChange={(v) => set({ amounts: { ...state.amounts, [p.id]: v } })}
                  />
                ) : (
                  <span className="w-24 text-right text-sm font-medium tabular-nums">{formatMoney(shares.get(p.id) ?? 0, currency)}</span>
                )}
              </li>
            ))}
          </ul>
          {state.mode === 'valores' && typed !== amount && (
            <p className="text-xs text-amber-600">
              {typed < amount ? `Faltam ${formatMoney(amount - typed, currency)}` : `Passou ${formatMoney(typed - amount, currency)}`} para fechar o total.
            </p>
          )}
        </>
      )}

      {!paying.has(ME) && (
        <p className="text-xs text-slate-500">
          Você não pagou nada deste gasto, então ele não pede meio de pagamento nem câmbio.
          {chosen.has(ME) && ' A sua parte fica como valor a pagar em Acertos.'}
        </p>
      )}
      {paying.has(ME) && state.payers.length > 1 && (
        <p className="text-xs text-slate-500">Meio de pagamento e câmbio valem só para a parte que você pagou.</p>
      )}
    </section>
  )
}
