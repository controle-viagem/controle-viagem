import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AparenciaPage } from './features/ajustes/AparenciaPage'
import { ArquivadosPage } from './features/ajustes/ArquivadosPage'
import { BackupPage } from './features/ajustes/BackupPage'
import { CategoriasPage } from './features/ajustes/CategoriasPage'
import { MaisPage } from './features/ajustes/MaisPage'
import { MeiosPage } from './features/ajustes/MeiosPage'
import { AcertosPage } from './features/acertos/AcertosPage'
import { CalculadoraPage } from './features/calculadora/CalculadoraPage'
import { CarteirasPage } from './features/carteiras/CarteirasPage'
import { InicioPage } from './features/inicio/InicioPage'
import { LancamentosPage } from './features/lancamentos/LancamentosPage'
import { ViagensPage } from './features/viagens/ViagensPage'

// Gráficos e PDF pesam: as telas de relatórios só carregam quando são abertas.
const RelatoriosPage = lazy(() => import('./features/relatorios/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })))
const PrestacaoPage = lazy(() => import('./features/relatorios/PrestacaoPage').then((m) => ({ default: m.PrestacaoPage })))
const loading = <p className="p-8 text-center text-sm text-slate-500">Carregando…</p>

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<InicioPage />} />
          <Route path="lancamentos" element={<LancamentosPage />} />
          <Route path="acertos" element={<AcertosPage />} />
          <Route path="relatorios" element={<Suspense fallback={loading}><RelatoriosPage /></Suspense>} />
          <Route path="relatorios/prestacao" element={<Suspense fallback={loading}><PrestacaoPage /></Suspense>} />
          <Route path="calculadora" element={<CalculadoraPage />} />
          <Route path="carteiras" element={<CarteirasPage />} />
          <Route path="viagens" element={<ViagensPage />} />
          <Route path="mais" element={<MaisPage />} />
          <Route path="mais/meios" element={<MeiosPage />} />
          <Route path="mais/categorias" element={<CategoriasPage />} />
          <Route path="mais/arquivados" element={<ArquivadosPage />} />
          <Route path="mais/aparencia" element={<AparenciaPage />} />
          <Route path="mais/backup" element={<BackupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
