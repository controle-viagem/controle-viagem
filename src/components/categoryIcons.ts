import {
  Baby, Banknote, Beer, BedDouble, Bike, Bus, Camera, Car, CarTaxiFront, Coffee, Coins, CreditCard, Ellipsis,
  FerrisWheel, FileText, Fuel, Gift, Globe, HeartPulse, Hotel, Landmark, Luggage, Map, MapPin, Mountain, Music,
  Pill, Pizza, Plane, Receipt, Sandwich, Shield, Ship, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles,
  SquareParking, Stamp, Tag, Tent, Ticket, TrainFront, Utensils, Wallet, Wine, Wifi, type LucideIcon,
} from 'lucide-react'
import { PALETTE } from '../db/seed'
import type { Category } from '../db/types'

/** Ícones que uma categoria pode usar. A chave é o que fica gravado no cadastro. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  aviao: Plane, carro: Car, taxi: CarTaxiFront, trem: TrainFront, onibus: Bus, navio: Ship, bicicleta: Bike,
  combustivel: Fuel, estacionamento: SquareParking, mapa: Map, local: MapPin, mundo: Globe, mala: Luggage,
  hotel: Hotel, cama: BedDouble, camping: Tent,
  refeicao: Utensils, pizza: Pizza, lanche: Sandwich, cafe: Coffee, bar: Beer, vinho: Wine, mercado: ShoppingCart,
  ingresso: Ticket, parque: FerrisWheel, montanha: Mountain, foto: Camera, musica: Music, brilho: Sparkles,
  sacola: ShoppingBag, roupa: Shirt, presente: Gift, bebe: Baby,
  saude: HeartPulse, remedio: Pill, seguro: Shield, documento: FileText, carimbo: Stamp, taxa: Landmark,
  celular: Smartphone, internet: Wifi,
  dinheiro: Banknote, moedas: Coins, carteira: Wallet, cartao: CreditCard, recibo: Receipt,
  etiqueta: Tag, outros: Ellipsis,
}

/** Cores oferecidas na edição: a paleta original mais tons mais fechados. */
export const CATEGORY_COLORS = [...PALETTE, '#0891b2', '#7c3aed', '#db2777', '#059669', '#d97706', '#475569']

// Ícone sugerido pelo nome, para categorias que ainda não tiveram um escolhido. A primeira que casar vence.
const BY_NAME: [RegExp, string][] = [
  [/aere|aviao|voo|passag/, 'aviao'], [/uber|taxi/, 'taxi'], [/trem|metro/, 'trem'], [/onibus|transfer/, 'onibus'],
  [/barco|navio|cruzeiro|balsa/, 'navio'], [/combust|gasolina/, 'combustivel'], [/estacion|parking/, 'estacionamento'],
  [/pedag/, 'recibo'], [/aluguel de carro|locadora|carro|transp/, 'carro'], [/hotel|hosped|airbnb/, 'hotel'],
  [/camping/, 'camping'], [/mercado/, 'mercado'], [/cafe|lanche/, 'cafe'], [/bar\b|bebida|cerveja/, 'bar'],
  [/vinho/, 'vinho'], [/restaur|aliment|refei|comida/, 'refeicao'], [/ingresso|show/, 'ingresso'],
  [/parque/, 'parque'], [/tour|passeio|excurs/, 'mapa'], [/roupa/, 'roupa'], [/eletron|celular|chip|esim|comunic/, 'celular'],
  [/presente|lembranc|souvenir/, 'presente'], [/compra/, 'sacola'], [/seguro/, 'seguro'], [/farmac|remed/, 'remedio'],
  [/saude|medic/, 'saude'], [/passaporte|visto|esta\b/, 'carimbo'], [/documento/, 'documento'], [/taxa|imposto/, 'taxa'],
  [/internet|wifi/, 'internet'], [/cambio|dinheiro|saque/, 'dinheiro'], [/outr/, 'outros'],
]

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Chave do ícone sugerido para um nome, ou undefined se nenhum combina. */
export const iconKeyByName = (name: string) => BY_NAME.find(([pattern]) => pattern.test(plain(name)))?.[1]

/**
 * Chave do ícone a mostrar: o escolhido na categoria; senão o da categoria-mãe (subcategoria herda);
 * senão um sugerido pelo nome; senão a etiqueta.
 */
export function iconKeyFor(category: Pick<Category, 'icon' | 'name'>, parent?: Pick<Category, 'icon' | 'name'>) {
  const chosen = category.icon ?? parent?.icon
  if (chosen && CATEGORY_ICONS[chosen]) return chosen
  return iconKeyByName(category.name) ?? (parent && iconKeyByName(parent.name)) ?? 'etiqueta'
}
