import { ArrowLeftRight, Calculator, ChartColumn, House, List, Luggage, Menu, Plus, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppContext, type AppState } from '../app/AppContext'
import { useTrips } from '../app/useTrips'
import type { Expense } from '../db/types'
import { ExpenseForm } from '../features/lancamentos/ExpenseForm'
import { ConfirmDialog } from './ConfirmDialog'

const NAV = [
  { to: '/', label: 'Início', icon: House },
  { to: '/lancamentos', label: 'Gastos', icon: List },
  { to: '/acertos', label: 'Acertos', icon: ArrowLeftRight },
  { to: '/relatorios', label: 'Relatórios', icon: ChartColumn },
  { to: '/carteiras', label: 'Carteiras', icon: WalletCards },
  { to: '/calculadora', label: 'Calculadora', icon: Calculator },
  { to: '/viagens', label: 'Viagens', icon: Luggage },
  { to: '/mais', label: 'Mais', icon: Menu },
]
// No celular a barra inferior tem dois itens de cada lado do botão de novo gasto, para ele ficar no centro:
// Início, Gastos, +, Acertos, Mais. Carteiras, Calculadora e Viagens ficam no Mais e nos atalhos do Início.
const MOBILE_NAV = NAV.filter((item) => ['/', '/lancamentos', '/acertos', '/mais'].includes(item.to))

function MobileItem({ to, label, icon: Icon }: (typeof NAV)[number]) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
          isActive ? 'text-slate-900' : 'text-slate-400'
        }`
      }
    >
      <Icon size={20} />
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
  )
}

export function Layout() {
  const { active } = useTrips()
  const [form, setForm] = useState<{ expense?: Expense } | null>(null)
  const state = useMemo<AppState>(() => ({ trip: active, openForm: (expense) => setForm({ expense }) }), [active])
  const [closedNotice, setClosedNotice] = useState(false)
  // Sem viagem cadastrada, o "+" leva ao cadastro de viagem; com a viagem encerrada, avisa em vez de abrir o formulário.
  const add = () => (!active ? (location.hash = '#/viagens?nova=1') : active.closed ? setClosedNotice(true) : setForm({}))

  return (
    <AppContext.Provider value={state}>
      <div className="mx-auto flex min-h-dvh max-w-5xl">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:flex">
          <div className="mb-4 px-2 text-lg font-bold">Controle de Viagem</div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <button className="btn btn-primary mt-4" onClick={add}>
            <Plus size={18} /> Novo gasto
          </button>
          {active && <p className="mt-auto truncate px-2 text-xs text-slate-500">Viagem aberta: {active.name}</p>}
        </aside>

        <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_NAV.slice(0, 2).map((item) => (
          <MobileItem key={item.to} {...item} />
        ))}
        {/* O "+" mora na barra, no centro, para nunca cobrir o conteúdo que rola. */}
        <div className="flex flex-1 items-center justify-center">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-md"
            onClick={add}
            aria-label="Novo gasto"
          >
            <Plus size={24} />
          </button>
        </div>
        {MOBILE_NAV.slice(2).map((item) => (
          <MobileItem key={item.to} {...item} />
        ))}
      </nav>

      {form && active && <ExpenseForm trip={active} expense={form.expense} onClose={() => setForm(null)} />}
      {closedNotice && active && (
        <ConfirmDialog
          title="Viagem encerrada"
          message={<>A viagem <strong>{active.name}</strong> foi encerrada e não recebe gastos novos. Reabra a viagem ou abra outra em Viagens.</>}
          confirmLabel="Ver viagens"
          onConfirm={() => {
            setClosedNotice(false)
            location.hash = '#/viagens'
          }}
          onClose={() => setClosedNotice(false)}
        />
      )}
    </AppContext.Provider>
  )
}
