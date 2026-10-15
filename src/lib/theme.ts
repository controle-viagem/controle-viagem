import { useSyncExternalStore } from 'react'

/** 'auto' segue o aparelho. A preferência é de cada aparelho e não sincroniza. */
export type ThemePref = 'auto' | 'claro' | 'escuro'
export type Theme = 'light' | 'dark'

// A mesma chave e a mesma regra estão no trecho inicial de index.html, que aplica o tema antes de a tela aparecer.
const KEY = 'tema'
// Cor da barra do sistema no celular: acompanha o fundo da página em cada tema.
const BAR_COLOR: Record<Theme, string> = { light: '#f8fafc', dark: '#0b1120' }

// Uma única consulta, guardada: é nela que fica o aviso de troca de tema do aparelho.
let query: MediaQueryList | undefined
const media = () => (query ??= window.matchMedia('(prefers-color-scheme: dark)'))
const listeners = new Set<() => void>()

export function getThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'claro' || stored === 'escuro' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function resolveTheme(pref: ThemePref = getThemePref()): Theme {
  if (pref === 'auto') return media().matches ? 'dark' : 'light'
  return pref === 'escuro' ? 'dark' : 'light'
}

function apply() {
  const theme = resolveTheme()
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme])
  listeners.forEach((listener) => listener())
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // sem armazenamento: a escolha vale só até fechar o app
  }
  apply()
}

/** Liga o tema ao aparelho: reaplica quando o sistema troca entre claro e escuro. */
export function initTheme() {
  apply()
  media().addEventListener('change', apply)
  // Se o aparelho trocou de tema com o app suspenso (troca programada por horário), o aviso pode
  // não chegar; conferir de novo ao voltar para o app cobre esse caso.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tema em uso agora, para o que precisa de cores em código (gráficos). */
export const useTheme = () => useSyncExternalStore(subscribe, () => resolveTheme())
export const useThemePref = () => useSyncExternalStore(subscribe, getThemePref)
