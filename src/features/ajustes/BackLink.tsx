import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function BackLink({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link to="/mais" className="btn btn-ghost !p-2" aria-label="Voltar">
        <ChevronLeft size={20} />
      </Link>
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
  )
}
