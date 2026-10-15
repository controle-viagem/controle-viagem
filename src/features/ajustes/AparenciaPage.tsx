import { Moon, Smartphone, Sun } from 'lucide-react'
import { setThemePref, useTheme, useThemePref, type ThemePref } from '../../lib/theme'
import { BackLink } from './BackLink'

const OPTIONS: { value: ThemePref; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'auto', label: 'Automático', hint: 'Segue o modo claro ou escuro do aparelho', icon: Smartphone },
  { value: 'claro', label: 'Claro', hint: 'Sempre claro neste aparelho', icon: Sun },
  { value: 'escuro', label: 'Escuro', hint: 'Sempre escuro neste aparelho', icon: Moon },
]

export function AparenciaPage() {
  const pref = useThemePref()
  const theme = useTheme()

  return (
    <div className="space-y-4">
      <BackLink title="Aparência" />
      <p className="text-sm text-slate-500">
        A escolha vale só para este aparelho: o celular e o computador podem ficar diferentes.
      </p>

      <div className="space-y-2">
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => (
          <label
            key={value}
            className={`card flex cursor-pointer items-center gap-3 p-4 ${pref === value ? 'border-slate-900' : ''}`}
          >
            <input
              type="radio"
              name="tema"
              className="accent-slate-900"
              checked={pref === value}
              onChange={() => setThemePref(value)}
            />
            <Icon size={20} className="text-slate-500" />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="block text-sm text-slate-500">
                {hint}
                {value === 'auto' && pref === 'auto' && ` (agora: ${theme === 'dark' ? 'escuro' : 'claro'})`}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
