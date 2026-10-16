// @vitest-environment happy-dom
// Simula dois aparelhos conversando com um "OneDrive" em memória, passando pelo fluxo real de conexão.
// Copiado do app de gastos e adaptado às viagens e às fotos dos comprovantes.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** O "OneDrive" de mentira: o arquivo de dados, a versão dele e as fotos. */
const cloud = vi.hoisted(() => ({
  text: null as string | null,
  version: 0,
  photos: new Map<string, Blob>(),
  /** Acesso vencido: o OneDrive recusa até a conta passar de novo pela Microsoft. */
  expired: false,
  /** Idas à Microsoft para renovar o acesso; `silentOnly` é a tentativa automática, sem tela. */
  reauth: [] as { silentOnly: boolean }[],
  /** A Microsoft voltou sem login (pediu senha numa tentativa sem tela). */
  loginFails: false,
}))

vi.mock('./onedrive', () => {
  class GraphError extends Error {}
  class ReconnectError extends Error {}
  class TimeoutError extends Error {}
  return {
    GraphError,
    ReconnectError,
    TimeoutError,
    completeLogin: async () => {
      if (cloud.loginFails) throw new Error('login_required')
      return { homeAccountId: 'conta-1', username: 'teste@outlook.com' }
    },
    login: async () => undefined,
    forgetAccount: async () => undefined,
    ownFolder: async () => ({ driveId: 'd', folderId: 'f' }),
    sharedFolder: async () => ({ driveId: 'd', folderId: 'f' }),
    reauthenticate: async (_id: string, _user: string, silentOnly: boolean) => {
      cloud.reauth.push({ silentOnly })
    },
    download: async () => {
      if (cloud.expired) throw new ReconnectError('O acesso ao OneDrive expirou.')
      return cloud.text === null ? null : { text: cloud.text, eTag: String(cloud.version) }
    },
    upload: async (_account: string, _ref: unknown, text: string, eTag?: string) => {
      if (eTag !== undefined && eTag !== String(cloud.version)) return null
      cloud.text = text
      return String(++cloud.version)
    },
    uploadPhoto: async (_account: string, _ref: unknown, id: string, photo: Blob) => {
      cloud.photos.set(id, photo)
    },
    downloadPhoto: async (_account: string, _ref: unknown, id: string) => cloud.photos.get(id) ?? null,
    deletePhoto: async (_account: string, _ref: unknown, id: string) => {
      cloud.photos.delete(id)
    },
  }
})

/** Liga um "aparelho" novo: banco zerado e módulos recarregados, como um navegador que nunca abriu o app. */
async function newDevice() {
  vi.resetModules()
  // O Dexie guarda a referência do banco ao ser carregado; é nela que se troca por um banco vazio.
  const { default: Dexie } = await import('dexie')
  Dexie.dependencies.indexedDB = new (await import('fake-indexeddb')).IDBFactory()
  const { db } = await import('../db/db')
  const repo = await import('../db/repo')
  const engine = await import('./engine')
  const connect = async (mode: 'dono' | 'convidado') => {
    await db.local.put({ key: 'syncPending', value: { mode, link: 'https://1drv.ms/x' } })
    await engine.initSync()
    await settle(engine)
  }
  return { db, repo, engine, connect }
}

