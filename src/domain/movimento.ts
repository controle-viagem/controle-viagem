import type { WalletMove } from '../db/types'

export type MoveDraft = Pick<
  WalletMove,
  'kind' | 'walletId' | 'currency' | 'amount' | 'brlAmount' | 'toCurrency' | 'toAmount' | 'toWalletId' | 'fee'
>

/** Problema que impede salvar o movimento, em linguagem do usuário; null quando está tudo certo. */
export function moveError(d: MoveDraft): string | null {
  if (!d.walletId) return 'Escolha a carteira.'
  if (!d.currency || d.currency === 'BRL') return 'Escolha a moeda estrangeira. Reais ficam nos meios "Em reais".'
  if (d.kind === 'ajuste' ? d.amount === 0 : !(d.amount > 0)) return 'Informe o valor.'
  switch (d.kind) {
    case 'carga':
      return d.brlAmount && d.brlAmount > 0 ? null : 'Informe o total pago em reais.'
    case 'venda':
      return d.brlAmount && d.brlAmount > 0 ? null : 'Informe quanto recebeu em reais.'
    case 'conversao':
      if (!d.toCurrency || d.toCurrency === 'BRL' || d.toCurrency === d.currency) {
        return 'Escolha a moeda recebida, diferente da que sai. Para voltar a reais, use a venda da sobra.'
      }
      return d.toAmount && d.toAmount > 0 ? null : 'Informe o valor recebido.'
    case 'transferencia':
      if (!d.toWalletId) return 'Escolha a carteira de destino.'
      return d.toWalletId === d.walletId ? 'A carteira de destino precisa ser outra.' : null
    case 'ajuste':
      return null
  }
}
