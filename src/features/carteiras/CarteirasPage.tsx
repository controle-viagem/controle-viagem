import { ArrowDownToLine, ArrowLeftRight, ChevronRight, CircleAlert, HandCoins, Plus, Repeat, ShoppingBag, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { WALLET_MOVE_LABEL, WALLET_TYPE_LABEL, type PaymentMethod, type Settlement, type WalletMove, type WalletMoveKind } from '../../db/types'
import { positiveByCurrency, saleResult, type Position } from '../../domain/custoMedio'
import { currencyName } from '../../domain/moeda'
import { formatBRL, formatMoney, formatRate, shortDate } from '../../lib/format'
import { MethodForm, MethodIcon } from '../ajustes/MeiosPage'
import { MoveForm } from './MoveForm'
import { CurrencyBadge } from '../../components/Badges'
import { balanceClass, VALUE_STYLE } from '../../components/valueStyle'
import { useWalletData, type WalletData, type WalletSpend } from './useWalletData'
import { useNavigate } from 'react-router-dom'
import { holderLabel, isMine } from '../../domain/titular'

export const KIND_ICON: Record<WalletMoveKind, LucideIcon> = {
  carga: ArrowDownToLine,
  conversao: Repeat,
  transferencia: ArrowLeftRight,
  ajuste: SlidersHorizontal,
  venda: HandCoins,
}

export const KINDS = Object.keys(KIND_ICON) as WalletMoveKind[]

/** Saldo e custo médio de uma moeda: usado aqui e no Início. */
export function PositionLine({ position: p, negativeOn }: { position: Omit<Position, 'walletId'>; negativeOn?: string | null }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <CurrencyBadge code={p.currency} />
          <span className={`font-semibold tabular-nums ${p.units < 0 ? VALUE_STYLE.pagar : VALUE_STYLE.saldo}`} title={currencyName(p.currency)}>
            {formatMoney(p.units, p.currency)}
          </span>
        </span>
        <span className="text-right text-xs text-slate-500 tabular-nums">
          {p.avg !== null ? `médio ${formatRate(p.avg)}` : 'sem custo'}
          {p.units > 0 && ` · custou ${formatBRL(p.cost)}`}
        </span>
      </div>
      {negativeOn && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <CircleAlert size={12} /> {p.units < 0 ? 'Saldo negativo' : 'Ficou negativo'} desde {shortDate(negativeOn)}: confira se falta alguma carga.
        </p>
      )}
    </li>
  )
}

/** Posições de uma carteira que valem mostrar: com saldo, ou com aviso. */
export function walletPositions(data: WalletData, walletId: string) {
  return data.ledger.positions
    .filter((p) => p.walletId === walletId)
    .map((p) => ({
      position: p,
      negativeOn: data.balances.find((b) => b.walletId === p.walletId && b.currency === p.currency)?.negativeOn ?? null,
    }))
    .filter(({ position, negativeOn }) => position.units !== 0 || negativeOn)
    .sort((a, b) => a.position.currency.localeCompare(b.position.currency))
}

type Row = { date: string; createdAt: string } & ({ move: WalletMove } | { spend: WalletSpend } | { settlement: Settlement })