/** Espera a sincronização em curso terminar; falha se ela nunca sair de "sincronizando". */
async function settle(engine: typeof import('./engine')) {
  for (let i = 0; i < 200; i++) {
    if (engine.getSyncState().status !== 'sincronizando') return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('a sincronização ficou presa em "sincronizando"')
}

type Device = Awaited<ReturnType<typeof newDevice>>

/** Uma viagem (a mesma em todos os aparelhos, pelo id fixo) com um gasto. */
async function addExpense(device: Device, description: string) {
  if (!(await device.db.trips.get('v'))) {
    await device.db.trips.add({
      id: 'v', name: 'Orlando', destination: '', startDate: '2026-12-20', endDate: '2026-12-29', currencies: ['USD'], groups: [],
      archived: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    })
  }
  const category = (await device.db.categories.toArray()).find((c) => !c.parentId)!
  return device.repo.saveExpense({
    tripId: 'v', date: '2026-12-21', description, categoryId: category.id, subcategoryId: null, methodId: '', currency: 'BRL', amount: 1000,
  })
}

const descriptions = async (device: Device) => (await device.db.expenses.toArray()).map((e) => e.description).sort()

// JPEG mínimo de mentira: só importa que vá e volte igual.
const PHOTO = 'data:image/jpeg;base64,' + btoa('foto do recibo')

describe('sincronização entre aparelhos', () => {
  beforeEach(() => {
    cloud.text = null
    cloud.version = 0
    cloud.photos = new Map()
    cloud.expired = false
    cloud.reauth = []
    cloud.loginFails = false
    sessionStorage.clear()
  })

  it('primeiro aparelho (dono) cria o arquivo na nuvem com os dados dele', async () => {
    const a = await newDevice()
    await addExpense(a, 'mercado')
    await a.connect('dono')

    expect(a.engine.getSyncState().status).toBe('ok')
    expect(cloud.text).toContain('mercado')
  })

  it('segundo aparelho, sem viagens, adota os dados da nuvem e termina sincronizado', async () => {
    const a = await newDevice()
    await addExpense(a, 'mercado')
    await a.connect('dono')

    const b = await newDevice()
    await b.connect('dono')

    expect(b.engine.getSyncState().status).toBe('ok')
    expect(await descriptions(b)).toEqual(['mercado'])
    // Adota também as categorias da nuvem, sem duplicar com os cadastros iniciais do aparelho.
    expect(await b.db.categories.count()).toBe(await a.db.categories.count())
  })

  it('gasto feito depois de conectar chega à nuvem e ao outro aparelho', async () => {
    const a = await newDevice()
    await addExpense(a, 'mercado')
    await a.connect('dono')
    const b = await newDevice()
    await b.connect('convidado')

    await addExpense(b, 'farmácia')
    await b.engine.syncNow()
    expect(cloud.text).toContain('farmácia')

    // "a" foi recarregado ao criar "b"; reabrir o aparelho A é conectar de novo um banco que já tem os dados.
    const again = await newDevice()
    await again.connect('dono')
    expect(await descriptions(again)).toEqual(['farmácia', 'mercado'])
  })

  it('exclusão em um aparelho remove o gasto da nuvem', async () => {
    const a = await newDevice()
    const id = await addExpense(a, 'mercado')
    await a.connect('dono')
    await a.repo.deleteExpense(id)
    await a.engine.syncNow()

    const b = await newDevice()
    await b.connect('convidado')
    expect(await descriptions(b)).toEqual([])
  })

  it('fotos: sobem como arquivo à parte, chegam sem imagem e são baixadas ao abrir', async () => {
    const a = await newDevice()
    const expenseId = await addExpense(a, 'jantar')
    const receiptId = await a.repo.addReceipt({ expenseId, tripId: 'v', dataUrl: PHOTO, width: 10, height: 10 })
    await a.connect('dono')

    // O arquivo de dados leva o comprovante, mas não a imagem; a foto vai como arquivo próprio.
    expect(cloud.text).toContain(receiptId)
    expect(cloud.text).not.toContain(PHOTO.split(',')[1])
    expect(cloud.photos.has(receiptId)).toBe(true)

    const b = await newDevice()
    await b.connect('convidado')
    expect((await b.db.receipts.get(receiptId))?.dataUrl).toBe('')
    expect(await b.engine.fetchPhoto(receiptId)).toBe(PHOTO)
    expect((await b.db.receipts.get(receiptId))?.dataUrl).toBe(PHOTO)

    // A foto baixada não sobe de novo, e a próxima sincronização não a apaga do aparelho.
    cloud.photos.delete(receiptId)
    await b.engine.syncNow()
    expect(cloud.photos.has(receiptId)).toBe(false)
    expect((await b.db.receipts.get(receiptId))?.dataUrl).toBe(PHOTO)

    // Excluir o gasto apaga a foto da nuvem também.
    cloud.photos.set(receiptId, new Blob(['x']))
    await b.repo.deleteExpense(expenseId)
    await b.engine.syncNow()
    expect(cloud.photos.has(receiptId)).toBe(false)
  })

  it('acesso vencido: ao abrir, tenta renovar sem tela uma única vez; depois fica o aviso', async () => {
    const a = await newDevice()
    await a.connect('dono')
    cloud.expired = true
    // Reabrir o mesmo aparelho: banco novo nos testes, então leva junto o que estava guardado.
    const reopen = async (from: Device) => {
      const saved = await from.db.local.toArray()
      const device = await newDevice()
      await device.db.local.bulkPut(saved)
      await device.engine.initSync()
      await settle(device.engine)
      return device
    }

    // Ao abrir, a 1ª sincronização falha e o app vai sozinho à Microsoft, sem tela de login.
    const again = await reopen(a)
    await vi.waitFor(() => expect(cloud.reauth).toEqual([{ silentOnly: true }]))
    expect((await again.db.local.get('syncPending'))?.value).toMatchObject({ mode: 'dono', auto: true })

    // A Microsoft pediu senha e voltou sem conta: fica o aviso, sem nova tentativa automática.
    cloud.loginFails = true
    const back = await reopen(again)
    await settle(back.engine)
    expect(back.engine.getSyncState().status).toBe('reconectar')
    expect(cloud.reauth).toHaveLength(1)

    // Tocar em "Entrar de novo" vai à Microsoft com a conta indicada, podendo mostrar a tela.
    await back.engine.reconnect()
    expect(cloud.reauth.at(-1)).toEqual({ silentOnly: false })
  })

  it('aparelho com viagens conectando a uma nuvem com dados pede escolha, sem misturar', async () => {
    const a = await newDevice()
    await addExpense(a, 'da nuvem')
    await a.connect('dono')

    const b = await newDevice()
    await addExpense(b, 'do aparelho')
    await b.connect('dono')
    expect(b.engine.getSyncState().status).toBe('escolher')
    expect(await descriptions(b)).toEqual(['do aparelho'])

    await b.engine.choose('nuvem')
    await settle(b.engine)
    expect(b.engine.getSyncState().status).toBe('ok')
    expect(await descriptions(b)).toEqual(['da nuvem'])
  })
})
