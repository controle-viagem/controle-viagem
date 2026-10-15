import { ME, type Category, type MethodKind, type PaymentMethod, type Person } from './types'

export const PALETTE = [
  '#0ea5e9', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308',
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f43f5e', '#64748b',
]

/** Categorias de viagem: [nome, ícone, subcategorias]. */
const CATEGORIES: [string, string, string[]][] = [
  ['Transporte', 'carro', ['Aéreo', 'Uber e táxi', 'Trem e metrô', 'Aluguel de carro', 'Combustível', 'Estacionamento', 'Pedágio']],
  ['Hospedagem', 'hotel', []],
  ['Alimentação', 'refeicao', ['Restaurante', 'Mercado', 'Café e lanche']],
  ['Passeios', 'ingresso', ['Ingressos', 'Tours', 'Parques']],
  ['Compras', 'sacola', ['Roupas', 'Eletrônicos', 'Presentes']],
  ['Saúde e seguro', 'seguro', ['Seguro viagem', 'Farmácia']],
  ['Documentos e taxas', 'documento', ['Passaporte e visto', 'Taxa de turismo']],
  ['Comunicação', 'celular', []],
  ['Outros', 'outros', []],
]

const METHODS: [string, MethodKind, number?, number?][] = [
  ['Pix', 'brl'],
  ['Dinheiro (R$)', 'brl'],
  // IOF e spread são sugestões: o dono confere a alíquota vigente e o spread do banco no cadastro.
  ['Cartão de crédito', 'cartao_brl', 3.5, 4],
]

export function seedCategories(): Category[] {
  const now = new Date().toISOString()
  const out: Category[] = []
  CATEGORIES.forEach(([name, icon, subs], i) => {
    const color = PALETTE[i % PALETTE.length]
    const parent: Category = {
      id: crypto.randomUUID(), name, parentId: null, color, icon, archived: false, createdAt: now, updatedAt: now,
    }
    out.push(parent)
    for (const sub of subs) {
      out.push({ id: crypto.randomUUID(), name: sub, parentId: parent.id, color, archived: false, createdAt: now, updatedAt: now })
    }
  })
  return out
}

export function seedMethods(): PaymentMethod[] {
  const now = new Date().toISOString()
  return METHODS.map(([name, kind, iofPct, spreadPct]) => ({
    id: crypto.randomUUID(), name, kind, iofPct, spreadPct, archived: false, createdAt: now, updatedAt: now,
  }))
}

/** A pessoa "Eu", com id fixo: o nome pode ser trocado em Pessoas. */
export function seedMe(): Person {
  const now = new Date().toISOString()
  return { id: ME, name: 'Eu', createdAt: now, updatedAt: now }
}
