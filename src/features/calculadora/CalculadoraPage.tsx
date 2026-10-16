import { useLiveQuery } from 'dexie-react-hooks'
import { BadgeCheck, Calculator } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { CurrencyBadge } from '../../components/Badges'
import { MoneyInput } from '../../components/MoneyInput'
import { PtaxButton } from '../../components/PtaxButton'
import { db } from '../../db/db'
import { byCurrency } from '../../domain/custoMedio'
import { cheapest, priceWithExtras, viaCard, viaWallet, type Option } from '../../domain/calculadora'
import { CURRENCIES, currencyName, decimalText, parseDecimal } from '../../domain/moeda'
import { isMine } from '../../domain/titular'
import { formatBRL, formatMoney, formatRate } from '../../lib/format'
import { useWalletData } from '../carteiras/useWalletData'

const TIPS = [0, 10, 15, 18, 20]

function PercentField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label !text-xs" htmlFor={id}>{label}</label>
      <input id={id} className="field" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/**
 * Quanto custa em reais um preço em moeda estrangeira, com imposto local e gorjeta: pelo custo médio das
 * carteiras, por cada cartão que cobra em reais e por uma simulação livre. Indica a opção mais barata.
 */
export function CalculadoraPage() {
  const { trip } = useApp()
  const wallet = useWalletData()
  const cards = (useLiveQuery(() => db.paymentMethods.where('kind').equals('cartao_brl').toArray(), []) ?? []).filter((m) => !m.archived && isMine(m))
  const tripCurrencies = trip?.currencies ?? []
  const [currency, setCurrency] = useState(tripCurrencies[0] ?? 'USD')
  const [price, setPrice] = useState(0)
  const [tax, setTax] = useState(decimalText(trip?.localTaxPct) || '0')
  const [tip, setTip] = useState('0')
  const [rate, setRate] = useState('')
  const [simRate, setSimRate] = useState('')
  const [simSpread, setSimSpread] = useState('0')
  const [simIof, setSimIof] = useState('3,5')
  // Última cotação usada num gasto no cartão nesta moeda, nesta viagem: sugerida como cotação do dia.
  const lastRate = useLiveQuery(
    async () =>
      trip
        ? (await db.expenses.where('tripId').equals(trip.id).filter((e) => e.currency === currency && !!e.rate).sortBy('date')).at(-1)?.rate
        : undefined,
    [trip?.id, currency],
  )

  const p = priceWithExtras(price, parseDecimal(tax) ?? 0, parseDecimal(tip) ?? 0)
  const rateText = rate || (lastRate ? decimalText(lastRate) : '')
  const rateN = parseDecimal(rateText)
  const options: Option[] = []

  const consolidated = byCurrency(wallet.ledger.positions).find((c) => c.currency === currency)
  if (consolidated?.avg) {
    options.push({ key: 'carteiras', label: 'Carteiras (custo médio)', detail: `médio ${formatRate(consolidated.avg)} · saldo ${formatMoney(consolidated.units, currency)}`, brl: viaWallet(p.total, consolidated.avg) })
  }
  const walletsWith = wallet.ledger.positions.filter((x) => x.currency === currency && x.avg && x.units > 0)
  if (walletsWith.length > 1) {
    for (const w of walletsWith) {
      const name = wallet.wallets.find((x) => x.id === w.walletId)?.name ?? '—'
      options.push({ key: `w:${w.walletId}`, label: name, detail: `médio ${formatRate(w.avg!)}`, brl: viaWallet(p.total, w.avg) })
    }
  }
  for (const card of cards) {
    const spread = card.spreadPct ?? 0
    const iof = card.iofPct ?? 0
    options.push({
      key: `c:${card.id}`,
      label: card.name,
      detail: rateN ? `${formatRate(rateN)} + spread ${decimalText(spread)}% + IOF ${decimalText(iof)}%` : 'informe a cotação do dia',
      brl: viaCard(p.total, rateN, spread, iof),
    })
  }
  const simRateN = parseDecimal(simRate)
  options.push({
    key: 'sim',
    label: 'Simulação livre',
    detail: simRateN ? `${formatRate(simRateN)} + spread ${simSpread || 0}% + IOF ${simIof || 0}%` : 'informe a cotação abaixo',
    brl: viaCard(p.total, simRateN, parseDecimal(simSpread) ?? 0, parseDecimal(simIof) ?? 0),
  })
  const best = price > 0 ? cheapest(options) : null
  const currencyList = [...tripCurrencies, ...CURRENCIES.filter((c) => c !== 'BRL' && !tripCurrencies.includes(c))]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Calculator size={22} className="text-slate-400" /> Calculadora
        </h1>
        <p className="text-sm text-slate-500">Quanto custa em reais, com imposto e gorjeta, e qual a forma mais barata de pagar.</p>
      </div>

      <section className="card space-y-3 p-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="label" htmlFor="calc-preco">Preço</label>
            <MoneyInput id="calc-preco" value={price} onChange={setPrice} currency={currency} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="calc-moeda">Moeda</label>
            <select
              id="calc-moeda"
              className="field"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value)
                setRate('')
              }}
            >
              {currencyList.map((c) => (
                <option key={c} value={c} title={currencyName(c)}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PercentField id="calc-imp" label="Imposto local (%)" value={tax} onChange={setTax} />
          <PercentField id="calc-gorj" label="Gorjeta (%)" value={tip} onChange={setTip} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-slate-500">Gorjeta:</span>
          {TIPS.map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${parseDecimal(tip) === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              onClick={() => setTip(String(t))}
            >
              {t}%
            </button>
          ))}
        </div>
        <dl className="space-y-0.5 border-t border-slate-100 pt-2 text-sm">
          <div className="flex justify-between text-slate-500"><dt>Imposto</dt><dd className="tabular-nums">{formatMoney(p.tax, currency)}</dd></div>
          <div className="flex justify-between text-slate-500"><dt>Gorjeta (sobre o preço sem imposto)</dt><dd className="tabular-nums">{formatMoney(p.tip, currency)}</dd></div>
          <div className="flex items-center justify-between font-semibold">
            <dt>Total a pagar</dt>
            <dd className="flex items-center gap-1.5 tabular-nums"><CurrencyBadge code={currency} /> {formatMoney(p.total, currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Em reais</h2>
        <div className="max-w-48">
          <label className="label !text-xs" htmlFor="calc-cot">Cotação do dia (para os cartões)</label>
          <input id="calc-cot" className="field" inputMode="decimal" placeholder="5,50" value={rateText} onChange={(e) => setRate(e.target.value)} />
        </div>
        <PtaxButton currency={currency} onRate={(r) => setRate(decimalText(r))} />
        <ul className="space-y-2">
          {options.map((o) => {
            const isBest = o.key === best
            return (
              <li key={o.key} className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${isBest ? 'bg-emerald-50 ring-emerald-600' : 'ring-slate-200'}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {o.label}
                    {isBest && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-px text-[10px] font-bold text-white">
                        <BadgeCheck size={11} /> mais barato
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{o.detail}</span>
                </span>
                <span className={`shrink-0 text-lg font-bold tabular-nums ${isBest ? 'text-emerald-700' : ''}`}>
                  {o.brl === null || price === 0 ? '—' : formatBRL(o.brl)}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
          <p className="col-span-3 text-xs font-medium text-slate-600">Simulação livre (ex.: outra casa de câmbio ou outro cartão)</p>
          <PercentField id="calc-sim-cot" label="Cotação (R$)" value={simRate} onChange={setSimRate} />
          <PercentField id="calc-sim-spread" label="Spread (%)" value={simSpread} onChange={setSimSpread} />
          <PercentField id="calc-sim-iof" label="IOF (%)" value={simIof} onChange={setSimIof} />
        </div>
        {!consolidated?.avg && (
          <p className="text-xs text-slate-500">Sem carga em {currency} nas carteiras: lance as cargas em Carteiras para comparar pelo custo médio.</p>
        )}
      </section>
    </div>
  )
}
