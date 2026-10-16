import { describe, expect, it } from 'vitest'
import { needsReconnect } from './onedrive'

const msal = (name: string, errorCode: string) => Object.assign(new Error(errorCode), { name, errorCode })

describe('needsReconnect', () => {
  it('Microsoft pedindo login: entrar de novo', () => {
    expect(needsReconnect(msal('InteractionRequiredAuthError', 'login_required'), true)).toBe(true)
  })

  it('janela oculta de renovação que não respondeu (timed_out): entrar de novo', () => {
    expect(needsReconnect(msal('BrowserAuthError', 'timed_out'), true)).toBe(true)
    expect(needsReconnect(msal('BrowserAuthError', 'block_iframe_reload'), true)).toBe(true)
  })

  it('sem internet não é caso de login: espera a conexão voltar', () => {
    expect(needsReconnect(msal('BrowserAuthError', 'timed_out'), false)).toBe(false)
  })

  it('outros erros seguem como erro', () => {
    expect(needsReconnect(msal('BrowserAuthError', 'popup_window_error'), true)).toBe(false)
    expect(needsReconnect(new TypeError('Failed to fetch'), true)).toBe(false)
  })
})
