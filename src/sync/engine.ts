// Motor da sincronização: decide quando sincronizar e aplica o resultado no banco local.
// As regras de junção ficam em domain/sync.ts; a conversa com o OneDrive, em onedrive.ts.
// Copiado do app de gastos (com a renovação de login que funcionou lá); a diferença são as fotos dos comprovantes,
// que vão como arquivos próprios e são baixadas só quando alguém abre o comprovante.
import { BACKUP_TABLES } from '../domain/backup'
import {
  keepLocalPhotos, mergeData, parseSync, photosToDelete, photosToUpload, rowKey, serializeSync, withoutPhotos,
  type Row, type SyncData, type SyncFile,
} from '../domain/sync'
import { db } from '../db/db'
import { blobToDataUrl, dataUrlToBlob } from '../lib/image'
import * as onedrive from './onedrive'

export type SyncMode = 'dono' | 'convidado'

/** Estado da conexão, guardado só neste aparelho (tabela `local`). */
interface SyncMeta extends onedrive.FolderRef {
  mode: SyncMode
  homeAccountId: string
  account: string
  /** Geração dos dados que este aparelho acompanha; ausente enquanto a primeira carga não foi resolvida. */
  generation?: string
  eTag?: string
  lastSyncAt?: string
  /** Aparelho e nuvem têm dados: o usuário precisa escolher qual lado fica. */
  needsChoice?: boolean
}

export type SyncStatus = 'desligado' | 'ok' | 'sincronizando' | 'offline' | 'erro' | 'reconectar' | 'escolher'

export interface SyncState {
  status: SyncStatus
  mode?: SyncMode
  account?: string
  lastSyncAt?: string
  error?: string
  /** O que a sincronização está fazendo agora, para a tela mostrar onde ela está. */
  step?: string
}

const META = 'sync'
const PENDING = 'syncPending'
/** Fotos que já estão na nuvem (enviadas daqui ou baixadas de lá). */
const PHOTOS_SENT = 'syncFotosEnviadas'
/** Comprovantes excluídos cuja foto já foi apagada da nuvem. */
const PHOTOS_CLEANED = 'syncFotosApagadas'
const DEBOUNCE_MS = 3000
const INTERVAL_MS = 60000

let meta: SyncMeta | null = null
let state: SyncState = { status: 'desligado' }
const listeners = new Set<() => void>()

export const getSyncState = () => state
export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setState(status: SyncStatus, error?: string, step?: string) {
  state = { status, mode: meta?.mode, account: meta?.account, lastSyncAt: meta?.lastSyncAt, error, step }
  listeners.forEach((listener) => listener())
}

const setStep = (step: string) => setState('sincronizando', undefined, step)

async function saveMeta(next: SyncMeta | null) {
  meta = next
  if (next) await db.local.put({ key: META, value: next })
  else await db.local.delete(META)
}

async function readSet(key: string): Promise<Set<string>> {
  const value = (await db.local.get(key))?.value
  return new Set(Array.isArray(value) ? (value as string[]) : [])
}
const saveSet = (key: string, set: Set<string>) => db.local.put({ key, value: [...set] })

// ---------- banco local ----------

/** Verdadeiro enquanto o próprio motor grava no banco, para essas gravações não dispararem nova sincronização. */
let applying = false

async function readLocal(): Promise<SyncData> {
  const tables = {} as SyncData['tables']
  for (const table of BACKUP_TABLES) tables[table] = await db.table(table).toArray()
  return { tables, deletions: await db.deletions.toArray() }
}

/** Deixa o banco local exatamente igual a `data` (fotos já baixadas são mantidas). Tudo ou nada. */
async function writeLocal(data: SyncData): Promise<void> {
  applying = true
  try {
    await db.transaction('rw', [...BACKUP_TABLES.map((t) => db.table(t)), db.deletions], async () => {
      for (const table of BACKUP_TABLES) {
        const rows = table === 'receipts' ? keepLocalPhotos(data.tables.receipts, (await db.receipts.toArray()) as unknown as Row[]) : data.tables[table]
        const keep = new Set(rows.map(rowKey))
        const stale = (await db.table(table).toCollection().primaryKeys()).filter((key) => !keep.has(String(key)))
        await db.table(table).bulkDelete(stale)
        await db.table(table).bulkPut(rows)
      }
      await db.deletions.clear()
      await db.deletions.bulkPut(data.deletions)
    })
  } finally {
    applying = false
  }
}

