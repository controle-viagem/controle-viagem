import { peoplePerTrip } from './migracao'

/** Tabelas que entram no arquivo de backup, na ordem em que são gravadas. */
export const BACKUP_TABLES = [
  'categories', 'paymentMethods', 'people', 'trips', 'expenses', 'walletMoves', 'settlements', 'receipts', 'settings',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

export const BACKUP_APP = 'controle-viagem'

/**
 * Versão do formato dos arquivos (backup e, no futuro, sincronização). Sobe quando entra uma tabela nova:
 * assim um aparelho com versão antiga do app recusa o arquivo, em vez de regravá-lo sem os dados que não conhece.
 * 2 = carteiras; 3 = viajantes e acertos; 4 = pessoas de cada viagem; 5 = fotos dos comprovantes.
 */
export const FILE_FORMAT = 5

/** Id da pessoa "Eu" (repetido de db/types para o domínio não depender do banco). */
const ME = 'eu'

export interface Backup {
  app: typeof BACKUP_APP
  /** Versão do formato do arquivo. */
  format: typeof FILE_FORMAT
  exportedAt: string
  data: Record<BackupTable, unknown[]>
}

export function buildBackup(data: Record<BackupTable, unknown[]>, exportedAt: string): Backup {
  return { app: BACKUP_APP, format: FILE_FORMAT, exportedAt, data }
}

type Row = Record<string, unknown>

/**
 * Atualiza um backup antigo para o formato atual: a pessoa "Eu" sempre existe; viagens ganham grupos e `closed`;
 * antes do formato 4 as pessoas eram um cadastro só e passam a ser de cada viagem (`peoplePerTrip`).
 */
function upgrade(data: Record<BackupTable, unknown[]>, format: number, stamp: string) {
  const people = data.people as Row[]
  if (!people.some((p) => p.id === ME)) people.unshift({ id: ME, name: 'Eu', createdAt: stamp, updatedAt: stamp })
  for (const trip of data.trips as Row[]) {
    if (!Array.isArray(trip.groups)) trip.groups = []
    if (typeof trip.closed !== 'boolean') trip.closed = false
  }
  if (format < 4) {
    peoplePerTrip(
      { people, trips: data.trips as Row[], expenses: data.expenses as Row[], settlements: data.settlements as Row[] },
      () => crypto.randomUUID(),
    )
  }
}

/**
 * Lê e valida o conteúdo de um arquivo de backup. Lança Error com mensagem para o usuário
 * se o arquivo não for um backup deste app, para nunca apagar os dados atuais por engano.
 */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um backup válido (não foi possível ler o conteúdo).')
  }
  const backup = raw as Partial<Backup> | null
  if (!backup || typeof backup !== 'object' || backup.app !== BACKUP_APP || !backup.data) {
    throw new Error('Este arquivo não é um backup do Controle de Viagem.')
  }
  if (typeof backup.format !== 'number' || backup.format < 1 || backup.format > FILE_FORMAT) {
    throw new Error('Este backup foi feito por uma versão mais nova do app. Atualize o app antes de restaurar.')
  }
  const data = {} as Record<BackupTable, unknown[]>
  for (const table of BACKUP_TABLES) {
    const rows = backup.data[table] ?? []
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object')) {
      throw new Error(`O backup está corrompido (tabela "${table}").`)
    }
    data[table] = rows
  }
  if (data.categories.length === 0) throw new Error('O backup está vazio: não há categorias nele.')
  const exportedAt = String(backup.exportedAt ?? '')
  upgrade(data, backup.format, exportedAt)
  return { app: BACKUP_APP, format: FILE_FORMAT, exportedAt, data }
}