function MoveRow({ row, data, names, onOpen }: { row: Row; data: WalletData; names: Map<string, string>; onOpen: () => void }) {
  let Icon: LucideIcon
  let title: string
  let where: string
  let value: string
  let detail: string
  // Venda da sobra: ganho em verde, perda em vermelho.
  let detailClass: string = VALUE_STYLE.apagado
  if ('spend' in row) {
    const s = row.spend
    Icon = ShoppingBag
    title = s.expense.description || 'Gasto'
    where = names.get(s.methodId) ?? '—'
    value = formatMoney(-s.amount, s.currency)
    detail = formatBRL(data.ledger.expenseCosts.get(s.id) ?? 0)
  } else if ('settlement' in row) {
    const s = row.settlement
    Icon = HandCoins
    title = s.note || 'Acerto em moeda'
    where = [s.fromWalletId && names.get(s.fromWalletId), s.toWalletId && names.get(s.toWalletId)].filter(Boolean).join(' → ')
    value = s.fromWalletId && !s.toWalletId ? formatMoney(-s.amount, s.currency) : `${s.fromWalletId ? '' : '+'}${formatMoney(s.amount, s.currency)}`
    detail = s.fromWalletId && s.toWalletId ? 'entre carteiras' : s.toWalletId ? 'recebido' : 'pago'
  } else {
    const m = row.move
    const cost = data.ledger.moveCosts.get(m.id) ?? 0
    Icon = KIND_ICON[m.kind]
    title = m.note || WALLET_MOVE_LABEL[m.kind]
    where = names.get(m.walletId) ?? '—'
    switch (m.kind) {
      case 'carga':
        value = `+${formatMoney(m.amount, m.currency)}`
        detail = `${formatBRL(cost)} · cotação ${formatRate(cost / m.amount)}`
        break
      case 'ajuste':
        value = `${m.amount > 0 ? '+' : ''}${formatMoney(m.amount, m.currency)}`
        detail = formatBRL(cost)
        break
      case 'venda': {
        const result = saleResult(m, data.ledger)
        value = formatMoney(-m.amount, m.currency)
        detail = `recebeu ${formatBRL(m.brlAmount ?? 0)} · ${result >= 0 ? 'ganho' : 'perda'} ${formatBRL(Math.abs(result))}`
        detailClass = balanceClass(result)
        break
      }
      case 'conversao':
        value = `${formatMoney(m.amount, m.currency)} → ${formatMoney(m.toAmount ?? 0, m.toCurrency ?? m.currency)}`
        detail = `custo ${formatBRL(cost)}`
        break
      case 'transferencia':
        where = `${where} → ${names.get(m.toWalletId ?? '') ?? '—'}`
        value = formatMoney(m.amount, m.currency)
        detail = `${m.fee ? `tarifa ${formatMoney(m.fee, m.currency)} · ` : ''}custo ${formatBRL(cost)}`
        break
    }
  }
  return (
    <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onClick={onOpen}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-slate-500">{shortDate(row.date)} · {where}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-semibold tabular-nums">{value}</span>
        <span className={`block text-xs tabular-nums ${detailClass}`}>{detail}</span>
      </span>
    </button>
  )
}

