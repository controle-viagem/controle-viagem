import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Download, FileText, Loader2, Share2, Sheet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/AppContext'
import { db } from '../../db/db'
import { setLocal } from '../../db/repo'
import { ME } from '../../db/types'
import { buildReport, presetConfig, PRESET_LABEL, SECTION_LABEL, SECTIONS, type Preset, type ReportConfig, type SectionKey } from '../../domain/relatorio'
import { holderLabel, isMine, walletsOf } from '../../domain/titular'
import { fetchPhoto } from '../../sync/engine'
import { CostSelector } from '../inicio/CostSelector'
import { myGroup } from '../acertos/tripBalances'
import { NoTrip } from '../viagens/NoTrip'
import { ReportPreview } from './ReportPreview'
import { useReportInput } from './useReportInput'

/** Última configuração usada, por viagem, neste aparelho. */
const configKey = (tripId: string) => `prestacao:${tripId}`

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div>
      <span className="label !text-xs">{label}</span>
      <div className={`grid gap-1 rounded-lg bg-slate-200/60 p-1 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`rounded-md px-1 py-1.5 text-xs font-semibold ${value === v ? 'seg-on' : 'text-slate-600'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Prestação de contas personalizável: o dono escolhe para quem é, quais gastos e quais partes entram, vê a prévia e
 * gera o PDF para mandar (WhatsApp) ou baixar.
 */
export function PrestacaoPage() {
  const { trip } = useApp()
  const { input, data } = useReportInput(trip)
  const saved = useLiveQuery(() => (trip ? db.local.get(configKey(trip.id)) : undefined), [trip?.id])
  const [draft, setDraft] = useState<ReportConfig | null>(null)
  const [preset, setPreset] = useState<Preset>('completo')
  const [busy, setBusy] = useState<'pdf' | 'planilha' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  if (!trip) return data.loaded ? <NoTrip /> : null
  if (!input) return null

  const travelerIds = new Set(data.travelers.map((p) => p.id))
  const stored = saved?.value as ReportConfig | undefined
  const config: ReportConfig = draft ?? stored ?? presetConfig('completo', [ME])
  const personIds = config.personIds.filter((id) => travelerIds.has(id))
  const effective = { ...config, personIds: personIds.length ? personIds : [ME] }
  const model = buildReport(input, effective)
  // Só para mim é um relatório; para outras pessoas, uma prestação de contas.
  const title = effective.personIds.length === 1 && effective.personIds[0] === ME ? 'Relatório da viagem' : 'Prestação de contas'
  const includedIds = new Set(model.included.map((e) => e.id))
  const photoCount = [...data.receiptCounts].reduce((sum, [id, n]) => sum + (includedIds.has(id) ? n : 0), 0)
  const categories = [...data.categories.values()].filter((c) => !c.parentId && !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  function update(next: Partial<ReportConfig>) {
    const merged = { ...effective, ...next }
    setDraft(merged)
    setFile(null)
    void setLocal(configKey(trip!.id), merged)
  }
  function applyPreset(p: Preset) {
    setPreset(p)
    const group = myGroup(trip!)
    const ids = p === 'completo' ? [ME] : p === 'familia' ? (group?.memberIds ?? [ME]) : effective.personIds
    update(presetConfig(p, ids))
  }
  const toggleSection = (key: SectionKey) =>
    update({ sections: SECTIONS.filter((s) => (s === key ? !effective.sections.includes(s) : effective.sections.includes(s))) })
  const toggleCategory = (id: string) => {
    const current = effective.cat ?? []
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    update({ cat: next.length ? next : undefined })
  }

  async function exportSheet() {
    setBusy('planilha')
    setError('')
    try {
      const [{ buildSpreadsheet }, { renderSpreadsheet }] = await Promise.all([import('../../domain/planilha'), import('../../lib/planilha')])
      const blob = await renderSpreadsheet(buildSpreadsheet(input!, effective, data.methods))
      const name = `planilha-${slug(trip!.name)}-${slug(model.forNames)}.xlsx`
      setFile(new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar a planilha.')
    } finally {
      setBusy(null)
    }
  }

  async function generate() {
    setBusy('pdf')
    setError('')
    try {
      const { renderReportPdf } = await import('../../lib/pdf')
      // Fotos só dos gastos incluídos, carregadas na hora (podem pesar).
      const photos = effective.anexos
        ? await db.receipts.where('expenseId').anyOf([...includedIds]).sortBy('createdAt')
        : []
      const attachments = new Map<string, { dataUrl: string; width: number; height: number }[]>()
      let missing = 0
      for (const p of photos) {
        // Foto lançada em outro aparelho e ainda não aberta aqui: baixa agora do OneDrive.
        const dataUrl = p.dataUrl || (await fetchPhoto(p.id).catch(() => null))
        if (!dataUrl) {
          missing++
          continue
        }
        attachments.set(p.expenseId, [...(attachments.get(p.expenseId) ?? []), { ...p, dataUrl }])
      }
      const blob = renderReportPdf(model, title, attachments)
      if (missing) setError(`${missing} ${missing === 1 ? 'foto ficou' : 'fotos ficaram'} de fora: ${missing === 1 ? 'está' : 'estão'} só no OneDrive e não deu para baixar agora (sem internet?).`)
      const name = `${slug(title)}-${slug(trip!.name)}-${slug(model.forNames)}.pdf`
      setFile(new File([blob], name, { type: 'application/pdf' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.')
    } finally {
      setBusy(null)
    }
  }

  function download() {
    if (!file) return
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const canShareFile = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  async function share() {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: `${title} · ${trip!.name}` })
    } catch {
      // compartilhamento cancelado
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/" className="btn btn-ghost !p-2" aria-label="Voltar ao Início">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Prestação de contas</h1>
          <p className="truncate text-sm text-slate-500">{trip.name} · escolha o que aparece e gere o PDF</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Box title="Modelo">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
                <button key={p} type="button" onClick={() => applyPreset(p)} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${preset === p ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
                  {PRESET_LABEL[p]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Ponto de partida: depois ajuste o que quiser abaixo. "Prestação de contas para…" mostra só o que envolve as
              pessoas escolhidas — as suas despesas individuais ficam de fora.
            </p>
          </Box>

          {data.travelers.length > 1 && (
            <Box title="Para quem">
              <CostSelector trip={trip} travelers={data.travelers} personIds={effective.personIds} onChange={(ids) => update({ personIds: ids.length ? ids : [ME] })} label="Custo e saldos de" />
            </Box>
          )}

          <Box title="Quais gastos">
            <Choice label="Gastos" value={effective.scope} onChange={(scope) => update({ scope })} options={[['envolvidos', 'Só os dessas pessoas'], ['todos', 'Todos da viagem']]} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label !text-xs" htmlFor="pc-de">De (opcional)</label>
                <input id="pc-de" type="date" className="field" value={effective.de ?? ''} onChange={(e) => update({ de: e.target.value || undefined })} />
              </div>
              <div>
                <label className="label !text-xs" htmlFor="pc-ate">Até (opcional)</label>
                <input id="pc-ate" type="date" className="field" value={effective.ate ?? ''} onChange={(e) => update({ ate: e.target.value || undefined })} />
              </div>
            </div>
            <div>
              <span className="label !text-xs">Categorias (nenhuma marcada = todas)</span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const on = !!effective.cat?.includes(c.id)
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleCategory(c.id)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </Box>

          <Box title="O que aparece">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {SECTIONS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={effective.sections.includes(key)} onChange={() => toggleSection(key)} />
                  {SECTION_LABEL[key]}
                </label>
              ))}
            </div>
            {effective.sections.includes('extrato') && (() => {
              // Extrato: carteiras das pessoas escolhidas; sem escolha, todas elas.
              const people = data.travelers.filter((p) => effective.personIds.includes(p.id))
              const theirs = people.flatMap((p) => walletsOf(p, input?.wallets ?? []))
              const chosen = effective.extratoCarteiras ?? theirs.map((w) => w.id)
              const toggle = (id: string) => {
                const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
                update({ extratoCarteiras: next.length === theirs.length ? undefined : next })
              }
              return (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Carteiras no extrato (por data, com saldo corrido, no período escolhido)</p>
                  {theirs.length === 0 ? (
                    <p className="text-xs text-slate-500">As pessoas escolhidas não têm carteira cadastrada.</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {theirs.map((w) => (
                        <label key={w.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={chosen.includes(w.id)} onChange={() => toggle(w.id)} />
                          {w.name}{!isMine(w) && <span className="text-xs text-slate-500">({holderLabel(w)})</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-slate-900" checked={!!effective.anexos} onChange={(e) => update({ anexos: e.target.checked || undefined })} />
              <span>
                Anexar comprovantes (fotos) no fim do PDF
                <span className="block text-xs text-slate-500">
                  {photoCount === 0 ? 'Nenhum gasto incluído tem foto.' : `${photoCount} ${photoCount === 1 ? 'foto' : 'fotos'} dos gastos incluídos.`}
                </span>
              </span>
            </label>
            <Choice label="Na lista de gastos" value={effective.valores} onChange={(valores) => update({ valores })} options={[['parte', 'Total e a parte deles'], ['total', 'Só o total']]} />
            <Choice label="Moeda" value={effective.moeda} onChange={(moeda) => update({ moeda })} options={[['ambas', 'As duas'], ['original', 'Original'], ['reais', 'Reais']]} />
            <Choice label="Outras pessoas nos gastos" value={effective.nomes} onChange={(nomes) => update({ nomes })} options={[['agrupar', 'Sem nome'], ['mostrar', 'Com nome']]} />
          </Box>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary flex-1" onClick={generate} disabled={!!busy}>
              {busy === 'pdf' ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} Gerar PDF
            </button>
            <button className="btn btn-ghost ring-1 ring-slate-300" onClick={exportSheet} disabled={!!busy}>
              {busy === 'planilha' ? <Loader2 size={18} className="animate-spin" /> : <Sheet size={18} />} Planilha (.xlsx)
            </button>
            {file && canShareFile && (
              <button className="btn btn-ghost ring-1 ring-slate-300" onClick={share}>
                <Share2 size={18} /> Compartilhar
              </button>
            )}
            {file && (
              <button className="btn btn-ghost ring-1 ring-slate-300" onClick={download}>
                <Download size={18} /> Baixar
              </button>
            )}
          </div>
          {file && <p className="text-xs text-emerald-600">Pronto: {file.name} ({Math.ceil(file.size / 1024)} KB).</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Prévia</p>
          <ReportPreview model={model} title={title} />
        </div>
      </div>
    </div>
  )
}
