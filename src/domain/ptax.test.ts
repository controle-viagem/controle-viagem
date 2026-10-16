import { describe, expect, it } from 'vitest'
import { hasPtax, parsePtax, ptaxUrl } from './ptax'

describe('cotação PTAX', () => {
  it('pede o boletim mais recente dos últimos 10 dias, com as datas no formato do Banco Central', () => {
    const url = ptaxUrl('USD', '2026-10-16')
    expect(url).toContain("@moeda='USD'")
    expect(url).toContain("@dataInicial='10-06-2026'")
    expect(url).toContain("@dataFinalCotacao='10-16-2026'")
    expect(url).toContain('$orderby=dataHoraCotacao%20desc&$top=1')
    // Virada de mês.
    expect(ptaxUrl('EUR', '2026-03-05')).toContain("@dataInicial='02-23-2026'")
  })

  it('lê a cotação de venda, a data, a hora e o boletim', () => {
    const json = { value: [{ cotacaoCompra: 5.0515, cotacaoVenda: 5.0521, dataHoraCotacao: '2026-10-15 13:05:33.305854', tipoBoletim: 'Fechamento' }] }
    expect(parsePtax(json)).toEqual({ rate: 5.0521, date: '2026-10-15', time: '13:05', bulletin: 'Fechamento' })
    expect(parsePtax({ value: [] })).toBeNull()
    expect(parsePtax(null)).toBeNull()
  })

  it('só as moedas que o Banco Central publica', () => {
    expect(hasPtax('USD')).toBe(true)
    expect(hasPtax('JPY')).toBe(true)
    expect(hasPtax('ARS')).toBe(false)
  })
})
