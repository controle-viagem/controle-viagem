import { Camera, CloudDownload, ImagePlus, Loader2, Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { shrinkImage, type ShrunkImage } from '../../lib/image'
import { fetchPhoto } from '../../sync/engine'
import { ReceiptViewer } from './ReceiptViewer'

export interface ReceiptDraft extends ShrunkImage {
  /** Ausente = foto nova, ainda não gravada. */
  id?: string
}

interface Props {
  photos: ReceiptDraft[]
  onAdd: (photos: ShrunkImage[]) => void
  onRemove: (index: number) => void
  readOnly?: boolean
}

/** Fotos dos comprovantes de um gasto: tirar com a câmera, escolher da galeria, ver em tela cheia e tirar. */
export function ReceiptsField({ photos, onAdd, onRemove, readOnly }: Props) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<number | null>(null)
  // Fotos lançadas em outro aparelho chegam sem a imagem: são baixadas agora, ao abrir o gasto.
  const [download, setDownload] = useState<Record<string, 'baixando' | 'falhou'>>({})
  const missing = photos.filter((p) => p.id && !p.dataUrl).map((p) => p.id!)
  const missingKey = missing.join(',')
  useEffect(() => {
    if (!missingKey) return
    let alive = true
    void (async () => {
      for (const id of missingKey.split(',')) {
        if (!alive) return
        setDownload((d) => ({ ...d, [id]: 'baixando' }))
        // Sucesso grava a foto no aparelho e a tela se atualiza sozinha; sem foto na nuvem ou sem internet, falhou.
        const ok = await fetchPhoto(id).catch(() => null)
        if (alive && !ok) setDownload((d) => ({ ...d, [id]: 'falhou' }))
      }
    })()
    return () => {
      alive = false
    }
  }, [missingKey])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    setError('')
    try {
      onAdd(await Promise.all(files.map((f) => shrinkImage(f))))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível usar essa imagem.')
    } finally {
      setBusy(false)
    }
  }

  if (readOnly && photos.length === 0) return null
  return (
    <section className="space-y-2 rounded-xl bg-slate-50 p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Paperclip size={15} className="text-slate-400" /> Comprovantes {photos.length > 0 && <span className="text-slate-500">({photos.length})</span>}
      </h3>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.id ?? `novo-${i}`} className="relative">
              {p.dataUrl ? (
                <button type="button" onClick={() => setViewing(i)} className="block overflow-hidden rounded-lg ring-1 ring-slate-200" aria-label={`Ver comprovante ${i + 1}`}>
                  <img src={p.dataUrl} alt="" className="h-16 w-16 object-cover" />
                </button>
              ) : (
                <span
                  className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-white text-center text-[10px] leading-tight text-slate-500 ring-1 ring-slate-200"
                  title={download[p.id!] === 'falhou' ? 'Sem internet, ou a foto ainda não chegou ao OneDrive. Abra o gasto de novo mais tarde.' : 'Baixando a foto do OneDrive'}
                >
                  {download[p.id!] === 'falhou' ? <CloudDownload size={18} /> : <Loader2 size={18} className="animate-spin" />}
                  {download[p.id!] === 'falhou' ? 'na nuvem' : 'baixando'}
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-0.5 text-white"
                  aria-label={`Tirar comprovante ${i + 1}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
          <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
          <button type="button" className="btn btn-ghost !px-3 !py-1.5 ring-1 ring-slate-300" onClick={() => camera.current?.click()} disabled={busy}>
            <Camera size={16} /> Foto
          </button>
          <button type="button" className="btn btn-ghost !px-3 !py-1.5 ring-1 ring-slate-300" onClick={() => gallery.current?.click()} disabled={busy}>
            <ImagePlus size={16} /> Galeria
          </button>
          {busy && <Loader2 size={16} className="animate-spin text-slate-400" />}
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {photos.some((p) => p.id && !p.dataUrl && download[p.id] === 'falhou') && (
        <p className="text-xs text-slate-500">Foto lançada em outro aparelho: sem internet (ou ainda não chegou ao OneDrive). Abra o gasto de novo mais tarde.</p>
      )}
      {viewing !== null && <ReceiptViewer photos={photos} start={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}
