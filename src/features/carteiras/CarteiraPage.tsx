import { ChevronLeft, HandCoins, Pencil, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { CurrencyBadge } from '../../components/Badges'
import { VALUE_STYLE } from '../../components/valueStyle'
import { WALLET_MOVE_LABEL, WALLET_TYPE_LABEL, type WalletMove, type WalletMoveKind } from '../../db/types'
import { statementTitle, walletStatement, type StatementLine } from '../../domain/extrato'
import { holderLabel, isMine } from '../../domain/titular'
import { formatBRL, formatMoney, shortDate } from '../../lib/format'
import { MethodForm, MethodIcon } from '../ajustes/MeiosPage'
import { KIND_ICON, KINDS, PositionLine, walletPositions } from './CarteirasPage'
import { MoveForm } from './MoveForm'
import { useWalletData } from './useWalletData'

const signed = (units: number, currency: string) => `${units > 0 ? '+' : ''}${formatMoney(units, currency)}`

/**
 * Página de uma carteira (decisão do dono, 1.2.0): saldo e médio por moeda e o extrato só dela, do mais recente para
 * o mais antigo, com o saldo depois de cada movimento. Editar a carteira fica num botão.
 */
export function CarteiraPage() {
  const { id = '' } = useParams()
  const { openForm } = useApp()
  const navigate = useNavigate()
  const data = useWalletData()
  const [moveForm, setMoveForm] = useState<{ kind: WalletMoveKind; move?: WalletMove } | null>(null)
  const [editing, setEditing] = useState(false)
  if (!data.loaded) return null
  const wallet = data.wallets.find((w) => w.id === id)
  if (!wallet) {
    return (
      <div className="space-y-3">
        <Link to="/carteiras" className="btn btn-ghost">
          <ChevronLeft size={18} /> Carteiras
        </Link>
        <p className="text-sm text-slate-500">Carteira não encontrada.</p>
      </div>
    )
  }

  const names = new Map(data.wallets.map((w) => [w.id, w.name]))
  const spends = data.spends.map((s) => ({ ...s, description: s.expense.description }))
  const lines = walletStatement(wallet.id, data.moves, spends, data.settlements, data.ledger).reverse()
  const positions = walletPositions(data, wallet.id)

  function open(line: StatementLine) {
    const e = line.event
    if (e.type === 'move') setMoveForm({ kind: e.move.kind, move: e.move })
    else if (e.type === 'expense') {
      const spend = data.spends.find((s) => s.id === e.expense.id)
      if (spend) openForm(spend.expense)
    } else navigate('/acertos')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link to="/carteiras" className="btn btn-ghost !p-2" aria-label="Voltar para Carteiras">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-xl font-bold">
            <MethodIcon method={wallet} size={20} /> {wallet.name}
          </h1>
          <p className="text-sm text-slate-500">
            {WALLET_TYPE_LABEL[wallet.walletType ?? 'multimoeda']}
            {!isMine(wallet) && ` · titular ${holderLabel(wallet)}`}
            {wallet.archived && ' · arquivada'}
          </p>
        </div>
        <button className="btn btn-ghost shrink-0 ring-1 ring-slate-200 !px-3" onClick={() => setEditing(true)}>
          <Pencil size={16} /> <span className="hidden sm:inline">Editar carteira</span>
        </button>
      </div>

      <section className="card p-4">
        {positions.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {positions.map(({ position, negativeOn }) => (
              <PositionLine key={position.currency} position={position} negativeOn={negativeOn} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Sem saldo. Lance uma carga ou transferência.</p>
        )}
      </section>

      {!wallet.archived && (
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k]
            const disabled = k === 'transferencia' && data.wallets.filter((w) => !w.archived).length < 2
            return (
              <button key={k} className="btn btn-ghost border border-slate-200 !px-3 !py-1.5 text-sm" disabled={disabled} onClick={() => setMoveForm({ kind: k })}>
                <Icon size={16} /> {WALLET_MOVE_LABEL[k]}
              </button>
            )
          })}
        </div>
      )}

      <section>
        <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Movimentos desta carteira</h2>
        {lines.length === 0 ? (
          <p className="card p-4 text-center text-sm text-slate-500">Nenhum movimento ainda.</p>
        ) : (
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {lines.map((line) => {
              const Icon = line.kind === 'gasto' ? ShoppingBag : line.kind === 'acerto' ? HandCoins : KIND_ICON[line.kind]
              return (
                <button key={line.key} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => open(line)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{statementTitle(line, (wid) => names.get(wid) ?? '—')}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {shortDate(line.date)} · {formatBRL(line.brl)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`flex items-center justify-end gap-1.5 font-semibold tabular-nums ${line.units < 0 ? '' : VALUE_STYLE.receber}`}>
                      <CurrencyBadge code={line.currency} /> {signed(line.units, line.currency)}
                    </span>
                    <span className={`block text-xs tabular-nums ${line.balance < 0 ? VALUE_STYLE.pagar : 'text-slate-500'}`}>
                      saldo {formatMoney(line.balance, line.currency)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-1 px-1 text-xs text-slate-400">
          No mesmo dia, as entradas contam antes das saídas. O custo de cada saída vem do custo médio do dia.
        </p>
      </section>

      {moveForm && (
        <MoveForm
          kind={moveForm.kind}
          move={moveForm.move}
          walletId={wallet.id}
          wallets={data.wallets.filter((w) => !w.archived || w.id === moveForm.move?.walletId || w.id === moveForm.move?.toWalletId)}
          data={data}
          onClose={() => setMoveForm(null)}
        />
      )}
      {editing && <MethodForm method={wallet} initialKind="carteira" onClose={() => setEditing(false)} />}
    </div>
  )
}
