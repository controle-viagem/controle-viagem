import { Users } from 'lucide-react'
import { currencyName } from '../domain/moeda'
import { accentStyle, currencyAccent, initials, personAccent } from './valueStyle'

/** Selo com o código da moeda (USD, EUR…), cada moeda com a sua cor. */
export function CurrencyBadge({ code }: { code: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1 py-px text-[10px] font-bold leading-tight tracking-wide"
      style={accentStyle(currencyAccent(code))}
      title={currencyName(code)}
    >
      {code}
    </span>
  )
}

interface AvatarProps {
  id: string
  name: string
  size?: 'sm' | 'md'
  /** Grupo: mostra o ícone de pessoas no lugar das iniciais. */
  group?: boolean
}

/** Bolinha com as iniciais da pessoa, na cor dela. */
export function Avatar({ id, name, size = 'md', group }: AvatarProps) {
  const box = size === 'md' ? 'h-9 w-9 text-xs' : 'h-6 w-6 text-[10px]'
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${box}`}
      style={accentStyle(personAccent(id))}
      aria-hidden
    >
      {group ? <Users size={size === 'md' ? 16 : 12} /> : initials(name)}
    </span>
  )
}
