// Grava a planilha (.xlsx) a partir das abas montadas em domain/planilha.ts. Carregado só ao exportar.
import writeXlsxFile, { type Cell, type Sheet } from 'write-excel-file/browser'
import type { ColumnFormat, SheetTable } from '../domain/planilha'

const FORMAT: Record<Exclude<ColumnFormat, 'texto' | 'data'>, string> = {
  dinheiro: '#,##0.00',
  cotacao: '0.0000',
  percentual: '0%',
}

/** 'AAAA-MM-DD' -> data do Excel (meia-noite local, sem pular dia por fuso). */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function cell(value: string | number | null, format: ColumnFormat): Cell {
  if (value === null || value === '') return null
  if (format === 'data' && typeof value === 'string') return { value: toDate(value), type: Date, format: 'dd/mm/yyyy' }
  if (format !== 'texto' && format !== 'data' && typeof value === 'number') return { value, type: Number, format: FORMAT[format] }
  return { value: String(value), type: String }
}

/** Gera o arquivo .xlsx com uma aba por tabela, cabeçalho em negrito e fixo no topo. */
export async function renderSpreadsheet(tables: SheetTable[]): Promise<Blob> {
  const sheets: Sheet<Blob>[] = tables.map((t) => ({
    sheet: t.name,
    columns: t.columns.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
    data: [
      t.columns.map((c) => ({ value: c.header, type: String, fontWeight: 'bold' as const, backgroundColor: '#E2E8F0' })),
      ...t.rows.map((row) => row.map((value, i) => cell(value, t.columns[i]?.format ?? 'texto'))),
    ],
  }))
  return writeXlsxFile(sheets).toBlob()
}
