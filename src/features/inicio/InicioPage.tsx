import { ArrowLeftRight, CalendarDays, Calculator, ChartColumn, ChevronRight, CircleAlert, Lock, MapPin, Plane, Sun, TrendingUp, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { CurrencyBadge } from '../../components/Badges'
import { CategoryBreakdown } from '../../components/CategoryBreakdown'
import { balanceClass, signedMoney, VALUE_STYLE } from '../../components/valueStyle'
import { summarize } from '../../domain/resumo'
import { isEstimate } from '../../domain/despesa'
import { daysBetween, dayNumber, tripDays, tripStatus } from '../../domain/viagem'
import { formatBRL, formatMoney, fullDate, todayISO } from '../../lib/format'
import { tripBalances } from '../acertos/tripBalances'
import { CostSelector, useCostPeople } from './CostSelector'
import { BudgetCard } from '../relatorios/BudgetCard'
import { budgetStatus } from '../../domain/orcamento'
import { Avatar } from '../../components/Badges'
import { walletsOf } from '../../domain/titular'

import { PendingCard } from '../acertos/PendingCard'
import { usePending } from '../acertos/usePending'
import { CloseTripDialog } from '../viagens/CloseTripDialog'
import { setTripClosed } from '../../db/repo'
import { MethodIcon } from '../ajustes/MeiosPage'
import { PositionLine, walletPositions } from '../carteiras/CarteirasPage'
import { useWalletData } from '../carteiras/useWalletData'
import { ExpenseRow } from '../lancamentos/ExpenseRow'
import { lancamentosLink } from '../lancamentos/LancamentosPage'
import { useTripData } from '../lancamentos/useTripData'
import { NoTrip } from '../viagens/NoTrip'

/** Quadro do Início: ícone com cor de destaque, rótulo e valor. */
function Tile({ icon: Icon, tone, label, value, hint, className = '' }: { icon: LucideIcon; tone: string; label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={`card p-3 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone}`}>
          <Icon size={14} />
        </span>
        {label}
      </p>
      <p className="mt-1.5 font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function InicioPage() {
  const { trip } = useApp()
  const data = useTripData(trip?.id)
  const wallet = useWalletData()
  // Quem compõe o custo mostrado: escolha guardada por viagem neste aparelho.
  const cost = useCostPeople(trip, data.travelers)
  const [closing, setClosing] = useState(false)
  const pending = usePending()
  const { expenses, categories, methods, people, walletCosts, rateFor, loaded } = data
  if (!trip) return loaded ? <NoTrip /> : null

  const today = todayISO()
  const { personIds, onlyMe, names: costNames } = cost
  const s = summarize(trip, expenses, today, walletCosts, { personIds, rateFor })
  const budget = trip.budget
    ? budgetStatus(trip.budget, summarize(trip, expenses, today, walletCosts, { personIds: trip.budget.personIds, rateFor }), trip)
    : null
  // Saldo a acertar das pessoas escolhidas, somado (o que uma deve à outra se anula).
  const settle = tripBalances(trip, data, false)
  const balanceOfChosen = new Map<string, number>()
  for (const id of personIds) {
    for (const [currency, value] of settle.balances.get(id) ?? []) balanceOfChosen.set(currency, (balanceOfChosen.get(currency) ?? 0) + value)
  }
  const myBalance = [...balanceOfChosen].filter(([, value]) => value !== 0)
  // Saldos em moeda: as minhas carteiras e as dos viajantes desta viagem (pelo nome do titular).
  const tripWallets = data.travelers.flatMap((p) => walletsOf(p, wallet.wallets).map((w) => ({ w, holder: p })))
  const wallets = tripWallets.map(({ w, holder }) => ({ w, holder, positions: walletPositions(wallet, w.id) })).filter((x) => x.positions.length > 0)
  const status = tripStatus(trip, today)
  const when =
    status === 'planejada'
      ? `Faltam ${daysBetween(today, trip.startDate)} dias`
      : status === 'andamento'
        ? `Dia ${dayNumber(today, trip)} de ${tripDays(trip)}`
        : 'Viagem encerrada'
  const foreign = s.byCurrency.filter((c) => c.currency !== 'BRL')
  const toConfirm = expenses.filter((e) => isEstimate(e, walletCosts)).length
  const hasOthers = data.travelers.length > 1

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link to="/viagens" className="group flex items-center gap-1" title="Trocar de viagem">
            <h1 className="truncate text-xl font-bold">{trip.name}</h1>
            <ChevronRight size={18} className="shrink-0 text-slate-400 group-hover:text-slate-600" />
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            {trip.destination && (
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {trip.destination}
              </span>
            )}
            <span>
              {fullDate(trip.startDate)} a {fullDate(trip.endDate)} · {when}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/relatorios" className="btn btn-ghost ring-1 ring-slate-200 !px-3" aria-label="Relatórios">
            <ChartColumn size={18} /> <span className="hidden sm:inline">Relatórios</span>
          </Link>
          <Link to="/calculadora" className="btn btn-ghost ring-1 ring-slate-200 !px-3" aria-label="Calculadora">
            <Calculator size={18} /> <span className="hidden sm:inline">Calculadora</span>
          </Link>
        </div>
      </div>

      {trip.closed && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          <Lock size={16} className="shrink-0" />
          <span className="flex-1">Viagem encerrada: só consulta. Os acertos continuam liberados.</span>
          <button className="btn btn-ghost !px-2 !py-1 ring-1 ring-slate-300" onClick={() => setTripClosed(trip.id, false)}>Reabrir</button>
        </div>
      )}

      <PendingCard pending={pending.filter((p) => p.trip.id !== trip.id)} />

      {hasOthers && <CostSelector trip={trip} travelers={data.travelers} personIds={personIds} onChange={cost.choose} />}

      {/* Destaque invertido: fundo escuro no claro e claro no escuro (a escala do Tailwind já se inverte em .dark). */}
      <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
        <p className="text-sm opacity-75">{!hasOthers ? 'Total da viagem' : onlyMe ? 'Seu custo na viagem' : `Custo de ${costNames}`}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatBRL(s.total)}</p>
        {hasOthers && <p className="mt-1 text-xs opacity-75">{onlyMe ? 'Só a sua parte' : 'A soma das partes dessas pessoas'} nos gastos divididos, em reais.</p>}
      </section>
      {s.pending.count > 0 && (
        <Link to={lancamentosLink({ apagar: true })} className="-mt-2 block px-1 text-xs text-amber-600 hover:underline">
          {formatBRL(s.pending.total)} ainda a pagar ({s.pending.count} {s.pending.count === 1 ? 'gasto previsto' : 'gastos previstos'}) →
        </Link>
      )}
      {s.estimated.count > 0 && (
        <div className={`-mt-2 space-y-0.5 px-1 text-xs ${VALUE_STYLE.estimado}`}>
          <p className="flex items-center gap-1">
            <CircleAlert size={14} /> {formatBRL(s.estimated.total)} do total ainda é estimativa.
          </p>
          {toConfirm > 0 && (
            <Link to={lancamentosLink({ conferir: true })} className="block pl-5 hover:underline">
              {toConfirm} {toConfirm === 1 ? 'gasto' : 'gastos'} no cartão a conferir na fatura →
            </Link>
          )}
          {toConfirm < s.estimated.count && <p className="pl-5 text-slate-500">Inclui o que outras pessoas pagaram em moeda estrangeira, convertido pela cotação de referência.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile icon={Plane} tone="bg-indigo-50 text-indigo-600" label="Antes da viagem" value={formatBRL(s.byPhase.antes)} hint="passagens, seguro…" />
        <Tile icon={Sun} tone="bg-amber-50 text-amber-600" label="Durante a viagem" value={formatBRL(s.byPhase.durante)} />
        <Tile
          icon={CalendarDays}
          tone="bg-emerald-50 text-emerald-600"
          className="col-span-2 sm:col-span-1"
          label="Média por dia"
          value={s.perDay === null ? '—' : formatBRL(s.perDay)}
          hint={s.perDay === null ? 'quando a viagem começar' : 'durante a viagem'}
        />
      </div>

      {budget && (
        <Link to="/relatorios" className="block">
          <BudgetCard status={budget} categories={categories} forNames={trip.budget!.personIds.map((id) => people.get(id)?.name ?? '—').join(' + ')} compact />
        </Link>
      )}

      {hasOthers && (
        <Link to="/acertos" className="card block p-4 hover:bg-slate-50">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <ArrowLeftRight size={18} className="text-slate-400" /> Acertos
            </h2>
            <span className="flex items-center text-xs font-medium text-slate-500">
              Ver todos <ChevronRight size={14} />
            </span>
          </div>
          {myBalance.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Tudo acertado{onlyMe ? ': ninguém deve nada a você' : ` para ${costNames}`}.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {myBalance.map(([currency, value]) => (
                <li key={currency} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{value > 0 ? 'A receber' : 'A pagar'}</span>
                  <span className={`flex items-center gap-1.5 font-semibold tabular-nums ${balanceClass(value)}`}>
                    <CurrencyBadge code={currency} /> {signedMoney(value, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Link>
      )}

      {(foreign.length > 0 || s.extras.length > 0) && (
        <section className="card space-y-2 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <TrendingUp size={18} className="text-slate-400" /> Em outras moedas
          </h2>
          <ul className="space-y-1.5 text-sm">
            {foreign.map((c) => {
              const extra = s.extras.find((x) => x.currency === c.currency)
              return (
                <li key={c.currency} className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                    <CurrencyBadge code={c.currency} /> {formatMoney(c.amount, c.currency)}
                  </span>
                  {extra && (
                    <span className="text-xs text-slate-500">
                      imposto {formatMoney(extra.localTax, c.currency)} · gorjeta {formatMoney(extra.tip, c.currency)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {wallets.length > 0 && (
        <section className="card p-4">
          <Link to="/carteiras" className="flex items-center justify-between">
            <h2 className="font-semibold">Saldos em moeda</h2>
            <span className="flex items-center text-xs font-medium text-slate-500">
              Ver movimentos <ChevronRight size={14} />
            </span>
          </Link>
          {wallets.map(({ w, holder, positions }) => (
            <div key={w.id} className="mt-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <MethodIcon method={w} size={14} /> {w.name}
                {hasOthers && <span className="ml-auto flex items-center gap-1"><Avatar id={holder.id} name={holder.name} size="sm" /> {holder.name}</span>}
              </p>
              <ul className="divide-y divide-slate-100">
                {positions.map(({ position, negativeOn }) => (
                  <PositionLine key={position.currency} position={position} negativeOn={negativeOn} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <CategoryBreakdown rows={s.byCategory} categories={categories} />

      {expenses.length > 0 && (
        <section>
          <div className="mb-1 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Últimos gastos</h2>
            <Link to="/lancamentos" className="text-xs font-medium text-slate-500 hover:underline">Ver todos</Link>
          </div>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {expenses.slice(0, 5).map((e) => (
              <ExpenseRow key={e.id} expense={e} categories={categories} methods={methods} people={people} walletCosts={walletCosts} rateFor={rateFor} />
            ))}
          </div>
        </section>
      )}

      {!trip.closed && (
        <button className="btn btn-ghost mx-auto flex ring-1 ring-slate-200" onClick={() => setClosing(true)}>
          <Lock size={16} /> Encerrar viagem
        </button>
      )}
      {closing && <CloseTripDialog trip={trip} onClose={() => setClosing(false)} />}
    </div>
  )
}
