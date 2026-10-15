import { CalendarDays, CreditCard, FileText, PiggyBank, Plane, Sun, TrendingUp, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { Avatar, CurrencyBadge } from '../../components/Badges'
import { CategoryBreakdown } from '../../components/CategoryBreakdown'
import { CHART_THEME } from '../../components/chartTheme'
import { VALUE_STYLE } from '../../components/valueStyle'
import { budgetStatus } from '../../domain/orcamento'
import { buildReport } from '../../domain/relatorio'
import { summarize } from '../../domain/resumo'
import { formatBRL, formatMoney, formatRate, fullDate } from '../../lib/format'
import { useTheme } from '../../lib/theme'
import { CostSelector, useCostPeople } from '../inicio/CostSelector'
import { NoTrip } from '../viagens/NoTrip'
import { BudgetCard } from './BudgetCard'
import { DayChart } from './DayChart'
import { OrcamentoEditor } from './OrcamentoEditor'
import { useReportInput } from './useReportInput'

function Tile({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: string; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
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

/** Relatórios da viagem: resumo, orçamento, gráficos e câmbio; daqui sai a prestação de contas em PDF. */
export function RelatoriosPage() {
  const { trip } = useApp()
  const { input, data } = useReportInput(trip)
  const cost = useCostPeople(trip, data.travelers)
  const [editingBudget, setEditingBudget] = useState(false)
  const chart = CHART_THEME[useTheme()]
  if (!trip) return data.loaded ? <NoTrip /> : null
  if (!input) return null

  const { personIds } = cost
  const report = buildReport(input, {
    personIds, scope: 'todos', sections: ['resumo', 'dias', 'pessoas', 'meios', 'cambio'], valores: 'parte', moeda: 'ambas', nomes: 'mostrar',
  })
  const s = summarize(trip, input.expenses, input.today, input.walletCosts, { personIds, rateFor: input.rateFor })
  const summary = report.summary!
  const fx = report.fx!
  const people = report.people ?? []
  const maxPerson = Math.max(1, ...people.map((p) => p.total))
  const byMethod = report.methods ?? []
  const budget = trip.budget
    ? budgetStatus(trip.budget, summarize(trip, input.expenses, input.today, input.walletCosts, { personIds: trip.budget.personIds, rateFor: input.rateFor }), trip)
    : null
  const hasOthers = data.travelers.length > 1

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Relatórios</h1>
          <p className="truncate text-sm text-slate-500">{trip.name}</p>
        </div>
        <Link to="/relatorios/prestacao" className="btn btn-primary shrink-0 !px-3">
          <FileText size={18} /> <span className="hidden sm:inline">Prestação de contas</span><span className="sm:hidden">PDF</span>
        </Link>
      </div>

      {hasOthers && <CostSelector trip={trip} travelers={data.travelers} personIds={personIds} onChange={cost.choose} />}

      <section className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
        <p className="text-sm opacity-75">{cost.onlyMe ? (hasOthers ? 'Seu custo na viagem' : 'Total da viagem') : `Custo de ${cost.names}`}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatBRL(summary.total)}</p>
        <p className="mt-1 text-xs opacity-75">
          No ritmo atual, deve fechar em {formatBRL(summary.projection)} ({summary.days} dias).
          {summary.estimated > 0 && ` ${formatBRL(summary.estimated)} ainda é estimativa.`}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile icon={Plane} tone="bg-indigo-50 text-indigo-600" label="Antes da viagem" value={formatBRL(summary.antes)} />
        <Tile icon={Sun} tone="bg-amber-50 text-amber-600" label="Durante a viagem" value={formatBRL(summary.durante)} />
        <Tile icon={CalendarDays} tone="bg-emerald-50 text-emerald-600" label="Média por dia" value={summary.perDay === null ? '—' : formatBRL(summary.perDay)} />
      </div>

      {budget ? (
        <BudgetCard
          status={budget}
          categories={data.categories}
          forNames={trip.budget!.personIds.map((id) => data.people.get(id)?.name ?? '—').join(' + ')}
          onEdit={() => setEditingBudget(true)}
        />
      ) : (
        <section className="card flex items-center gap-3 p-4">
          <PiggyBank size={20} className="shrink-0 text-slate-400" />
          <p className="min-w-0 flex-1 text-sm text-slate-500">Defina um limite total ou por categoria para acompanhar o orçamento.</p>
          <button className="btn btn-ghost shrink-0 ring-1 ring-slate-200" onClick={() => setEditingBudget(true)}>Definir</button>
        </section>
      )}

      <DayChart days={report.days ?? s.byDay} />

      <CategoryBreakdown rows={s.byCategory} categories={data.categories} />

      {hasOthers && people.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 font-semibold">Por pessoa</h2>
          <p className="mb-3 text-xs text-slate-500">Quanto custou a parte de cada viajante, em reais.</p>
          <ul className="space-y-2.5">
            {people.map((p) => (
              <li key={p.id}>
                <div className="flex items-center gap-2 text-sm">
                  <Avatar id={p.id} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="font-medium tabular-nums">{formatBRL(p.total)}</span>
                </div>
                <div className="ml-8 mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(p.total / maxPerson) * 100}%`, background: chart.series }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {byMethod.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <CreditCard size={18} className="text-slate-400" /> Por meio de pagamento
          </h2>
          <p className="mb-3 text-xs text-slate-500">Quanto {cost.onlyMe ? 'você pagou' : 'cada pessoa do "Custo de" pagou'} com cada meio, em reais (sem os gastos a pagar).</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {byMethod.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate">{m.method}</span>
                  <span className="block truncate text-xs text-slate-500">{cost.onlyMe ? '' : `${m.person} · `}{m.count} {m.count === 1 ? 'gasto' : 'gastos'}</span>
                </span>
                <span className={`shrink-0 font-medium tabular-nums ${m.estimated ? VALUE_STYLE.estimado : ''}`}>{m.estimated ? '≈ ' : ''}{formatBRL(m.brl)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <TrendingUp size={18} className="text-slate-400" /> Câmbio, imposto e gorjeta
        </h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">IOF nos cartões que cobram em reais</dt>
            <dd className="font-medium tabular-nums">{formatBRL(fx.cardIof)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Spread dos bancos nesses cartões</dt>
            <dd className="font-medium tabular-nums">{formatBRL(fx.cardSpread)}</dd>
          </div>
          {fx.extras.map((x) => (
            <div key={x.currency} className="flex flex-wrap justify-between gap-x-3">
              <dt className="flex items-center gap-1.5 text-slate-600"><CurrencyBadge code={x.currency} /> Imposto local · gorjetas</dt>
              <dd className="font-medium tabular-nums">{formatMoney(x.localTax, x.currency)} · {formatMoney(x.tip, x.currency)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">
          O que os cartões cobraram a mais que a cotação do dia (IOF + spread), na parte de quem está no "Custo de".
        </p>
        {fx.loads.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Cargas das carteiras</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {fx.loads.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
                  <span className="text-slate-600">{fullDate(l.date)} · {l.wallet}</span>
                  <span className="tabular-nums">
                    {formatMoney(l.amount, l.currency)} por {formatBRL(l.brl)} · <strong>{formatRate(l.rate)}</strong>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">Cotação efetiva = total pago em reais ÷ valor recebido (já com IOF, spread e tarifas).</p>
          </div>
        )}
      </section>

      {editingBudget && (
        <OrcamentoEditor trip={trip} travelers={data.travelers} categories={[...data.categories.values()]} onClose={() => setEditingBudget(false)} />
      )}
    </div>
  )
}
