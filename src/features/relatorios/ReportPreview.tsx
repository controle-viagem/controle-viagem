import type { ReactNode } from 'react'
import { balanceClass, signedMoney, VALUE_STYLE } from '../../components/valueStyle'
import { BUDGET_LEVEL_LABEL } from '../../domain/orcamento'
import { SECTION_LABEL, type ReportModel } from '../../domain/relatorio'
import { formatBRL, formatMoney, formatRate, fullDate, shortDate } from '../../lib/format'

const pct = (share: number) => `${Math.round(share * 100)}%`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 border-t border-slate-100 pt-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="space-y-0.5 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3">
          <dt className="min-w-0 text-slate-600">{k}</dt>
          <dd className="shrink-0 text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const empty = (text: string) => <p className="text-xs text-slate-500">{text}</p>

/** Prévia, na tela, do que vai no PDF: as mesmas seções, na mesma ordem, com os mesmos dados. */
export function ReportPreview({ model, title }: { model: ReportModel; title: string }) {
  const { config } = model
  const showBRL = config.moeda !== 'original'
  const showOriginal = config.moeda !== 'reais'
  const withPart = config.valores === 'parte'

  return (
    <article className="card space-y-3 p-4">
      <header className="rounded-xl bg-slate-900 p-3 text-white">
        <p className="font-bold">{title}</p>
        <p className="text-xs opacity-80">{model.tripName} · {fullDate(model.startDate)} a {fullDate(model.endDate)}</p>
        <p className="text-xs opacity-80">Para: {model.forNames}</p>
      </header>
      {config.sections.map((key) => {
        const title = SECTION_LABEL[key]
        switch (key) {
          case 'resumo': {
            const s = model.summary
            if (!s) return null
            return (
              <Section key={key} title={title}>
                <Rows rows={[
                  [`Custo de ${model.forNames}`, <strong key="t">{formatBRL(s.total)}</strong>],
                  ['Antes da viagem', formatBRL(s.antes)],
                  ['Durante a viagem', formatBRL(s.durante)],
                  ['Média por dia', s.perDay === null ? '—' : formatBRL(s.perDay)],
                  [`Projeção (${s.days} dias)`, formatBRL(s.projection)],
                  ...(s.estimated ? [['Ainda estimado', <span key="e" className={VALUE_STYLE.estimado}>{formatBRL(s.estimated)}</span>] as [ReactNode, ReactNode]] : []),
                ]} />
              </Section>
            )
          }
          case 'categorias':
            return model.categories ? (
              <Section key={key} title={title}>
                {model.categories.length === 0 ? empty('Nenhum gasto.') : (
                  <Rows rows={model.categories.map((c) => [
                    <span key="n" className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />{c.name}</span>,
                    `${pct(c.share)} · ${formatBRL(c.total)}`,
                  ])} />
                )}
              </Section>
            ) : null
          case 'dias':
            return model.days ? (
              <Section key={key} title={title}>
                {model.days.length === 0 ? empty('Nenhum gasto durante a viagem.') : <Rows rows={model.days.map((d) => [fullDate(d.date), formatBRL(d.total)])} />}
              </Section>
            ) : null
          case 'pessoas':
            return model.people ? (
              <Section key={key} title={title}>
                <Rows rows={model.people.map((p) => [p.name, formatBRL(p.total)])} />
              </Section>
            ) : null
          case 'meios':
            return model.methods ? (
              <Section key={key} title={title}>
                {model.methods.length === 0 ? empty('Nenhum pagamento dessas pessoas.') : (
                  <Rows rows={model.methods.map((m) => [
                    `${m.method} · ${m.person}`,
                    <span key="v" className={m.estimated ? VALUE_STYLE.estimado : undefined}>{m.estimated ? '≈ ' : ''}{formatBRL(m.brl)} · {m.count} {m.count === 1 ? 'gasto' : 'gastos'}</span>,
                  ])} />
                )}
              </Section>
            ) : null
          case 'gastos':
            return model.expenses ? (
              <Section key={key} title={`${title} (${model.expenses.length})`}>
                {model.expenses.length === 0 ? empty('Nenhum gasto.') : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {model.expenses.slice(0, 30).map((e, i) => (
                      <li key={i} className="flex gap-2 py-1.5">
                        <span className="w-10 shrink-0 text-xs text-slate-500">{shortDate(e.date)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{e.description}{e.pending && <span className="text-amber-600"> · a pagar</span>}</span>
                          <span className="block truncate text-xs text-slate-500">pago por {e.paidBy} · {e.participants}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums">
                          {showOriginal && <span className="block">{formatMoney(e.total, e.currency)}{withPart && e.part !== e.total && ` · parte ${formatMoney(e.part, e.currency)}`}</span>}
                          {showBRL && <span className={`block ${e.estimated ? VALUE_STYLE.estimado : 'text-slate-500'}`}>{e.estimated ? '≈ ' : ''}{formatBRL(withPart ? e.brlPart : e.brlTotal)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {model.expenses.length > 30 && empty(`… e mais ${model.expenses.length - 30} no PDF.`)}
              </Section>
            ) : null
          case 'saldos':
            return model.balances ? (
              <Section key={key} title={title}>
                <Rows rows={model.balances.map((b) => [
                  b.name,
                  b.amounts.length ? (
                    <span key="a" className="space-y-0.5">
                      {b.amounts.map((a) => <span key={a.currency} className={`block font-semibold ${balanceClass(a.value)}`}>{signedMoney(a.value, a.currency)}</span>)}
                    </span>
                  ) : <span key="z" className="text-slate-500">Tudo acertado</span>,
                ])} />
              </Section>
            ) : null
          case 'sugeridos':
            return model.transfers ? (
              <Section key={key} title={title}>
                {model.transfers.length === 0 ? empty('Nada a acertar.') : (
                  <Rows rows={model.transfers.map((t) => [`${t.from} → ${t.to}`, `${formatMoney(t.amount, t.currency)}${t.brl !== null ? ` (≈ ${formatBRL(t.brl)})` : ''}`])} />
                )}
              </Section>
            ) : null
          case 'acertos':
            return model.settlements ? (
              <Section key={key} title={title}>
                {model.settlements.length === 0 ? empty('Nenhum acerto registrado.') : (
                  <Rows rows={model.settlements.map((s) => [`${shortDate(s.date)} · ${s.from} → ${s.to}`, `${formatMoney(s.amount, s.currency)}${s.paid ? ` (pago ${formatMoney(s.paid.amount, s.paid.currency)})` : ''}`])} />
                )}
              </Section>
            ) : null
          case 'cambio':
            return model.fx ? (
              <Section key={key} title={title}>
                <Rows rows={[
                  ['IOF nos cartões', formatBRL(model.fx.cardIof)],
                  ['Spread nos cartões', formatBRL(model.fx.cardSpread)],
                  ...model.fx.extras.map((x) => [`Imposto · gorjetas (${x.currency})`, `${formatMoney(x.localTax, x.currency)} · ${formatMoney(x.tip, x.currency)}`] as [ReactNode, ReactNode]),
                  ...model.fx.loads.map((l) => [`Carga ${shortDate(l.date)} · ${l.wallet}`, `${formatMoney(l.amount, l.currency)} a ${formatRate(l.rate)}`] as [ReactNode, ReactNode]),
                ]} />
              </Section>
            ) : null
          case 'carteiras':
            return model.wallets ? (
              <Section key={key} title={title}>
                {model.wallets.length === 0 ? empty('Nenhuma carteira com saldo.') : (
                  <Rows rows={model.wallets.map((w) => [`${w.name} (${w.holder})`, `${formatMoney(w.units, w.currency)}${w.avg ? ` · médio ${formatRate(w.avg)}` : ''}`])} />
                )}
              </Section>
            ) : null
          case 'divisao':
            return model.divisions ? (
              <Section key={key} title={title}>
                {model.divisions.length === 0 ? empty('Nenhum gasto.') : model.divisions.slice(0, 20).map((d, i) => (
                  <div key={i} className="space-y-0.5 border-b border-slate-100 pb-1.5 text-sm last:border-0">
                    <p className="flex justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{shortDate(d.date)} · {d.description}{d.pending && <span className="text-amber-600"> · a pagar</span>}</span>
                      <span className="shrink-0 tabular-nums">{formatMoney(d.total, d.currency)}</span>
                    </p>
                    <p className="text-xs text-slate-500">Pagou: {d.payers.map((p) => `${p.name} ${formatMoney(p.amount, d.currency)}`).join(' · ')}</p>
                    <p className="text-xs text-slate-500">Parte de cada um: {d.shares.map((p) => `${p.name} ${formatMoney(p.amount, d.currency)}`).join(' · ')}</p>
                  </div>
                ))}
                {model.divisions.length > 20 && empty(`… e mais ${model.divisions.length - 20} no PDF.`)}
              </Section>
            ) : null
          case 'extrato':
            return model.statements ? (
              <Section key={key} title={title}>
                {model.statements.length === 0 ? empty('Nenhuma carteira escolhida.') : model.statements.map((st) => (
                  <div key={`${st.wallet}-${st.currency}`} className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-600">{st.wallet} ({st.holder}) · {st.currency}</p>
                    <Rows rows={[
                      ['Saldo anterior', formatMoney(st.opening, st.currency)] as [ReactNode, ReactNode],
                      ...st.lines.slice(0, 30).map((l) => [
                        `${shortDate(l.date)} · ${l.title}`,
                        <span key="v" className={l.units > 0 ? VALUE_STYLE.receber : undefined}>{l.units > 0 ? '+' : ''}{formatMoney(l.units, st.currency)} · saldo {formatMoney(l.balance, st.currency)}</span>,
                      ] as [ReactNode, ReactNode]),
                    ]} />
                    {st.lines.length > 30 && empty(`… e mais ${st.lines.length - 30} no PDF.`)}
                  </div>
                ))}
              </Section>
            ) : null
          case 'previstos':
            return model.forecast ? (
              <Section key={key} title={title}>
                {model.forecast.items.length === 0 ? empty('Nenhum gasto a pagar.') : (
                  <>
                    <Rows rows={model.forecast.items.map((i) => [`${shortDate(i.date)} · ${i.description}`, `${formatMoney(i.amount, i.currency)} · parte ${formatMoney(i.part, i.currency)}`])} />
                    <p className="pt-1 text-xs text-slate-500">Quando forem pagos, somam aos saldos:</p>
                    <Rows rows={model.forecast.balances.map((b) => [
                      b.name,
                      b.amounts.length ? (
                        <span key="a" className="space-y-0.5">
                          {b.amounts.map((a) => <span key={a.currency} className={`block font-semibold ${balanceClass(a.value)}`}>{signedMoney(a.value, a.currency)}</span>)}
                        </span>
                      ) : <span key="z" className="text-slate-500">—</span>,
                    ])} />
                  </>
                )}
              </Section>
            ) : null
          case 'orcamento':
            return model.budget ? (
              <Section key={key} title={`${title} (custo de ${model.budget.forNames})`}>
                <Rows rows={[...(model.budget.total ? [model.budget.total] : []), ...model.budget.categories].map((l) => [
                  l.id ? (model.budget!.names.get(l.id) ?? '—') : 'Total',
                  `${pct(l.share)} de ${formatBRL(l.limit)} · ${BUDGET_LEVEL_LABEL[l.level]}`,
                ])} />
              </Section>
            ) : config.sections.includes('orcamento') ? (
              <Section key={key} title={title}>{empty('A viagem não tem orçamento definido (Relatórios → Orçamento).')}</Section>
            ) : null
        }
      })}
    </article>
  )
}
