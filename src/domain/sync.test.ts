import { describe, expect, it } from 'vitest'
import {
  emptySyncData, keepLocalPhotos, mergeData, parseSync, photosToDelete, photosToUpload, serializeSync, withoutPhotos, type Deletion,
  type Row, type SyncData,
} from './sync'

const T1 = '2026-10-13T10:00:00.000Z'
const T2 = '2026-10-13T11:00:00.000Z'
const T3 = '2026-10-13T12:00:00.000Z'

function data(expenses: Row[], deletions: Deletion[] = [], settings: Row[] = []): SyncData {
  const d = emptySyncData()
  d.tables.expenses = expenses
  d.tables.settings = settings
  d.deletions = deletions
  return d
}
const tx = (id: string, updatedAt: string, amount = 100): Row => ({ id, updatedAt, amount })
const ids = (d: SyncData) => d.tables.expenses.map((r) => r.id).sort()
const del = (id: string, deletedAt: string): Deletion => ({ table: 'expenses', id, deletedAt })

describe('arquivo da nuvem', () => {
  it('o que é gravado volta igual ao ler', () => {
    const file = { generation: 'g1', data: data([tx('a', T1)], [del('b', T2)], [{ key: 'k', value: 1, updatedAt: T1 }]) }
    expect(parseSync(serializeSync(file, T3))).toEqual(file)
  })

  it('lê arquivo do formato anterior e recusa o de uma versão mais nova do app', () => {
    const file = { generation: 'g1', data: data([tx('a', T1)]) }
    const older = JSON.parse(serializeSync(file, T3))
    expect(parseSync(JSON.stringify({ ...older, format: 1 })).data.tables.expenses).toEqual([tx('a', T1)])
    expect(() => parseSync(JSON.stringify({ ...older, format: 99 }))).toThrow(/versão mais nova/)
  })

  it('recusa arquivo de outra origem ou ilegível', () => {
    expect(() => parseSync('{"foo":1}')).toThrow(/não é do Controle de Viagem/)
    expect(() => parseSync('<html>')).toThrow(/ilegível/)
  })
})

describe('mergeData', () => {
  it('lançamentos feitos em aparelhos diferentes: os dois entram', () => {
    const r = mergeData(data([tx('a', T1)]), data([tx('b', T1)]))
    expect(ids(r.data)).toEqual(['a', 'b'])
    expect(r.localChanged).toBe(true)
    expect(r.remoteChanged).toBe(true)
  })

  it('mesmo lançamento editado nos dois: vale a edição mais recente', () => {
    const r = mergeData(data([tx('a', T1, 100)]), data([tx('a', T2, 250)]))
    expect(r.data.tables.expenses).toEqual([tx('a', T2, 250)])
    expect(r.localChanged).toBe(true)
    expect(r.remoteChanged).toBe(false)
  })

  it('nada mudou: não grava nem envia', () => {
    const same = data([tx('a', T1), tx('b', T2)], [del('z', T1)])
    const r = mergeData(same, data([tx('b', T2), tx('a', T1)], [del('z', T1)]))
    expect(r.localChanged).toBe(false)
    expect(r.remoteChanged).toBe(false)
  })

  it('aparelho com novidade e nuvem vazia: só envia', () => {
    const r = mergeData(data([tx('a', T1)]), emptySyncData())
    expect(r.localChanged).toBe(false)
    expect(r.remoteChanged).toBe(true)
  })

  it('excluído em um aparelho some no outro e não ressuscita', () => {
    const r = mergeData(data([], [del('a', T2)]), data([tx('a', T1)]))
    expect(ids(r.data)).toEqual([])
    expect(r.data.deletions).toEqual([del('a', T2)])
    // O outro aparelho, que ainda tem o registro, recebe a exclusão ao juntar de novo.
    const again = mergeData(data([tx('a', T1)]), r.data)
    expect(ids(again.data)).toEqual([])
    expect(again.localChanged).toBe(true)
  })

  it('editado depois de excluído no outro aparelho: a edição vence e a exclusão é descartada', () => {
    const r = mergeData(data([tx('a', T3, 999)]), data([], [del('a', T2)]))
    expect(r.data.tables.expenses).toEqual([tx('a', T3, 999)])
    expect(r.data.deletions).toEqual([])
  })

  it('configurações usam a chave como identificador', () => {
    const local = data([], [], [{ key: 'saldoInicial', value: 1000, updatedAt: T1 }])
    const remote = data([], [], [{ key: 'saldoInicial', value: 5000, updatedAt: T2 }])
    expect(mergeData(local, remote).data.tables.settings).toEqual([{ key: 'saldoInicial', value: 5000, updatedAt: T2 }])
  })

  it('o resultado não depende de qual lado é o aparelho', () => {
    const a = data([tx('a', T1), tx('c', T3, 7)], [del('b', T2)])
    const b = data([tx('b', T1), tx('c', T2, 3)], [del('a', T2)])
    const ab = mergeData(a, b).data
    const ba = mergeData(b, a).data
    expect(ids(ab)).toEqual(ids(ba))
    expect(ab.tables.expenses.find((r) => r.id === 'c')).toEqual(tx('c', T3, 7))
    expect(ab.deletions.map((d) => d.id).sort()).toEqual(ba.deletions.map((d) => d.id).sort())
  })
})

describe('fotos dos comprovantes na sincronização', () => {
  const photo = (id: string, dataUrl: string): Row => ({ id, updatedAt: T1, expenseId: 'g', dataUrl })

  it('o arquivo de dados vai sem as imagens, e a junção não as considera mudança', () => {
    const local = emptySyncData()
    local.tables.receipts = [photo('r1', 'data:image/jpeg;base64,AAA')]
    const cloud = withoutPhotos(local)
    expect(cloud.tables.receipts).toEqual([{ id: 'r1', updatedAt: T1, expenseId: 'g' }])
    expect(local.tables.receipts[0].dataUrl).toBe('data:image/jpeg;base64,AAA')
    expect(mergeData(local, cloud)).toMatchObject({ localChanged: false, remoteChanged: false })
  })

  it('o que chega da nuvem mantém a foto que o aparelho já tem; sem ela, fica para baixar', () => {
    const incoming = [{ id: 'r1', updatedAt: T2 }, { id: 'r2', updatedAt: T1 }]
    expect(keepLocalPhotos(incoming, [photo('r1', 'data:A')])).toEqual([
      { id: 'r1', updatedAt: T2, dataUrl: 'data:A' },
      { id: 'r2', updatedAt: T1, dataUrl: '' },
    ])
  })

  it('sobe só as fotos novas deste aparelho e apaga da nuvem as dos comprovantes excluídos', () => {
    expect(photosToUpload([photo('r1', 'data:A'), photo('r2', ''), photo('r3', 'data:C')], new Set(['r1']))).toEqual(['r3'])
    const deletions: Deletion[] = [{ table: 'receipts', id: 'r1', deletedAt: T1 }, { table: 'expenses', id: 'g', deletedAt: T1 }, { table: 'receipts', id: 'r2', deletedAt: T1 }]
    expect(photosToDelete(deletions, new Set(['r2']))).toEqual(['r1'])
  })
})