// ---------- ciclo de sincronização ----------

let running = false
let again = false

/** Baixa, junta com o que há no aparelho e envia. Seguro chamar a qualquer momento. */
export async function syncNow(): Promise<void> {
  if (!meta || meta.needsChoice) return
  if (running) {
    again = true
    return
  }
  running = true
  setState('sincronizando')
  try {
    do {
      again = false
      // As fotos sobem antes dos dados: assim outro aparelho nunca vê um comprovante cuja foto ainda não chegou.
      await sendPhotos(meta)
      await cycle(meta)
    } while (again)
    await cleanPhotos(meta)
    await saveMeta({ ...meta, lastSyncAt: new Date().toISOString() })
    setState('ok')
  } catch (error) {
    const step = state.step ? ` (etapa: ${state.step.toLowerCase()})` : ''
    if (error instanceof onedrive.ReconnectError) setState('reconectar', error.message)
    else if (!navigator.onLine) setState('offline')
    // Falha de rede ou demora: passageiro, a próxima tentativa automática resolve.
    else if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) {
      setState('offline', `Sem resposta do OneDrive${step}. O app tenta de novo sozinho.`)
    } else if (error instanceof onedrive.TimeoutError) setState('erro', `${error.message}${step} O app tenta de novo sozinho.`)
    else setState('erro', (error instanceof Error ? error.message : 'Erro ao sincronizar.') + step)
  } finally {
    running = false
  }
}

async function cycle(current: SyncMeta): Promise<void> {
  // Outro aparelho pode gravar entre a leitura e o envio; nesse caso o envio é recusado e o ciclo recomeça.
  for (let attempt = 0; attempt < 4; attempt++) {
    setStep('Baixando do OneDrive')
    const remote = await onedrive.download(current.homeAccountId, current)
    setStep('Lendo os dados deste aparelho')
    const local = await readLocal()

    if (!remote) {
      // Arquivo ainda não existe (ou foi apagado do OneDrive): este aparelho o recria.
      setStep('Enviando ao OneDrive')
      const generation = current.generation ?? crypto.randomUUID()
      const eTag = await push(current, { generation, data: local })
      if (eTag) return void (await saveMeta({ ...current, generation, eTag }))
      continue
    }

    const file = parseSync(remote.text)
    if (file.generation !== current.generation) {
      // Alguém substituiu tudo de propósito: adota o conteúdo da nuvem em vez de juntar.
      setStep('Gravando neste aparelho')
      await writeLocal(file.data)
      return void (await saveMeta({ ...current, generation: file.generation, eTag: remote.eTag }))
    }

    const merged = mergeData(local, file.data)
    if (merged.localChanged) {
      setStep('Gravando neste aparelho')
      await writeLocal(merged.data)
    }
    if (!merged.remoteChanged) return void (await saveMeta({ ...current, eTag: remote.eTag }))
    setStep('Enviando ao OneDrive')
    const eTag = await push(current, { generation: file.generation, data: merged.data }, remote.eTag)
    if (eTag) return void (await saveMeta({ ...current, eTag }))
  }
  throw new Error('Não foi possível gravar no OneDrive: o arquivo está sendo alterado por outro aparelho.')
}

/** O arquivo de dados vai sempre sem as imagens dos comprovantes. */
const push = (current: SyncMeta, file: SyncFile, eTag?: string) =>
  onedrive.upload(current.homeAccountId, current, serializeSync({ ...file, data: withoutPhotos(file.data) }, new Date().toISOString()), eTag)

// ---------- fotos dos comprovantes ----------

/** Envia as fotos deste aparelho que ainda não estão na nuvem (cada uma sobe uma vez). */
async function sendPhotos(current: SyncMeta): Promise<void> {
  const sent = await readSet(PHOTOS_SENT)
  const pending = photosToUpload((await db.receipts.toArray()) as unknown as Row[], sent)
  for (const [i, id] of pending.entries()) {
    setStep(pending.length > 1 ? `Enviando fotos (${i + 1} de ${pending.length})` : 'Enviando foto')
    const receipt = await db.receipts.get(id)
    if (!receipt?.dataUrl) continue
    await onedrive.uploadPhoto(current.homeAccountId, current, id, dataUrlToBlob(receipt.dataUrl))
    sent.add(id)
    await saveSet(PHOTOS_SENT, sent)
  }
}

