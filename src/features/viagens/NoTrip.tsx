import { Luggage, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Primeira abertura do app: sem viagem, não há onde lançar gastos. */
export function NoTrip() {
  return (
    <div className="card mx-auto mt-8 max-w-md space-y-3 p-6 text-center">
      <Luggage size={40} className="mx-auto text-slate-400" />
      <h1 className="text-lg font-bold">Bem-vindo ao Controle de Viagem</h1>
      <p className="text-sm text-slate-500">
        Cadastre sua viagem com as datas e as moedas que vai usar. Depois é só lançar os gastos — em reais ou na moeda
        de lá.
      </p>
      <Link to="/viagens?nova=1" className="btn btn-primary">
        <Plus size={18} /> Cadastrar viagem
      </Link>
    </div>
  )
}
