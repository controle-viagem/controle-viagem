// Tudo que fala com a Microsoft: login (MSAL) e arquivos do OneDrive (Microsoft Graph).
// O app lê e grava um arquivo de dados (FILE_NAME) na pasta FOLDER_NAME e as fotos dos comprovantes, uma por
// arquivo, na subpasta PHOTOS_FOLDER.
import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser'
import { AUTHORITY, CLIENT_ID, FILE_NAME, FOLDER_NAME, PHOTOS_FOLDER, redirectUri, SCOPES } from './config'

const GRAPH = 'https://graph.microsoft.com/v1.0'

/** Onde o arquivo de dados mora: a pasta (do próprio usuário ou compartilhada com ele). */
export interface FolderRef {
  driveId: string
  folderId: string
}

export class GraphError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** O login expirou e não dá para renovar sem o usuário: é preciso conectar de novo. */
export class ReconnectError extends Error {}

let clientPromise: Promise<PublicClientApplication> | null = null

// A biblioteca de login é carregada só quando a sincronização é usada.
function client(): Promise<PublicClientApplication> {
  clientPromise ??= import('@azure/msal-browser').then(async ({ PublicClientApplication }) => {
    const app = new PublicClientApplication({
      auth: { clientId: CLIENT_ID, authority: AUTHORITY, redirectUri: redirectUri() },
      cache: { cacheLocation: 'localStorage' },
    })
    await app.initialize()
    return app
  })
  return clientPromise
}

/** Conclui um login que acabou de voltar da Microsoft. Devolve a conta, ou null se não havia login em curso. */
export async function completeLogin(): Promise<AccountInfo | null> {
  const app = await client()
  // O app usa rotas em "#": o retorno do login também vem no "#", então é tratado aqui, antes das telas.
  const result = await app.handleRedirectPromise({ navigateToLoginRequestUrl: false })
  return result?.account ?? null
}

/** Leva o usuário à tela de login da Microsoft. A página é recarregada na volta. */
export async function login(): Promise<void> {
  const app = await client()
  await app.loginRedirect({ scopes: SCOPES, prompt: 'select_account' })
}

/**
 * Renova o acesso de uma conta já conectada, indo à Microsoft já com a conta indicada (sem a tela de
 * escolha). Com `silentOnly`, a Microsoft nunca mostra tela: se ainda há sessão no navegador, volta
 * logado; se precisar de senha, volta com erro, tratado em `completeLogin`.
 */
export async function reauthenticate(homeAccountId: string, username: string, silentOnly: boolean): Promise<void> {
  const app = await client()
  const account = app.getAccount({ homeAccountId }) ?? undefined
  await app.acquireTokenRedirect({
    scopes: SCOPES,
    account,
    loginHint: account ? undefined : username,
    prompt: silentOnly ? 'none' : undefined,
  })
}

export async function forgetAccount(homeAccountId: string): Promise<void> {
  const app = await client()
  const account = app.getAccount({ homeAccountId })
  // Limpa só o que o app guardou neste aparelho; não desloga a conta Microsoft do navegador.
  if (account) await app.clearCache({ account })
}

