// @vitest-environment happy-dom
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { SheetTable } from '../domain/planilha'
import { renderSpreadsheet } from './planilha'

describe('arquivo da planilha', () => {
  it('gera um .xlsx com uma aba por tabela, datas e números', async () => {
    const tables: SheetTable[] = [
      { name: 'Gastos', columns: [{ header: 'Data', format: 'data', width: 11 }, { header: 'Descrição', format: 'texto', width: 20 }, { header: 'Valor', format: 'dinheiro', width: 12 }], rows: [['2026-12-21', 'Jantar à beira-mar', 123.45]] },
      { name: 'Resumo', columns: [{ header: '%', format: 'percentual', width: 8 }], rows: [[0.5]] },
    ]
    const blob = await renderSpreadsheet(tables)
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain('name="Gastos"')
    expect(workbook).toContain('name="Resumo"')
    const strings = strFromU8(files['xl/sharedStrings.xml'] ?? new Uint8Array())
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(strings + sheet).toContain('Jantar à beira-mar')
    expect(sheet).toContain('123.45')
  })
})
