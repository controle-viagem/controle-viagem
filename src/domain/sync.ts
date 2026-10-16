import { BACKUP_APP, BACKUP_TABLES, FILE_FORMAT, type BackupTable } from './backup'

/** Registro de exclusão: impede que algo apagado em um aparelho volte vindo de outro. */
export interface Deletion {
  table: BackupTable
  id: string
  deletedAt: string
}

/** Linha de qualquer tabela sincronizada. Configurações usam `key` no lugar de `id`. */
export type Row = { id?: string; key?: string; updatedAt?: string } & Record<string, unknown>

export interface SyncData {
  tables: Record<BackupTable, Row[]>
  deletions: Deletion[]
}

export interface MergeResult {
  data: SyncData
  /** O resultado difere do que o aparelho tem: precisa gravar no banco local. */
  localChanged: boolean
  /** O resultado difere do que está na nuvem: precisa enviar. */
  remoteChanged: boolean
}

/** Conteúdo do arquivo guardado na nuvem. */
export interface SyncFile {
  /**
   * Identifica a "linhagem" dos dados. Muda quando alguém substitui tudo de propósito (restaurar backup,
   * enviar os dados de um aparelho por cima). Aparelho que encontra uma geração diferente da sua
   * adota o conteúdo da nuvem em vez de juntar, para o conteúdo antigo não voltar.
   */
  generation: string
  data: SyncData
}

export function serializeSync(file: SyncFile, savedAt: string): string {
  return JSON.stringify({ app: BACKUP_APP, format: FILE_FORMAT, generation: file.generation, savedAt, ...file.data })
}

/** Lê o arquivo da nuvem. Lança Error se não for um arquivo de dados deste app. */
export function parseSync(text: string): SyncFile {
  let raw: Record<string, unknown> | null
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo de dados na nuvem está ilegível.')
  }
  if (!raw || typeof raw !== 'object' || raw.app !== BACKUP_APP || typeof raw.generation !== 'string') {
    throw new Error('O arquivo encontrado na nuvem não é do Controle de Viagem.')
  }
  if (typeof raw.format !== 'number' || raw.format < 1 || raw.format > FILE_FORMAT) throw new Error('Os dados na nuvem são de uma versão mais nova do app. Atualize o app.')
  const tables = (raw.tables ?? {}) as Partial<Record<BackupTable, unknown>>
  const data = emptySyncData()
  for (const table of BACKUP_TABLES) {
    const rows = tables[table] ?? []
    if (!Array.isArray(rows)) throw new Error(`O arquivo de dados na nuvem está corrompido (tabela "${table}").`)
    data.tables[table] = rows as Row[]
  }
  data.deletions = Array.isArray(raw.deletions) ? (raw.deletions as Deletion[]) : []
  return { generation: raw.generation, data }
}

export const rowKey =(row: Row) => String(row.id ?? row.key)
const stamp = (row: Row | undefined) => row?.updatedAt ?? ''
const deletionKey = (d: Pick<Deletion, 'table' | 'id'>) => `${d.table}:${d.id}`

export const emptySyncData = (): SyncData => ({
  tables: Object.fromEntries(BACKUP_TABLES.map((t) => [t, [] as Row[]])) as Record<BackupTable, Row[]>,
  deletions: [],
})

/** Impressão digital do conteúdo: iguais se e só se têm os mesmos registros, versões e exclusões. */
function fingerprint(data: SyncData): string {
  const rows = BACKUP_TABLES.flatMap((t) => (data.tables[t] ?? []).map((r) => `${t}:${rowKey(r)}@${stamp(r)}`))
  const deletions = data.deletions.map((d) => `x:${deletionKey(d)}@${d.deletedAt}`)
  return [...rows, ...deletions].sort().join('|')
}

/**
 * Junta os dados do aparelho com os da nuvem, registro a registro:
 * - registro que só existe de um lado entra;
 * - nos dois lados, vale o de `updatedAt` mais recente (empate: o do aparelho);
 * - exclusão feita depois da última alteração remove o registro; alteração feita depois da exclusão o mantém.
 * Não depende da ordem: juntar A com B ou B com A dá o mesmo conteúdo.
 */
export function mergeData(local: SyncData, remote: SyncData): MergeResult {
  const deletions = new Map<string, Deletion>()
  for (const d of [...local.deletions, ...remote.deletions]) {
    const current = deletions.get(deletionKey(d))
    if (!current || d.deletedAt > current.deletedAt) deletions.set(deletionKey(d), d)
  }

  const data = emptySyncData()
  for (const table of BACKUP_TABLES) {
    const rows = new Map<string, Row>()
    for (const row of remote.tables[table] ?? []) rows.set(rowKey(row), row)
    for (const row of local.tables[table] ?? []) {
      const other = rows.get(rowKey(row))
      if (!other || stamp(row) >= stamp(other)) rows.set(rowKey(row), row)
    }
    for (const [key, row] of rows) {
      const deletion = deletions.get(deletionKey({ table, id: key }))
      if (!deletion) continue
      if (deletion.deletedAt >= stamp(row)) rows.delete(key)
      // Registro recriado ou alterado depois da exclusão: a exclusão deixa de valer.
      else deletions.delete(deletionKey(deletion))
    }
    data.tables[table] = [...rows.values()]
  }
  data.deletions = [...deletions.values()]

  const merged = fingerprint(data)
  return { data, localChanged: merged !== fingerprint(local), remoteChanged: merged !== fingerprint(remote) }
}

// ---------- fotos dos comprovantes ----------
// A imagem (`dataUrl`) não vai no arquivo de dados: cada foto é um arquivo próprio na nuvem, que sobe uma vez e é
// baixado só quando alguém abre o comprovante. No arquivo de dados o comprovante vai sem a imagem.

/** Os dados como vão para a nuvem: comprovantes sem a imagem. */
export function withoutPhotos(data: SyncData): SyncData {
  const receipts = data.tables.receipts.map(({ dataUrl: _photo, ...row }) => row as Row)
  return { ...data, tables: { ...data.tables, receipts } }
}

/**
 * Comprovantes a gravar no aparelho: os que chegam sem imagem ficam com a imagem que o aparelho já tem; sem ela,
 * com `dataUrl` vazio (a foto é baixada quando alguém abrir o comprovante).
 */
export function keepLocalPhotos(incoming: Row[], local: Row[]): Row[] {
  const photos = new Map(local.filter((r) => typeof r.dataUrl === 'string' && r.dataUrl).map((r) => [rowKey(r), r.dataUrl]))
  return incoming.map((r) => (typeof r.dataUrl === 'string' && r.dataUrl ? r : { ...r, dataUrl: photos.get(rowKey(r)) ?? '' }))
}

/** Fotos deste aparelho que ainda não subiram (as que vieram da nuvem já são marcadas como enviadas ao baixar). */
export const photosToUpload = (receipts: Row[], sent: ReadonlySet<string>) =>
  receipts.filter((r) => typeof r.dataUrl === 'string' && r.dataUrl && !sent.has(rowKey(r))).map(rowKey)

/** Comprovantes excluídos cuja foto ainda não foi apagada da nuvem. */
export const photosToDelete = (deletions: Deletion[], cleaned: ReadonlySet<string>) =>
  deletions.filter((d) => d.table === 'receipts' && !cleaned.has(d.id)).map((d) => d.id)
