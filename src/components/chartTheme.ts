import type { Theme } from '../lib/theme'

/** Cores que os gráficos precisam em código (o Recharts não lê as classes do Tailwind). */
export interface ChartTheme {
  /** Cor da série única (gasto por dia, por pessoa). */
  series: string
  grid: string
  axis: string
  tick: string
  /** Realce da coluna sob o cursor. */
  cursor: string
  tooltip: { background: string; border: string; color: string }
}

/**
 * A cor da série foi validada (faixa de luminosidade, saturação e contraste ≥ 3:1) contra o fundo do cartão de cada
 * tema: #2a78d6 sobre branco e #3987e5 sobre o cartão escuro (#172033). Não troque sem validar de novo.
 */
export const CHART_THEME: Record<Theme, ChartTheme> = {
  light: {
    series: '#2a78d6',
    grid: '#e2e8f0',
    axis: '#cbd5e1',
    tick: '#64748b',
    cursor: '#f1f5f9',
    tooltip: { background: '#ffffff', border: '#e2e8f0', color: '#0f172a' },
  },
  dark: {
    series: '#3987e5',
    grid: '#27344d',
    axis: '#3a4762',
    tick: '#94a3b8',
    cursor: '#1c2740',
    tooltip: { background: '#172033', border: '#3a4762', color: '#f1f5f9' },
  },
}
