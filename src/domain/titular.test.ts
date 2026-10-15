import { describe, expect, it } from 'vitest'
import { holderLabel, walletsOf } from './titular'

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

  it('rótulo do titular', () => {
    expect(holderLabel(wallets[0])).toBe('Eu')
    expect(holderLabel(wallets[3])).toBe('Bia')
  })
})
