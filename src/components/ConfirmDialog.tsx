import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

export interface ConfirmOption<T extends string> {
  value: T
  label: string
  hint?: string
}

interface Props<T extends string> {
  title: string
  message?: ReactNode
  /** Escolhas de alcance (ex.: só esta, esta e as próximas, todas). Sem elas, é uma confirmação simples. */
  options?: ConfirmOption<T>[]
  /** Escolha que já vem marcada: sempre a de menor alcance. */
  defaultValue?: T
  confirmLabel: string
  danger?: boolean
  onConfirm: (value: T | undefined) => void
  onClose: () => void
}

/** Confirmação dentro do app, no lugar da caixa do navegador, com escolha de alcance quando houver. */
export function ConfirmDialog<T extends string>({
  title, message, options, defaultValue, confirmLabel, danger, onConfirm, onClose,
}: Props<T>) {
  const [value, setValue] = useState<T | undefined>(defaultValue ?? options?.[0]?.value)

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {message && <div className="text-sm text-slate-600">{message}</div>}
        {options && (
          <div className="space-y-2" role="radiogroup">
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  value === option.value ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="alcance"
                  className="mt-1 accent-slate-900"
                  checked={value === option.value}
                  onChange={() => setValue(option.value)}
                />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  {option.hint && <span className="block text-xs text-slate-500">{option.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className={`btn ml-auto flex-1 sm:flex-none ${danger ? 'bg-rose-600 text-white hover:bg-rose-700' : 'btn-primary'}`}
            onClick={() => onConfirm(value)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
