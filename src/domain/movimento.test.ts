import { describe, expect, it } from 'vitest'
import { moveError, type MoveDraft } from './movimento'

const carga: MoveDraft = { kind: 'carga', walletId: 'wise', currency: 'USD', amount: 100000, brlAmount: 570000 }

describe('movimento de carteira', () => {
  it('carga precisa de carteira, moeda estrangeira, valor e total pago', () => {
    expect(moveError(carga)).toBeNull()
    expect(moveError({ ...carga, walletId: '' })).toMatch(/carteira/)
    expect(moveError({ ...carga, currency: 'BRL' })).toMatch(/moeda estrangeira/)
    expect(moveError({ ...carga, amount: 0 })).toMatch(/valor/)
    expect(moveError({ ...carga, brlAmount: undefined })).toMatch(/total pago/)
  })

  it('conversão para outra moeda, com valor recebido', () => {
    const conv: MoveDraft = { ...carga, kind: 'conversao', brlAmount: undefined, toCurrency: 'EUR', toAmount: 9000 }
    expect(moveError(conv)).toBeNull()
    expect(moveError({ ...conv, toCurrency: 'USD' })).toMatch(/diferente/)
    expect(moveError({ ...conv, toCurrency: 'BRL' })).toMatch(/venda da sobra/)
    expect(moveError({ ...conv, toAmount: 0 })).toMatch(/valor recebido/)
  })

  it('transferência para outra carteira; ajuste aceita valor negativo; venda pede o recebido', () => {
    const tr: MoveDraft = { ...carga, kind: 'transferencia', brlAmount: undefined, toWalletId: 'especie' }
    expect(moveError(tr)).toBeNull()
    expect(moveError({ ...tr, toWalletId: '' })).toMatch(/destino/)
    expect(moveError({ ...tr, toWalletId: 'wise' })).toMatch(/outra/)
    expect(moveError({ ...carga, kind: 'ajuste', amount: -500, brlAmount: undefined })).toBeNull()
    expect(moveError({ ...carga, kind: 'ajuste', amount: 0 })).toMatch(/valor/)
    expect(moveError({ ...carga, kind: 'venda', brlAmount: 0 })).toMatch(/recebeu/)
  })
})
