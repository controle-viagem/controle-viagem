import { describe, expect, it } from 'vitest'
import { holderLabel, methodsFor, walletsOf } from './titular'

const wallets = [
  { id: 'wise', holderName: undefined },
  { id: 'especie', holderName: '' },
  { id: 'wise-ana', holderName: 'Ana Paula' },
  { id: 'nomad-bia', holderName: 'Bia' },
]

describe('titular da carteira', () => {
  it('minhas carteiras são as sem titular', () => {
    expect(walletsOf({ id: 'eu', name: 'Guilherme' }, wallets).map((w) => w.id)).toEqual(['wise', 'especie'])
  })

  it('as do par pelo nome, sem diferenciar maiúsculas e acentos', () => {
    expect(walletsOf({ id: 'p1', name: 'ana paula' }, wallets).map((w) => w.id)).toEqual(['wise-ana'])
    expect(walletsOf({ id: 'p2', name: 'Léo' }, wallets)).toEqual([])
  })

  it('meios da pessoa que servem na moeda do gasto', () => {
    const methods = [
      { id: 'wise-ana', holderName: 'Ana', kind: 'carteira' as const },
      { id: 'itau-ana', holderName: 'Ana', kind: 'cartao_brl' as const },
      { id: 'pix-ana', holderName: 'Ana', kind: 'brl' as const },
      { id: 'meu-pix', holderName: undefined, kind: 'brl' as const },
    ]
    const ana = { id: 'p1', name: 'Ana' }
    expect(methodsFor(ana, methods, 'USD').map((m) => m.id)).toEqual(['wise-ana', 'itau-ana'])
    expect(methodsFor(ana, methods, 'BRL').map((m) => m.id)).toEqual(['itau-ana', 'pix-ana'])
    expect(methodsFor({ id: 'p2', name: 'Léo' }, methods, 'USD')).toEqual([])
  })

  it('rótulo do titular', () => {
    expect(holderLabel(wallets[0])).toBe('Eu')
    expect(holderLabel(wallets[3])).toBe('Bia')
  })
})
