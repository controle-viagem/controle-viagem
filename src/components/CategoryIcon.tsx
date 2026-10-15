import type { Category } from '../db/types'
import { CATEGORY_ICONS, iconKeyFor } from './categoryIcons'

interface Props {
  /** Categoria (ou subcategoria) a representar; sem ela, mostra um marcador neutro. */
  category?: Category
  /** Categoria-mãe, quando `category` é uma subcategoria: ela herda o ícone se não tiver o seu. */
  parent?: Category
  size?: 'sm' | 'md'
}

const NEUTRAL = '#94a3b8'

/** Quadradinho com o ícone da categoria, tingido com a cor dela. */
export function CategoryIcon({ category, parent, size = 'md' }: Props) {
  const color = category?.color ?? NEUTRAL
  const Icon = category ? CATEGORY_ICONS[iconKeyFor(category, parent)] : CATEGORY_ICONS.etiqueta
  const box = size === 'md' ? 'h-8 w-8 rounded-lg' : 'h-6 w-6 rounded-md'
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${box}`}
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      aria-hidden
    >
      <Icon size={size === 'md' ? 16 : 13} />
    </span>
  )
}