/** Apaga da nuvem as fotos dos comprovantes excluídos (melhor esforço: o que falhar fica para a próxima vez). */
async function cleanPhotos(current: SyncMeta): Promise<void> {
  const cleaned = await readSet(PHOTOS_CLEANED)
  const pending = photosToDelete(await db.deletions.toArray(), cleaned)
  for (const id of pending) {
    try {
      await onedrive.deletePhoto(current.homeAccountId, current, id)
      cleaned.add(id)
    } catch {
      break
    }
  }
  if (pending.length) await saveSet(PHOTOS_CLEANED, cleaned)
}

/**
 * Baixa a foto de um comprovante lançado em outro aparelho e guarda neste. Devolve a imagem, ou null se ela ainda
 * não chegou à nuvem (ou se este aparelho não sincroniza). Erros de rede sobem para quem chamou mostrar.
 */
export async function fetchPhoto(id: string): Promise<string | null> {
  const current = meta
  if (!current) return null
  const blob = await onedrive.downloadPhoto(current.homeAccountId, current, id)
  if (!blob) return null
  const dataUrl = await blobToDataUrl(blob)
  applying = true
  try {
    await db.receipts.update(id, { dataUrl })
  } finally {
    applying = false
  }
  const sent = await readSet(PHOTOS_SENT)
  sent.add(id)
  await saveSet(PHOTOS_SENT, sent)
  return dataUrl
}

// ---------- gatilhos ----------

let timer: ReturnType<typeof setTimeout> | undefined
let started = false

function schedule() {
  if (applying || !meta) return
  clearTimeout(timer)
  timer = setTimeout(syncNow, DEBOUNCE_MS)
}

