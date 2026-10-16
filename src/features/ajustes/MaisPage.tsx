import { Archive, Calculator, ChartColumn, ChevronRight, Cloud, CreditCard, DatabaseBackup, Luggage, SunMoon, Tags, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'

const READY = [
  { to: '/viagens', label: 'Viagens', hint: 'Cadastrar, abrir e editar viagens', icon: Luggage },
  { to: '/relatorios', label: 'Relatórios (prestação de contas)', hint: 'O PDF e a planilha para mandar aos viajantes', icon: ChartColumn },
  { to: '/calculadora', label: 'Calculadora', hint: 'Preço lá fora em reais, com imposto e gorjeta: carteira ou cartão?', icon: Calculator },
  { to: '/carteiras', label: 'Carteiras', hint: 'Cartão multimoeda e espécie: cargas, saldos e custo médio', icon: WalletCards },
  { to: '/mais/meios', label: 'Meios de pagamento', hint: 'Pix, cartões em reais, carteiras multimoeda', icon: CreditCard },
  { to: '/mais/categorias', label: 'Categorias e subcategorias', hint: 'Transporte, hospedagem, alimentação…', icon: Tags },
  { to: '/mais/arquivados', label: 'Arquivados', hint: 'Restaurar categorias e meios excluídos', icon: Archive },
  { to: '/mais/aparencia', label: 'Aparência', hint: 'Modo claro, escuro ou automático', icon: SunMoon },
  { to: '/mais/sincronizacao', label: 'Sincronização', hint: 'Mesmos dados em todos os aparelhos, pelo OneDrive', icon: Cloud },
  { to: '/mais/backup', label: 'Backup dos dados', hint: 'Salvar em arquivo, restaurar ou apagar tudo', icon: DatabaseBackup },
]

export function MaisPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mais</h1>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {READY.map(({ to, label, hint, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <Icon size={20} className="text-slate-500" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              <span className="block text-xs text-slate-500">{hint}</span>
            </span>
            <ChevronRight size={18} className="text-slate-400" />
          </Link>
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">Controle de Viagem · versão {__APP_VERSION__}</p>
    </div>
  )
}
