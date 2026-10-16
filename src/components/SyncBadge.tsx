import { Cloud, CloudAlert, CloudOff, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { SyncStatus } from '../sync/engine'
import { useSync } from '../sync/useSync'

const LOOK: Record<Exclude<SyncStatus, 'desligado'>, { icon: typeof Cloud; text: string; color: string }> = {
  ok: { icon: Cloud, text: 'Sincronizado', color: 'text-emerald-600' },
  sincronizando: { icon: RefreshCw, text: 'Sincronizando', color: 'text-slate-500' },
  offline: { icon: CloudOff, text: 'Sem conexão', color: 'text-slate-500' },
  erro: { icon: CloudAlert, text: 'Erro ao sincronizar', color: 'text-rose-600' },
  reconectar: { icon: CloudAlert, text: 'Entrar de novo', color: 'text-rose-600' },
  escolher: { icon: CloudAlert, text: 'Ação necessária', color: 'text-amber-600' },
}

/** Indicador discreto do estado da sincronização; some quando ela está desligada. */
export function SyncBadge({ className = '' }: { className?: string }) {
  const { status } = useSync()
  if (status === 'desligado') return null
  const { icon: Icon, text, color } = LOOK[status]
  return (
    <Link
      to="/mais/sincronizacao"
      className={`flex items-center gap-1.5 text-xs font-medium ${color} ${className}`}
      title="Sincronização"
    >
      <Icon size={14} className={status === 'sincronizando' ? 'animate-spin' : ''} />
      {text}
    </Link>
  )
}
