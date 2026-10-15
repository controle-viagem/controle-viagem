import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Foto do comprovante em tela cheia, com anterior/próxima quando o gasto tem mais de uma. */
export function ReceiptViewer({ photos, start, onClose }: { photos: { dataUrl: string }[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const count = photos.length
  const go = (step: number) => setIndex((i) => (i + step + count) % count)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const photo = photos[index]
  if (!photo) return null
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-label="Comprovante">
      <div className="flex items-center justify-between p-3 text-sm text-white/80">
        <span>{count > 1 ? `Comprovante ${index + 1} de ${count}` : 'Comprovante'}</span>
        <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={onClose} aria-label="Fechar">
          <X size={22} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <img src={photo.dataUrl} alt={`Comprovante ${index + 1}`} className="h-full w-full object-contain" />
        {count > 1 && (
          <>
            <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white" onClick={() => go(-1)} aria-label="Anterior">
              <ChevronLeft size={24} />
            </button>
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white" onClick={() => go(1)} aria-label="Próxima">
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