export function CarteirasPage() {
  const { openForm } = useApp()
  const data = useWalletData()
  const navigate = useNavigate()
  const [moveForm, setMoveForm] = useState<{ kind: WalletMoveKind; move?: WalletMove } | null>(null)
  const [walletForm, setWalletForm] = useState<{ wallet?: PaymentMethod } | null>(null)
  const [filter, setFilter] = useState('')
  if (!data.loaded) return null

  const active = data.wallets.filter((w) => !w.archived)
  const names = new Map(data.wallets.map((w) => [w.id, w.name]))
  // Minhas primeiro, depois as dos pares, agrupadas pelo titular.
  const shownWallets = data.wallets
    .filter((w) => !w.archived || walletPositions(data, w.id).length > 0)
    .sort((a, b) => Number(!isMine(a)) - Number(!isMine(b)) || holderLabel(a).localeCompare(holderLabel(b), 'pt-BR'))
  // Total de cada viajante (titular), só com saldos positivos: carteira sem carga ou negativa distorceria o médio.
  function holderTotal(holder: string) {
    const ids = new Set(shownWallets.filter((w) => holderLabel(w) === holder).map((w) => w.id))
    const positions = data.ledger.positions.filter((p) => ids.has(p.walletId))
    return { ids, totals: positiveByCurrency(positions), negatives: positions.filter((p) => p.units < 0).length }
  }

  const rows: Row[] = [
    ...data.moves
      .filter((m) => !filter || m.walletId === filter || m.toWalletId === filter)
      .map((move) => ({ date: move.date, createdAt: move.createdAt, move })),
    ...data.spends.filter((s) => !filter || s.methodId === filter).map((spend) => ({ date: spend.date, createdAt: spend.createdAt, spend })),
    ...data.settlements
      .filter((s) => !filter || s.fromWalletId === filter || s.toWalletId === filter)
      .map((settlement) => ({ date: settlement.date, createdAt: settlement.createdAt, settlement })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Carteiras</h1>
        <p className="text-sm text-slate-500">Cartões multimoeda e espécie. Valem para todas as viagens: a sobra de uma segue para a próxima.</p>
      </div>

      {active.length === 0 ? (
        <section className="card space-y-3 p-4 text-sm">
          <p>
            Cadastre o cartão multimoeda (Wise, Nomad…) ou o dinheiro em espécie. Cada carga entra com o total pago em reais, e o
            custo em reais dos gastos sai do <strong>custo médio</strong> da carteira.
          </p>
          <button className="btn btn-primary" onClick={() => setWalletForm({})}>
            <Plus size={18} /> Cadastrar carteira
          </button>
        </section>
      ) : (
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k]
            const disabled = k === 'transferencia' && active.length < 2
            return (
              <button
                key={k}
                className="btn btn-ghost border border-slate-200 !px-3 !py-1.5 text-sm"
                disabled={disabled}
                title={disabled ? 'Cadastre uma segunda carteira para transferir' : undefined}
                onClick={() => setMoveForm({ kind: k })}
              >
                <Icon size={16} /> {WALLET_MOVE_LABEL[k]}
              </button>
            )
          })}
        </div>
      )}

      {shownWallets.map((w, i) => {
        const positions = walletPositions(data, w.id)
        const newHolder = i === 0 || holderLabel(shownWallets[i - 1]) !== holderLabel(w)
        return (
          <div key={w.id} className="space-y-1">
          {newHolder && (() => {
            const { ids, totals, negatives } = holderTotal(holderLabel(w))
            return (
              <div className="px-1 pt-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isMine(w) ? 'Minhas carteiras' : `Carteiras de ${holderLabel(w)}`}
                </h2>
                {ids.size > 1 && totals.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Total: {totals.map((t) => `${formatMoney(t.units, t.currency)} (médio ${formatRate(t.avg!)})`).join(' · ')}
                    {negatives > 0 && <span className="text-amber-600"> · {negatives} saldo{negatives > 1 ? 's' : ''} negativo{negatives > 1 ? 's' : ''} fora do total</span>}
                  </p>
                )}
              </div>
            )
          })()}
          <section className="card p-4">
            <button className="flex w-full items-center gap-2 text-left" onClick={() => navigate(`/carteiras/${w.id}`)} aria-label={`Abrir a carteira ${w.name}`}>
              <MethodIcon method={w} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{w.name}</span>
                <span className="block text-xs text-slate-500">
                  {WALLET_TYPE_LABEL[w.walletType ?? 'multimoeda']}
                  {!isMine(w) && ` · titular ${holderLabel(w)}`}
                  {w.archived && ' · arquivada'}
                </span>
              </span>
              <span className="flex shrink-0 items-center text-xs font-medium text-slate-500">
                Movimentos <ChevronRight size={14} />
              </span>
            </button>
            {positions.length > 0 ? (
              <ul className="mt-2 divide-y divide-slate-100">
                {positions.map(({ position, negativeOn }) => (
                  <PositionLine key={position.currency} position={position} negativeOn={negativeOn} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Sem saldo. Lance uma carga ou transferência.</p>
            )}
          </section>
          </div>
        )
      })}

      {active.length > 0 && (
        <button className="btn btn-ghost" onClick={() => setWalletForm({})}>
          <Plus size={16} /> Nova carteira
        </button>
      )}

      {rows.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Movimentos e gastos</h2>
            {data.wallets.length > 1 && (
              <select className="field !w-auto !py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Carteira">
                <option value="">Todas as carteiras</option>
                {data.wallets.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {rows.map((row) => (
              <MoveRow
                key={'move' in row ? row.move.id : 'spend' in row ? row.spend.id : row.settlement.id}
                row={row}
                data={data}
                names={names}
                onOpen={() =>
                  'move' in row ? setMoveForm({ kind: row.move.kind, move: row.move }) : 'spend' in row ? openForm(row.spend.expense) : navigate('/acertos')
                }
              />
            ))}
          </div>
          <p className="mt-1 px-1 text-xs text-slate-400">
            O custo de cada gasto e saída sai do custo médio do dia. Mudou algo antigo? Tudo depois é recalculado.
          </p>
        </section>
      )}

      {moveForm && (
        <MoveForm
          kind={moveForm.kind}
          move={moveForm.move}
          wallets={data.wallets.filter((w) => !w.archived || w.id === moveForm.move?.walletId || w.id === moveForm.move?.toWalletId)}
          data={data}
          onClose={() => setMoveForm(null)}
        />
      )}
      {walletForm && <MethodForm method={walletForm.wallet} initialKind="carteira" onClose={() => setWalletForm(null)} />}
    </div>
  )
}
