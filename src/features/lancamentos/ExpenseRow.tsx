import { Check, CircleAlert, Paperclip, Users } from 'lucide-react'
import { useRef } from 'react'
import { useApp } from '../../app/AppContext'
import { CategoryIcon } from '../../components/CategoryIcon'
import { CurrencyBadge } from '../../components/Badges'
import { VALUE_STYLE } from '../../components/valueStyle'
import { ME, type Category, type Expense, type PaymentMethod, type Person } from '../../db/types'
import { partBRL, type RateLookup } from '../../domain/custoViagem'
import { isForeign, type WalletCosts } from '../../domain/despesa'
import { paidBy, payersOf } from '../../domain/rateio'
import { formatBRL, formatMoney } from '../../lib/format'

interface Props {
  expense: Expense
  categories: Map<string, Category>
  methods: Map<string, PaymentMethod>
  people: Map<string, Person>
  walletCosts: WalletCosts
  rateFor: RateLookup
  /** Quantas fotos de comprovante o gasto tem. */
  receipts?: number
  /** Seleção de vários: com ela, tocar marca a linha, e um toque longo liga o modo de seleção. */
  select?: { active: boolean; selected: boolean; toggle: () => void; start: () => void }
}

const LONG_PRESS_MS = 500

/**
 * Linha de gasto. À direita, o valor pago (com o selo da moeda estrangeira) e, embaixo, o que ele custa para mim
 * em reais: o gasto inteiro, ou só a minha parte quando é dividido. Âmbar = ainda estimado.
 */
export function ExpenseRow({ expense: e, categories, methods, people, walletCosts, rateFor, receipts = 0, select }: Props) {
  const { openForm } = useApp()
  const timer = useRef<number | undefined>(undefined)
  const longPressed = useRef(false)

  function startPress() {
    longPressed.current = false
    if (!select || select.active) return
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      select.start()
      navigator.vibrate?.(20)
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => window.clearTimeout(timer.current)

  function click() {
    // O toque longo já ligou a seleção; soltar o dedo não deve abrir o gasto.
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (select?.active) select.toggle()
    else openForm(e)
  }
  const category = categories.get(e.categoryId)
  const sub = e.subcategoryId ? categories.get(e.subcategoryId) : undefined
  const name = e.description || sub?.name || category?.name || '—'
  const payers = payersOf(e)
  const shared = !!e.split && e.split.shares.length > 0
  // Quem mais pagou, com a carteira usada quando é controlada (ex.: "Ana (Wise da Ana)").
  const others = payers
    .filter((p) => p.personId !== ME)
    .map((p) => `${people.get(p.personId)?.name ?? '—'}${p.methodId && methods.get(p.methodId) ? ` (${methods.get(p.methodId)!.name})` : ''}`)
  const how = others.length === 0
    ? methods.get(e.methodId)?.name
    : paidBy(e, ME) > 0
      ? `você e ${others.join(', ')} pagaram`
      : `pago por ${others.join(', ')}`
  const where = [sub && e.description ? sub.name : category?.name, how].filter(Boolean).join(' · ')
  const mine = partBRL(e, [ME], walletCosts, rateFor)
  const foreign = isForeign(e)

  let bottom: string | null = null
  if (shared) bottom = mine.part > 0 ? `você ${mine.estimated ? '≈ ' : ''}${foreign ? formatBRL(mine.brl) : formatMoney(mine.part, e.currency)}` : 'sem sua parte'
  else if (foreign) bottom = `${mine.estimated ? '≈ ' : ''}${formatBRL(mine.brl)}`

  return (
    <button
      className={`flex w-full select-none items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${select?.selected ? 'bg-slate-100' : ''}`}
      onClick={click}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={(ev) => select && ev.preventDefault()}
      aria-pressed={select?.active ? select.selected : undefined}
    >
      {select?.active ? (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${select.selected ? 'bg-slate-900 text-white' : 'ring-1 ring-slate-300'}`}>
          {select.selected && <Check size={16} />}
        </span>
      ) : (
        <CategoryIcon category={sub ?? category} parent={sub ? category : undefined} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="flex items-center gap-1 truncate text-xs text-slate-500">
          {shared && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-600">
              <Users size={10} /> {e.split!.shares.length}
            </span>
          )}
          {receipts > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-slate-500" title={`${receipts} comprovante(s)`}>
              <Paperclip size={10} /> {receipts}
            </span>
          )}
          <span className="truncate">{where}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="flex items-center justify-end gap-1.5 font-semibold tabular-nums">
          {foreign && <CurrencyBadge code={e.currency} />}
          {formatMoney(e.amount, e.currency)}
        </span>
        {e.pending && (
          <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-600">a pagar</span>
        )}
        {bottom && (
          <span className={`flex items-center justify-end gap-1 text-xs tabular-nums ${mine.estimated ? VALUE_STYLE.estimado : VALUE_STYLE.apagado}`}>
            {mine.estimated && <CircleAlert size={11} />}
            {bottom}
          </span>
        )}
      </span>
    </button>
  )
}
