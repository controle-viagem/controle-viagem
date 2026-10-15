import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_THEME } from '../../components/chartTheme'
import { formatBRL, formatCompact, fullDate, shortDate } from '../../lib/format'
import { useTheme } from '../../lib/theme'

/**
 * Gasto por dia da viagem, em colunas (uma série só: o título diz o que é, sem legenda). Passar o dedo ou o mouse
 * mostra o valor; a tabela logo abaixo traz todos os dias.
 */
export function DayChart({ days }: { days: { date: string; total: number }[] }) {
  const chart = CHART_THEME[useTheme()]
  const axis = { fontSize: 11, fill: chart.tick }
  const data = days.map((d) => ({ ...d, label: shortDate(d.date) }))
  const max = days.reduce((m, d) => (d.total > m.total ? d : m), days[0] ?? { date: '', total: 0 })

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Por dia</h2>
        {max.total > 0 && <span className="text-xs text-slate-500">maior: {shortDate(max.date)} · {formatBRL(max.total)}</span>}
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum gasto durante a viagem ainda.</p>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barCategoryGap="20%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: chart.axis }} />
                <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} width={48} />
                <Tooltip
                  formatter={(value) => [formatBRL(Number(value)), 'Gasto']}
                  labelFormatter={(_, payload) => (payload?.[0] ? fullDate(String((payload[0].payload as { date: string }).date)) : '')}
                  cursor={{ fill: chart.cursor }}
                  contentStyle={{ ...chart.tooltip, border: `1px solid ${chart.tooltip.border}`, borderRadius: 8 }}
                  itemStyle={{ color: chart.tooltip.color }}
                />
                <Bar dataKey="total" name="Gasto" fill={chart.series} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">Ver em tabela</summary>
            <ul className="mt-1 divide-y divide-slate-100">
              {days.map((d) => (
                <li key={d.date} className="flex justify-between py-1">
                  <span className="text-slate-600">{fullDate(d.date)}</span>
                  <span className="tabular-nums">{formatBRL(d.total)}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}
