import { currencyDigits } from '../domain/moeda'
import { formatMoney } from '../lib/format'

interface Props {
  /** Centésimos da moeda. */
  value: number
  onChange: (cents: number) => void
  /** Código ISO; padrão real. */
  currency?: string
  autoFocus?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

/**
 * Campo de valor: os dígitos entram pela direita, como em maquininha de cartão. Em moedas sem centavos
 * (iene, peso chileno) cada dígito é uma unidade inteira; o valor continua guardado em centésimos.
 */
export function MoneyInput({ value, onChange, currency = 'BRL', autoFocus, className = 'field', id, 'aria-label': ariaLabel }: Props) {
  const whole = currencyDigits(currency) === 0
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className={className}
      inputMode="numeric"
      autoFocus={autoFocus}
      value={formatMoney(value, currency)}
      onChange={(e) => {
        const digits = Number(e.target.value.replace(/\D/g, '').slice(0, whole ? 9 : 11))
        onChange(whole ? digits * 100 : digits)
      }}
    />
  )
}
