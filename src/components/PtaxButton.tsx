import { Landmark, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { hasPtax, parsePtax, ptaxUrl, type Ptax } from '../domain/ptax'
import { shortDate, todayISO } from '../lib/format'

/** Busca no Banco Central o boletim PTAX mais recente da moeda. */
async function fetchPtax(currency: string): Promise<Ptax | null> {
  const response = await fetch(ptaxUrl(currency, todayISO()), { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`O Banco Central respondeu com erro ${response.status}.`)
  return parsePtax(await response.json())
}

/**
 * Botão "Cotação do dia (PTAX)": só busca quando o dono toca (decisão do dono). Preenche o campo com a cotação de
 * venda do boletim mais recente e diz de quando ela é. Moeda sem PTAX: o botão não aparece.
 */
export function PtaxButton({ currency, onRate }: { currency: string; onRate: (rate: number) => void }) {
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null)
  if (currency === 'BRL' || !hasPtax(currency)) return null

  async function load() {
    setBusy(true)
    setInfo(null)
    try {
      const ptax = await fetchPtax(currency)
      if (!ptax) return setInfo({ ok: false, text: 'O Banco Central não tem cotação recente dessa moeda.' })
      onRate(ptax.rate)
      const bulletin = ptax.bulletin ? ` (${ptax.bulletin.toLowerCase()})` : ''
      setInfo({ ok: true, text: `PTAX venda de ${shortDate(ptax.date)}, ${ptax.time.replace(':', 'h')}${bulletin}` })
    } catch {
      setInfo({ ok: false, text: navigator.onLine ? 'Não foi possível buscar a cotação agora.' : 'Sem internet para buscar a cotação.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <button type="button" className="inline-flex items-center gap-1 font-medium text-slate-600 hover:underline disabled:opacity-60" onClick={load} disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Landmark size={13} />} Cotação do dia (PTAX)
      </button>
      {info && <span className={info.ok ? 'text-slate-500' : 'text-rose-600'}>{info.text}</span>}
    </span>
  )
}
