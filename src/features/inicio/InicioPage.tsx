import { ArrowLeftRight, CalendarDays, Calculator, ChartColumn, ChevronRight, CircleAlert, Lock, MapPin, Plane, Sun, TrendingUp, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { CurrencyBadge } from '../../components/Badges'
import { Breakdown, MethodBreakdown, NoBudget, PeopleBreakdown } from '../../components/Breakdown'
import { CategoryBreakdown } from '../../components/CategoryBreakdown'
import { ME } from '../../db/types'
import { totalsByMethod } from '../../domain/custoViagem'
import { involves } from '../../domain/filtro'
import { balanceClass, signedMoney, VALUE_STYLE } from '../../components/valueStyle'
import { positiveByCurrency } from '../../domain/custoMedio'
import { summarize } from '../../domain/resumo'
import { isEstimate } from '../../domain/despesa'
import { daysBetween, dayNumber, tripDays, tripStatus } from '../../domain/viagem'
import { formatBRL, formatMoney, fullDate, shortDate, todayISO } from '../../lib/format'
import { tripBalances } from '../acertos/tripBalances'
import { CostSelector, useCostPeople } from './CostSelector'
import { BudgetCard } from '../relatorios/BudgetCard'
import { budgetFor, budgetStatus } from '../../domain/orcamento'
import { OrcamentoEditor } from '../relatorios/OrcamentoEditor'
import { Avatar } from '../../components/Badges'
import { walletsOf } from '../../domain/titular'

import { PendingCard } from '../acertos/PendingCard'
import { usePending } from '../acertos/usePending'
import { CloseTripDialog } from '../viagens/CloseTripDialog'
import { setTripClosed } from '../../db/repo'
import { MethodIcon } from '../ajustes/MeiosPage'
import { walletPositions } from '../carteiras/CarteirasPage'
import { useWalletData } from '../carteiras/useWalletData'
import { ExpenseRow } from '../lancamentos/ExpenseRow'
import { lancamentosLink } from '../lancamentos/LancamentosPage'
import { useTripData } from '../lancamentos/useTripData'
import { NoTrip } from '../viagens/NoTrip'

/** Total por moeda, alinhado à direita: o saldo na moeda e, embaixo, quanto vale em reais pelo médio. */
function TotalAmounts({ totals }: { totals: { currency: string; units: number; cost: number }[] }) {
  return (
    <span className="shrink-0 text-right">
      {totals.map((t) => (
        <span key={t.currency} className="block leading-tight">
          <span className={`block font-semibold tabular-nums ${VALUE_STYLE.saldo}`}>{formatMoney(t.units, t.currency)}</span>
          <span className="block text-xs tabular-nums text-slate-500">≈ {formatBRL(t.cost)}</span>
        </span>
      ))}
    </span>
  )
}

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
  const [editingBudget, setEditingBudget] = useState(false)
  const pending = usePending()
  const { expenses, categories, methods, people, walletCosts, rateFor, loaded } = data
  if (!trip) return loaded ? <NoTrip /> : null

  const today = todayISO()
  const { personIds, onlyMe, names: costNames } = cost
  const s = summarize(trip, expenses, today, walletCosts, { personIds, rateFor })
  // Orçamento das pessoas escolhidas: cada conjunto do "Custo de" tem o seu (decisão do dono, 1.4.0).
  const budgetDef = budgetFor(trip, personIds)
  const budget = budgetDef ? budgetStatus(budgetDef, s, trip) : null
  // Últimos gastos: só os que envolvem as pessoas escolhidas (pagaram ou participam).
  const theirs = expenses.filter((e) => personIds.some((id) => involves(e, id)))
  // Por meio de pagamento: quanto cada pessoa escolhida pagou com cada meio.
  const byMethod = totalsByMethod(expenses, personIds, walletCosts, rateFor).map((r) => ({
    person: people.get(r.personId)?.name ?? '—',
    method: r.methodId ? (methods.get(r.methodId)?.name ?? '—') : r.personId === ME ? 'Sem meio informado' : 'Outro meio',
    brl: r.brl,
    estimated: r.estimated,
    count: r.count,
  }))
  // Projeção: no ritmo atual (média por dia), quanto a viagem deve custar no fim.
  const projection = s.perDay === null ? null : Math.max(s.total, s.byPhase.antes + s.byPhase.depois + Math.round(s.perDay * tripDays(trip)))
  // Saldo a acertar das pessoas escolhidas, somado (o que uma deve à outra se anula).
  const settle = tripBalances(trip, data, false)
  const balanceOfChosen = new Map<string, number>()
  for (const id of personIds) {
    for (const [currency, value] of settle.balances.get(id) ?? []) balanceOfChosen.set(currency, (balanceOfChosen.get(currency) ?? 0) + value)
  }
  const myBalance = [...balanceOfChosen].filter(([, value]) => value !== 0)
  // Saldos em moeda: só das pessoas do "Custo de" (pelo nome do titular), agrupados por pessoa, com o total dela em
  // reais pelo médio das carteiras dela (decisão do dono, 1.3.0).
  const holders = data.travelers
    .filter((p) => personIds.includes(p.id))
    .map((p) => {
      const ws = walletsOf(p, wallet.wallets).map((w) => ({ w, positions: walletPositions(wallet, w.id) })).filter((x) => x.positions.length > 0)
      const ids = new Set(ws.map((x) => x.w.id))
      const all = wallet.ledger.positions.filter((pos) => ids.has(pos.walletId))
      return { person: p, wallets: ws, totals: positiveByCurrency(all), negatives: all.filter((pos) => pos.units < 0).length }
    })
    .filter((h) => h.wallets.length > 0)
  // Saldo somado de todas as pessoas escolhidas, por moeda (só saldos positivos), com o valor em reais.
  const allTotals = positiveByCurrency(
    holders.flatMap((h) => h.totals.map((t) => ({ ...t, walletId: h.person.id }))),
  )
  // Por pessoa: só com mais de uma pessoa no "Custo de" (decisão do dono, 1.3.0).
  const personTotals = personIds.length > 1
    ? personIds.map((id) => ({ id, name: data.people.get(id)?.name ?? '—', total: summarize(trip, expenses, today, walletCosts, { personIds: [id], rateFor }).total }))
    : []
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
          <Link to="/relatorios" className="btn btn-ghost ring-1 ring-slate-200 !px-3" aria-label="Relatórios (prestação de contas)">
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
        {projection !== null && <p className="mt-1 text-xs opacity-75">No ritmo atual, deve fechar em {formatBRL(projection)} ({tripDays(trip)} dias).</p>}
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

      {foreign.length > 0 && (
        <section className="card space-y-2 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <TrendingUp size={18} className="text-slate-400" /> Em outras moedas
          </h2>
          <ul className="space-y-1.5 text-sm">
            {foreign.map((c) => (
              <li key={c.currency} className="flex items-center justify-between gap-x-3">
                <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                  <CurrencyBadge code={c.currency} /> {formatMoney(c.amount, c.currency)}
                </span>
                {/* Equivalência discreta: o que esse gasto custou em reais (cartão, carteira ou referência). */}
                <span className="text-xs tabular-nums text-slate-500">≈ {formatBRL(c.brl)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {holders.length > 0 && (
        <section className="card p-4">
          <Link to="/carteiras" className="flex items-center justify-between">
            <h2 className="font-semibold">Saldos em moeda</h2>
            <span className="flex items-center text-xs font-medium text-slate-500">
              Ver movimentos <ChevronRight size={14} />
            </span>
          </Link>
          {holders.length > 1 && allTotals.length > 0 && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium">Total das pessoas escolhidas</span>
              <TotalAmounts totals={allTotals} />
            </div>
          )}
          {holders.map(({ person, wallets: ws, totals, negatives }) => (
            <div key={person.id} className="mt-4">
              {/* A pessoa e o total dela numa linha; as carteiras dela recuadas embaixo, só com o saldo. */}
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                  {hasOthers && <Avatar id={person.id} name={person.name} size="sm" />}
                  <span className="truncate">{hasOthers ? person.name : 'Total'}</span>
                </span>
                <TotalAmounts totals={totals} />
              </div>
              {negatives > 0 && (
                <p className="mt-0.5 text-xs text-amber-600">{negatives} saldo{negatives > 1 ? 's' : ''} negativo{negatives > 1 ? 's' : ''} fora do total</p>
              )}
              <ul className="mt-1.5 space-y-1 border-l-2 border-slate-100 pl-3">
                {ws.flatMap(({ w, positions }) =>
                  positions.map(({ position, negativeOn }) => (
                    <li key={`${w.id}-${position.currency}`} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                          <MethodIcon method={w} size={14} /> <span className="truncate">{w.name}</span>
                        </span>
                        <span className={`shrink-0 tabular-nums ${position.units < 0 ? VALUE_STYLE.pagar : ''}`}>{formatMoney(position.units, position.currency)}</span>
                      </div>
                      {negativeOn && (
                        <p className="flex items-center gap-1 text-xs text-amber-600">
                          <CircleAlert size={12} /> {position.units < 0 ? 'Saldo negativo' : 'Ficou negativo'} desde {shortDate(negativeOn)}
                        </p>
                      )}
                    </li>
                  )),
                )}
              </ul>
            </div>
          ))}
        </section>
      )}

      <Breakdown
        views={[
          { key: 'categoria', node: <CategoryBreakdown rows={s.byCategory} categories={categories} /> },
          ...(personTotals.length > 1 ? [{ key: 'pessoa' as const, node: <PeopleBreakdown people={personTotals} /> }] : []),
          {
            key: 'orcamento',
            node: budget ? (
              <BudgetCard status={budget} categories={categories} forNames={costNames} onEdit={() => setEditingBudget(true)} />
            ) : (
              <NoBudget names={costNames} onDefine={() => setEditingBudget(true)} />
            ),
          },
          { key: 'meio', node: <MethodBreakdown rows={byMethod} onlyMe={onlyMe} /> },
        ]}
      />

      {theirs.length > 0 && (
        <section>
          <div className="mb-1 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Últimos gastos</h2>
            <Link
              to={personIds.length === 1 && personIds[0] === ME ? '/lancamentos' : lancamentosLink({ pessoa: personIds })}
              className="text-xs font-medium text-slate-500 hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {theirs.slice(0, 5).map((e) => (
              <ExpenseRow key={e.id} expense={e} categories={categories} methods={methods} people={people} walletCosts={walletCosts} rateFor={rateFor} />
            ))}
          </div>
        </section>
      )}

      {(s.fx.iof > 0 || s.fx.spread > 0 || s.extras.length > 0) && (
        <section className="card space-y-2 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <TrendingUp size={18} className="text-slate-400" /> Câmbio, imposto e gorjeta
          </h2>
          <dl className="space-y-1 text-sm">
            {(s.fx.iof > 0 || s.fx.spread > 0) && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">IOF nos cartões que cobram em reais</dt>
                  <dd className="font-medium tabular-nums">{formatBRL(s.fx.iof)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">Spread dos bancos nesses cartões</dt>
                  <dd className="font-medium tabular-nums">{formatBRL(s.fx.spread)}</dd>
                </div>
              </>
            )}
            {s.extras.map((x) => (
              <div key={x.currency} className="space-y-1">
                {x.localTax > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-slate-600"><CurrencyBadge code={x.currency} /> Imposto local</dt>
                    <dd className="text-right tabular-nums">
                      <span className="font-medium">{formatMoney(x.localTax, x.currency)}</span>
                      <span className="ml-1.5 text-xs text-slate-500">≈ {formatBRL(x.localTaxBRL)}</span>
                    </dd>
                  </div>
                )}
                {x.tip > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-slate-600"><CurrencyBadge code={x.currency} /> Gorjetas</dt>
                    <dd className="text-right tabular-nums">
                      <span className="font-medium">{formatMoney(x.tip, x.currency)}</span>
                      <span className="ml-1.5 text-xs text-slate-500">≈ {formatBRL(x.tipBRL)}</span>
                    </dd>
                  </div>
                )}
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-500">
            Na parte de quem está no "Custo de". IOF e spread: o que os cartões cobraram a mais que a cotação do dia. Imposto e
            gorjeta em reais: pela cotação que cada gasto usou.
          </p>
        </section>
      )}

      {!trip.closed && (
        <button className="btn btn-ghost mx-auto flex ring-1 ring-slate-200" onClick={() => setClosing(true)}>
          <Lock size={16} /> Encerrar viagem
        </button>
      )}
      {closing && <CloseTripDialog trip={trip} onClose={() => setClosing(false)} />}
      {editingBudget && (
        <OrcamentoEditor trip={trip} personIds={personIds} names={costNames} categories={[...categories.values()]} onClose={() => setEditingBudget(false)} />
      )}
    </div>
  )
}