function startTriggers() {
  if (started) return
  started = true
  // Qualquer gravação nas tabelas sincronizadas agenda um envio alguns segundos depois.
  for (const name of [...BACKUP_TABLES, 'deletions']) {
    const table = db.table(name)
    table.hook('creating', () => schedule())
    table.hook('updating', () => schedule())
    table.hook('deleting', () => schedule())
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
  window.addEventListener('online', () => syncNow())
  setInterval(() => document.visibilityState === 'visible' && syncNow(), INTERVAL_MS)
}

// ---------- conexão ----------

/** Login em curso: guardado antes de ir à Microsoft, lido na volta. */
interface Pending {
  mode: SyncMode
  link?: string
  /** Renovação automática feita pelo app ao abrir, sem o usuário pedir. */
  auto?: boolean
}

/** Roda uma vez na abertura do app, antes das telas: conclui um login em curso e retoma a sincronização. */
export async function initSync(): Promise<void> {
  const openedAt = Date.now()
  meta = ((await db.local.get(META))?.value as SyncMeta | undefined) ?? null
  const pending = (await db.local.get(PENDING))?.value as Pending | undefined
  if (!meta && !pending) return

  startTriggers()
  if (pending) {
    await db.local.delete(PENDING)
    try {
      const account = await onedrive.completeLogin()
      // Sem conta, o usuário desistiu na tela da Microsoft: segue como estava.
      if (account && meta) {
        // Era só um novo login de aparelho já conectado: a pasta continua a mesma.
        await saveMeta({ ...meta, homeAccountId: account.homeAccountId, account: account.username })
      } else if (account) {
        await finishConnect(pending.mode, pending.link, account.homeAccountId, account.username)
      }
    } catch (error) {
      // A renovação automática não conseguiu sem senha: fica o aviso para entrar de novo, sem mudar de tela.
      if (pending.auto) {
        setState('reconectar', 'O acesso ao OneDrive expirou.')
        return
      }
      setState('erro', error instanceof Error ? error.message : 'Não foi possível conectar ao OneDrive.')
      location.hash = '#/mais/sincronizacao'
      return
    }
    if (!pending.auto) location.hash = '#/mais/sincronizacao'
  }
  if (!meta) return
  if (meta.needsChoice) setState('escolher')
  else
    void syncNow().then(() => {
      if (state.status === 'reconectar' && !pending?.auto) void autoReconnect(openedAt)
    })
}

/** Inicia a conexão: guarda a intenção e manda para o login da Microsoft (a página recarrega na volta). */
export async function connect(mode: SyncMode, link?: string): Promise<void> {
  await db.local.put({ key: PENDING, value: { mode, link } })
  await onedrive.login()
}

/** O acesso expirou: novo login na Microsoft, já com a conta conectada e mantendo a mesma pasta. */
export async function reconnect(): Promise<void> {
  if (!meta) return
  await db.local.put({ key: PENDING, value: { mode: meta.mode } satisfies Pending })
  await onedrive.reauthenticate(meta.homeAccountId, meta.account, false)
}

const AUTO_KEY = 'sync.renovacaoAutomatica'
/** Só logo depois de abrir: mais tarde a pessoa pode estar no meio de um lançamento. */
const AUTO_WINDOW_MS = 20000

/**
 * A Microsoft só renova o acesso sozinha por 24 horas em apps web. Passado isso, ao abrir o app, tenta
 * uma ida e volta sem tela à Microsoft; se ainda houver sessão no navegador, volta tudo conectado.
 * Uma tentativa por abertura, para nunca entrar em ciclo.
 */
async function autoReconnect(openedAt: number): Promise<void> {
  if (!meta || Date.now() - openedAt > AUTO_WINDOW_MS) return
  // Com um formulário aberto, sair da tela perderia o que foi digitado.
  if (document.querySelector('[role="dialog"]')) return
  try {
    if (sessionStorage.getItem(AUTO_KEY)) return
    sessionStorage.setItem(AUTO_KEY, '1')
  } catch {
    return // sem como marcar a tentativa, não arrisca repetir
  }
  await db.local.put({ key: PENDING, value: { mode: meta.mode, auto: true } satisfies Pending })
  await onedrive.reauthenticate(meta.homeAccountId, meta.account, true)
}

async function finishConnect(mode: SyncMode, link: string | undefined, homeAccountId: string, account: string) {
  const folder =
    mode === 'dono' ? await onedrive.ownFolder(homeAccountId) : await onedrive.sharedFolder(homeAccountId, link ?? '')
  const base: SyncMeta = { mode, homeAccountId, account, driveId: folder.driveId, folderId: folder.folderId }
  // Pasta nova (ou outra pasta): nada se sabe ainda sobre as fotos dela.
  await db.local.bulkDelete([PHOTOS_SENT, PHOTOS_CLEANED])
  const remote = await onedrive.download(homeAccountId, base)

  if (!remote) {
    if (mode === 'convidado') {
      throw new Error('A pasta compartilhada ainda não tem dados. Peça para o dono conectar o app dele primeiro.')
    }
    // Primeira conexão do dono: o conteúdo deste aparelho inaugura o arquivo (feito pelo primeiro ciclo).
    return saveMeta(base)
  }
  parseSync(remote.text) // valida antes de aceitar a conexão
  // Aparelho sem viagens adota a nuvem direto; com viagens, o usuário escolhe qual lado fica.
  const hasLocalData = (await db.trips.count()) > 0
  await saveMeta({ ...base, needsChoice: hasLocalData })
}

/** Resolve a primeira carga quando aparelho e nuvem têm dados. */
export async function choose(side: 'nuvem' | 'aparelho'): Promise<void> {
  if (!meta) return
  if (side === 'aparelho') return replaceRemote()
  // generation fica ausente: o primeiro ciclo vê a diferença e adota o conteúdo da nuvem.
  await saveMeta({ ...meta, needsChoice: false, generation: undefined })
  await syncNow()
}

/**
 * Faz o conteúdo deste aparelho substituir o da nuvem (e, por consequência, o dos outros aparelhos).
 * Usado ao escolher "enviar os dados deste aparelho" e depois de restaurar um backup.
 */
export async function replaceRemote(): Promise<void> {
  if (!meta) return
  // Exclusões antigas não fazem sentido numa nova geração.
  applying = true
  try {
    await db.deletions.clear()
  } finally {
    applying = false
  }
  await sendPhotos(meta)
  const generation = crypto.randomUUID()
  const eTag = await push(meta, { generation, data: await readLocal() })
  await saveMeta({ ...meta, needsChoice: false, generation, eTag: eTag ?? undefined })
  await syncNow()
}

/** Para de sincronizar neste aparelho. Os dados continuam no aparelho e no OneDrive. */
export async function disconnect(): Promise<void> {
  if (!meta) return
  const { homeAccountId } = meta
  clearTimeout(timer)
  await saveMeta(null)
  setState('desligado')
  await onedrive.forgetAccount(homeAccountId).catch(() => undefined)
}

export const isConnected = () => meta !== null
