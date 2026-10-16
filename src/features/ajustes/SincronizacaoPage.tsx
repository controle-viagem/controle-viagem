import { Cloud, RefreshCw, Unplug } from 'lucide-react'
import { useState } from 'react'
import { FOLDER_NAME } from '../../sync/config'
import {
  choose, connect, disconnect, reconnect, syncNow, type SyncMode, type SyncStatus,
} from '../../sync/engine'
import { useSync } from '../../sync/useSync'
import { BackLink } from './BackLink'

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_TEXT: Record<SyncStatus, string> = {
  desligado: 'Desligada',
  ok: 'Sincronizado',
  sincronizando: 'Sincronizando…',
  offline: 'Sem conexão — sincroniza quando a internet voltar',
  erro: 'Erro ao sincronizar',
  reconectar: 'É preciso entrar de novo na conta Microsoft',
  escolher: 'Aguardando sua escolha',
}

function Connect() {
  const [mode, setMode] = useState<SyncMode>('dono')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    if (mode === 'convidado' && !/^https:\/\//.test(link.trim())) {
      return setError('Cole o link de compartilhamento da pasta (começa com https://).')
    }
    setBusy(true)
    try {
      await connect(mode, mode === 'convidado' ? link.trim() : undefined)
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o login da Microsoft.')
    }
  }

  return (
    <section className="card space-y-4 p-4">
      <h2 className="font-semibold">Conectar ao OneDrive</h2>
      <div className="space-y-2">
        {(
          [
            ['dono', 'Guardar no meu OneDrive', `O app cria a pasta "${FOLDER_NAME}" no seu OneDrive e guarda os dados nela.`],
            ['convidado', 'Entrar em um controle compartilhado comigo', 'Outra pessoa já guarda os dados no OneDrive dela e compartilhou a pasta com você.'],
          ] as const
        ).map(([value, title, hint]) => (
          <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === value ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
            <input type="radio" name="modo" className="mt-1 accent-slate-900" checked={mode === value} onChange={() => setMode(value)} />
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-slate-500">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === 'convidado' && (
        <div>
          <label className="label" htmlFor="sync-link">Link de compartilhamento da pasta</label>
          <input
            id="sync-link"
            className="field"
            placeholder="https://1drv.ms/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Quem compartilhou obtém o link no OneDrive: botão Compartilhar da pasta "{FOLDER_NAME}", com permissão de
            edição para você.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button className="btn btn-primary" onClick={start} disabled={busy}>
        <Cloud size={16} /> Entrar com a conta Microsoft
      </button>
      <p className="text-xs text-slate-500">
        Você será levado à página de login da Microsoft e voltará para cá. A Microsoft vai pedir permissão para o app
        ler e gravar arquivos do seu OneDrive; o app usa apenas a pasta dele (dados e fotos dos comprovantes).
      </p>
    </section>
  )
}

export function SincronizacaoPage() {
  const sync = useSync()
  const [busy, setBusy] = useState(false)

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (!confirm('Parar de sincronizar neste aparelho?\n\nOs dados continuam aqui e no OneDrive.')) return
    await disconnect()
  }

  return (
    <div className="space-y-4">
      <BackLink title="Sincronização" />
      <p className="text-sm text-slate-500">
        Mantém os mesmos dados em todos os seus aparelhos, guardados em uma pasta do OneDrive. Cada pessoa entra com a
        própria conta Microsoft. As fotos dos comprovantes vão como arquivos à parte e, em outro aparelho, só são baixadas
        quando você abre o comprovante.
      </p>

      {sync.error && sync.status !== 'ok' && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{sync.error}</p>
      )}

      {sync.status === 'desligado' || (sync.status === 'erro' && !sync.account) ? (
        <Connect />
      ) : (
        <>
          <section className="card space-y-1 p-4">
            <div className="text-sm text-slate-500">Conta</div>
            <div className="font-medium">{sync.account}</div>
            <div className="text-sm text-slate-500">
              {sync.mode === 'dono' ? 'Dados guardados no seu OneDrive' : 'Usando uma pasta compartilhada com você'}
            </div>
            <div className="pt-2 text-sm">
              <span className="font-medium">{STATUS_TEXT[sync.status]}</span>
              {sync.status === 'sincronizando' && sync.step && <span className="text-slate-500"> · {sync.step}</span>}
              {sync.lastSyncAt && <span className="text-slate-500"> · última vez em {dateTime(sync.lastSyncAt)}</span>}
            </div>
          </section>

          {sync.status === 'escolher' && (
            <section className="card space-y-3 border-amber-300 bg-amber-50 p-4">
              <h2 className="font-semibold">Qual lado fica?</h2>
              <p className="text-sm text-slate-700">
                Já existem dados no OneDrive e também neste aparelho. Escolha qual conjunto vale; o outro é
                descartado.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={busy} onClick={run(() => choose('nuvem'))}>
                  Usar os dados do OneDrive
                </button>
                <button
                  className="btn btn-ghost ring-1 ring-slate-300"
                  disabled={busy}
                  onClick={run(async () => {
                    if (confirm('Substituir os dados do OneDrive pelos deste aparelho?\n\nIsso vale para todos os aparelhos conectados.')) {
                      await choose('aparelho')
                    }
                  })}
                >
                  Enviar os dados deste aparelho
                </button>
              </div>
            </section>
          )}

          {/* Num erro que o app não reconhece, entrar de novo na Microsoft também fica à mão. */}
          {(sync.status === 'reconectar' || sync.status === 'erro') && (
            <button className="btn btn-primary" onClick={run(reconnect)} disabled={busy}>
              <Cloud size={16} /> Entrar de novo
            </button>
          )}

          <div className="flex flex-wrap gap-2">
            {sync.status !== 'escolher' && sync.status !== 'reconectar' && (
              <button className="btn btn-ghost ring-1 ring-slate-300" onClick={run(syncNow)} disabled={busy || sync.status === 'sincronizando'}>
                <RefreshCw size={16} /> Sincronizar agora
              </button>
            )}
            <button className="btn btn-danger" onClick={leave}>
              <Unplug size={16} /> Desconectar este aparelho
            </button>
          </div>

          {sync.mode === 'dono' && (
            <section className="card space-y-2 p-4 text-sm text-slate-600">
              <h2 className="font-semibold text-slate-900">Compartilhar com outra pessoa</h2>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Abra o OneDrive e localize a pasta "{FOLDER_NAME}".</li>
                <li>Use Compartilhar, informe o e-mail Microsoft da pessoa e dê permissão para editar.</li>
                <li>Copie o link da pasta e envie para ela.</li>
                <li>No app dela: Mais → Sincronização → "Entrar em um controle compartilhado comigo", colando o link.</li>
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  )
}