// Nenhuma etapa de rede pode ficar pendurada para sempre: em celular, uma conexão que troca de rede
// (wi-fi para 4G, volta da tela de login) pode deixar um pedido sem resposta nem erro.
const TIMEOUT_MS = 25000

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${what} demorou demais para responder.`)), TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Uma etapa de rede não respondeu a tempo. É passageiro: a próxima sincronização tenta de novo. */
export class TimeoutError extends Error {}

const request = (url: string, init: RequestInit, what: string) =>
  withTimeout(fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) }), what)

/**
 * Erros da renovação silenciosa (janela oculta da Microsoft) que só se resolvem passando de novo pela
 * Microsoft. Acontecem depois das 24 h, quando o navegador bloqueia a janela oculta (Safari, por exemplo)
 * ou ela não responde a tempo.
 */
const SILENT_RENEWAL_FAILURES = new Set(['timed_out', 'monitor_window_timeout', 'block_iframe_reload', 'empty_window_error'])

/** O erro do login pede uma ida à Microsoft? Sem internet, não: é só esperar a conexão voltar. */
export function needsReconnect(error: unknown, online = navigator.onLine): boolean {
  if (!online || !error || typeof error !== 'object') return false
  const { name, errorCode } = error as { name?: string; errorCode?: string }
  if (name === 'InteractionRequiredAuthError') return true
  return name === 'BrowserAuthError' && !!errorCode && SILENT_RENEWAL_FAILURES.has(errorCode)
}

async function token(homeAccountId: string): Promise<string> {
  const app = await withTimeout(client(), 'O login da Microsoft')
  const account = app.getAccount({ homeAccountId })
  if (!account) throw new ReconnectError('Conta não encontrada neste aparelho.')
  try {
    return (await withTimeout(app.acquireTokenSilent({ scopes: SCOPES, account }), 'O login da Microsoft')).accessToken
  } catch (error) {
    if (error instanceof TimeoutError) throw error
    if (needsReconnect(error)) throw new ReconnectError('O acesso ao OneDrive expirou.')
    throw error
  }
}

async function graph(homeAccountId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...init.headers, Authorization: `Bearer ${await token(homeAccountId)}` }
  const response = await request(GRAPH + path, { ...init, headers }, 'O OneDrive')
  if (!response.ok && response.status !== 404 && response.status !== 412) {
    const body = await response.json().catch(() => null)
    throw new GraphError(response.status, body?.error?.message ?? `Erro ${response.status} do OneDrive.`)
  }
  return response
}

/** Pasta do app no OneDrive de quem está conectado; cria se ainda não existir. */
export async function ownFolder(homeAccountId: string): Promise<FolderRef> {
  let response = await graph(homeAccountId, `/me/drive/root:/${encodeURIComponent(FOLDER_NAME)}`)
  if (response.status === 404) {
    response = await graph(homeAccountId, '/me/drive/root/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    })
  }
  const item = await response.json()
  return { driveId: item.parentReference.driveId, folderId: item.id }
}

/** Pasta compartilhada por outra pessoa, localizada pelo link de compartilhamento do OneDrive. */
export async function sharedFolder(homeAccountId: string, link: string): Promise<FolderRef> {
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(link.trim())))
  const shareId = 'u!' + base64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
  const response = await graph(homeAccountId, `/shares/${shareId}/driveItem`, {
    // Faz o link passar a valer para a conta conectada, como acontece ao abri-lo no navegador.
    headers: { Prefer: 'redeemSharingLinkIfNecessary' },
  })
  if (response.status === 404) throw new GraphError(404, 'Link de compartilhamento não encontrado.')
  const item = await response.json()
  if (!item.folder) throw new GraphError(400, `O link precisa ser da pasta "${FOLDER_NAME}", não de um arquivo.`)
  return { driveId: item.parentReference.driveId, folderId: item.id }
}

const filePath = (ref: FolderRef) => `/drives/${ref.driveId}/items/${ref.folderId}:/${FILE_NAME}`

/** Conteúdo e versão (eTag) do arquivo de dados; null se ele ainda não existe. */
export async function download(homeAccountId: string, ref: FolderRef): Promise<{ text: string; eTag: string } | null> {
  const meta = await graph(homeAccountId, filePath(ref))
  if (meta.status === 404) return null
  const item = await meta.json()
  const url: string | undefined = item['@microsoft.graph.downloadUrl']
  // O endereço de download já vem autorizado; sem ele, baixa pela própria API.
  const content = url
    ? await request(url, {}, 'O download do OneDrive')
    : await graph(homeAccountId, `${filePath(ref)}:/content`)
  if (!content.ok) throw new GraphError(content.status, 'Não foi possível baixar os dados do OneDrive.')
  return { text: await withTimeout(content.text(), 'O download do OneDrive'), eTag: item.eTag }
}

/**
 * Grava o arquivo de dados. Com `eTag`, só grava se ninguém alterou o arquivo desde a leitura;
 * devolve null quando alguém alterou (o chamador deve baixar, juntar e tentar de novo).
 */
export async function upload(homeAccountId: string, ref: FolderRef, text: string, eTag?: string): Promise<string | null> {
  const response = await graph(homeAccountId, `${filePath(ref)}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : {}) },
    body: text,
  })
  if (response.status === 412) return null
  if (response.status === 404) throw new GraphError(404, 'A pasta de dados não foi encontrada no OneDrive.')
  return (await response.json()).eTag
}

// ---------- fotos dos comprovantes ----------

const photoPath = (ref: FolderRef, id: string) =>
  `/drives/${ref.driveId}/items/${ref.folderId}:/${PHOTOS_FOLDER}/${encodeURIComponent(id)}.jpg`

/** Pastas de fotos já conferidas nesta abertura do app (não precisa perguntar de novo a cada foto). */
const photoFolders = new Set<string>()

/** Cria a subpasta das fotos se ainda não existir. */
async function ensurePhotosFolder(homeAccountId: string, ref: FolderRef): Promise<void> {
  const key = `${ref.driveId}:${ref.folderId}`
  if (photoFolders.has(key)) return
  const found = await graph(homeAccountId, `/drives/${ref.driveId}/items/${ref.folderId}:/${PHOTOS_FOLDER}`)
  if (found.status === 404) {
    try {
      await graph(homeAccountId, `/drives/${ref.driveId}/items/${ref.folderId}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: PHOTOS_FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      })
    } catch (error) {
      // Outro aparelho criou a pasta ao mesmo tempo: serve do mesmo jeito.
      if (!(error instanceof GraphError && error.status === 409)) throw error
    }
  }
  photoFolders.add(key)
}

/** Envia a foto de um comprovante (fotos nunca mudam: cada uma sobe uma vez). */
export async function uploadPhoto(homeAccountId: string, ref: FolderRef, id: string, photo: Blob): Promise<void> {
  await ensurePhotosFolder(homeAccountId, ref)
  const response = await graph(homeAccountId, `${photoPath(ref, id)}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: photo,
  })
  if (response.status === 404) throw new GraphError(404, 'A pasta de dados não foi encontrada no OneDrive.')
}

/** Baixa a foto de um comprovante; null se ela (ainda) não está na nuvem. */
export async function downloadPhoto(homeAccountId: string, ref: FolderRef, id: string): Promise<Blob | null> {
  const meta = await graph(homeAccountId, photoPath(ref, id))
  if (meta.status === 404) return null
  const url: string | undefined = (await meta.json())['@microsoft.graph.downloadUrl']
  // Como no arquivo de dados: o endereço de download já vem autorizado; sem ele, baixa pela própria API.
  const content = url ? await request(url, {}, 'O download da foto') : await graph(homeAccountId, `${photoPath(ref, id)}:/content`)
  if (!content.ok) throw new GraphError(content.status, 'Não foi possível baixar a foto do OneDrive.')
  return withTimeout(content.blob(), 'O download da foto')
}

/** Apaga da nuvem a foto de um comprovante excluído. Já não existir não é erro. */
export async function deletePhoto(homeAccountId: string, ref: FolderRef, id: string): Promise<void> {
  await graph(homeAccountId, photoPath(ref, id), { method: 'DELETE' })
}
