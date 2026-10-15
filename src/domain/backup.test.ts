import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from './backup'

const data = {
  categories: [{ id: 'c1', name: 'Hospedagem' }],
  paymentMethods: [{ id: 'm1', name: 'Pix' }],
  people: [{ id: 'eu', name: 'Guilherme' }, { id: 'p2', name: 'Ana', tripId: 'v1' }],
  trips: [{ id: 'v1', name: 'Orlando', closed: false, groups: [{ id: 'g1', name: 'Casal', memberIds: ['eu', 'p2'] }] }],
  expenses: [{ id: 'e1', amount: 1000 }],
  walletMoves: [{ id: 'w1', kind: 'carga', amount: 100000 }],
  settlements: [{ id: 's1', fromId: 'p2', toId: 'eu', amount: 500 }],
  receipts: [{ id: 'r1', expenseId: 'e1', tripId: 'v1', dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 20 }],
  settings: [{ key: 'k', value: 1 }],
}

describe('backup', () => {
  it('o que é exportado volta igual ao importar', () => {
    const text = JSON.stringify(buildBackup(data, '2026-10-14T12:00:00.000Z'))
    expect(parseBackup(text).data).toEqual(data)
  })

  it('backup do formato 1 (antes das carteiras) é lido, com a tabela que falta vazia', () => {
    const { walletMoves: _omit, ...older } = data
    const text = JSON.stringify({ app: 'controle-viagem', format: 1, exportedAt: '', data: older })
    expect(parseBackup(text).data.walletMoves).toEqual([])
    expect(parseBackup(text).data.expenses).toEqual(data.expenses)
  })

  it('backup do formato 2 (antes dos viajantes) ganha a pessoa "Eu"', () => {
    const older = { ...data, people: undefined, settlements: undefined, trips: [{ id: 'v1', name: 'Orlando' }] }
    const parsed = parseBackup(JSON.stringify({ app: 'controle-viagem', format: 2, exportedAt: 'T', data: older })).data
    expect(parsed.people).toEqual([{ id: 'eu', name: 'Eu', createdAt: 'T', updatedAt: 'T' }])
    expect(parsed.trips).toEqual([{ id: 'v1', name: 'Orlando', groups: [], closed: false }])
    expect(parsed.settlements).toEqual([])
  })

  it('backup do formato 3: pessoas passam a ser de cada viagem', () => {
    const older = {
      ...data,
      people: [{ id: 'eu', name: 'Eu' }, { id: 'p2', name: 'Ana' }],
      trips: [{ id: 'v1', name: 'Orlando', travelerIds: ['eu', 'p2'], groups: [] }],
    }
    const parsed = parseBackup(JSON.stringify({ app: 'controle-viagem', format: 3, exportedAt: '', data: older })).data
    expect(parsed.people).toEqual([{ id: 'eu', name: 'Eu' }, { id: 'p2', name: 'Ana', tripId: 'v1' }])
    expect(parsed.trips).toEqual([{ id: 'v1', name: 'Orlando', groups: [], closed: false }])
  })

  it('recusa arquivo que não é JSON', () => {
    expect(() => parseBackup('não é json')).toThrow(/não é um backup válido/)
  })

  it('recusa JSON de outra origem, inclusive backup do app de gastos', () => {
    expect(() => parseBackup('{"foo": 1}')).toThrow(/não é um backup do Controle de Viagem/)
    expect(() => parseBackup('null')).toThrow(/não é um backup do Controle de Viagem/)
    const gastos = JSON.stringify({ app: 'controle-gastos', format: 2, exportedAt: '', data })
    expect(() => parseBackup(gastos)).toThrow(/não é um backup do Controle de Viagem/)
  })

  it('recusa formato mais novo', () => {
    const text = JSON.stringify({ ...buildBackup(data, ''), format: 99 })
    expect(() => parseBackup(text)).toThrow(/versão mais nova/)
  })

  it('recusa tabela corrompida e backup sem categorias', () => {
    const broken = JSON.stringify(buildBackup({ ...data, expenses: ['x'] as unknown[] }, ''))
    expect(() => parseBackup(broken)).toThrow(/corrompido/)
    const empty = JSON.stringify(buildBackup({ ...data, categories: [] }, ''))
    expect(() => parseBackup(empty)).toThrow(/vazio/)
  })
})

describe('backup com comprovantes', () => {
  it('formato 4 (antes das fotos) é lido, sem comprovantes', () => {
    const { receipts: _omit, ...older } = data
    const parsed = parseBackup(JSON.stringify({ app: 'controle-viagem', format: 4, exportedAt: '', data: older })).data
    expect(parsed.receipts).toEqual([])
  })
})
