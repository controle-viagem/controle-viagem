import { useLiveQuery } from 'dexie-react-hooks'
import { Banknote, CreditCard, Plus, Trash2, Wallet, WalletCards } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { db } from '../../db/db'
import { removeMethod, saveMethod } from '../../db/repo'
import { METHOD_KIND_LABEL, WALLET_TYPE_LABEL, type MethodKind, type PaymentMethod, type WalletType } from '../../db/types'
import { decimalText, parseDecimal } from '../../domain/moeda'
import { BackLink } from './BackLink'

const KINDS: MethodKind[] = ['brl', 'cartao_brl', 'carteira']
const WALLET_TYPES: WalletType[] = ['multimoeda', 'especie']

const KIND_HINT: Record<MethodKind, string> = {
  brl: 'Só paga em reais: Pix, débito, conta ou dinheiro em reais.',
  cartao_brl:
    'Cartão de crédito ou débito que cobra em reais as compras feitas em outra moeda. O IOF e o spread daqui são sugeridos em cada compra e podem ser ajustados nela.',
  carteira:
    'Cartão multimoeda (Wise, Nomad…) ou dinheiro em espécie, com saldo em cada moeda. Cargas, saques e conversões ficam em Carteiras; o custo em reais de cada gasto sai do custo médio.',
}

/** Ícone do meio de pagamento nas listas. */
export function MethodIcon({ method, size = 18 }: { method: PaymentMethod; size?: number }) {
  const Icon =
    method.kind === 'brl' ? Wallet : method.kind === 'cartao_brl' ? CreditCard : method.walletType === 'especie' ? Banknote : WalletCards
  return <Icon size={size} className="shrink-0 text-slate-400" />
}

interface FormProps {
  method?: PaymentMethod
  /** Tipo já marcado num cadastro novo (ex.: a tela Carteiras abre já como carteira). */
  initialKind?: MethodKind
  onClose: () => void
}

export function MethodForm({ method, initialKind = 'cartao_brl', onClose }: FormProps) {
  const [name, setName] = useState(method?.name ?? '')
  const [kind, setKind] = useState<MethodKind>(method?.kind ?? initialKind)
  const [walletType, setWalletType] = useState<WalletType>(method?.walletType ?? 'multimoeda')
  const [holder, setHolder] = useState(method?.holderName ?? '')
  const [othersWallet, setOthersWallet] = useState(!!method?.holderName)
  const [iof, setIof] = useState(decimalText(method?.iofPct ?? 3.5))
  const [spread, setSpread] = useState(decimalText(method?.spreadPct ?? 4))
  // Carteira: spread e IOF de uma carga nova (opcionais), para a calculadora simular e para sugerir na carga.
  const [loadSpread, setLoadSpread] = useState(method?.kind === 'carteira' ? decimalText(method.spreadPct) : '')
  const [loadIof, setLoadIof] = useState(method?.kind === 'carteira' ? decimalText(method.iofPct) : '')
  const [error, setError] = useState('')
  const card = kind === 'cartao_brl'
  const multicurrency = kind === 'carteira' && walletType === 'multimoeda'
  // Carteira não vira outro tipo nem o contrário: o custo em reais dos gastos já lançados mudaria de regra.
  const kinds = !method ? KINDS : method.kind === 'carteira' ? (['carteira'] as const) : KINDS.filter((k) => k !== 'carteira')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Informe um nome.')
    const iofPct = parseDecimal(iof)
    const spreadPct = parseDecimal(spread)
    if (card && (iofPct === null || spreadPct === null)) return setError('Informe o IOF e o spread em % (pode ser 0).')
    if (othersWallet && !holder.trim()) return setError('Informe o nome do titular (como está no cadastro de viajantes).')
    await saveMethod({
      id: method?.id,
      name: name.trim(),
      kind,
      archived: false,
      // Espécie não tem spread e IOF de carga (o custo vem do saque, da transferência ou da casa de câmbio).
      iofPct: card ? (iofPct ?? 0) : multicurrency ? (parseDecimal(loadIof) ?? undefined) : undefined,
      spreadPct: card ? (spreadPct ?? 0) : multicurrency ? (parseDecimal(loadSpread) ?? undefined) : undefined,
      walletType: kind === 'carteira' ? walletType : undefined,
      holderName: othersWallet && holder.trim() ? holder.trim() : undefined,
    })
    onClose()
  }

  async function remove() {
    if (!method || !confirm(`Excluir "${method.name}"?`)) return
    if ((await removeMethod(method.id)) === 'arquivada') {
      alert('Este meio já tem gastos ou movimentos, então foi arquivado: some das listas, mas o histórico é mantido.')
    }
    onClose()
  }

  return (
    <Modal title={method ? 'Editar meio de pagamento' : 'Novo meio de pagamento'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="mp-nome">Nome</label>
          <input
            id="mp-nome"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={card ? 'Ex.: Itaú Visa Infinite' : kind === 'carteira' ? (walletType === 'especie' ? 'Ex.: Dólares em espécie' : 'Ex.: Wise') : 'Ex.: Pix Nubank'}
            maxLength={40}
            autoFocus={!method}
          />
        </div>
        <div>
          <span className="label">Tipo</span>
          <div className="space-y-2">
            {kinds.map((k) => (
              <label
                key={k}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${kind === k ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
              >
                <input type="radio" name="tipo" className="mt-1 accent-slate-900" checked={kind === k} onChange={() => setKind(k)} />
                <span>
                  <span className="block font-medium">{METHOD_KIND_LABEL[k]}</span>
                  <span className="block text-xs text-slate-500">{KIND_HINT[k]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {kind === 'carteira' && (
          <div>
            <span className="label">Carteira de</span>
            <div className="grid grid-cols-2 gap-2">
              {WALLET_TYPES.map((w) => (
                <label
                  key={w}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm font-medium ${walletType === w ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                >
                  <input type="radio" name="subtipo" className="accent-slate-900" checked={walletType === w} onChange={() => setWalletType(w)} />
                  {WALLET_TYPE_LABEL[w]}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="label">Titular</span>
          <div className="grid grid-cols-2 gap-2">
            {[false, true].map((other) => (
              <label
                key={String(other)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm font-medium ${othersWallet === other ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
              >
                <input type="radio" name="titular" className="accent-slate-900" checked={othersWallet === other} onChange={() => setOthersWallet(other)} />
                {other ? 'Outra pessoa' : 'Eu'}
              </label>
            ))}
          </div>
          {othersWallet && (
            <input className="field mt-2" aria-label="Nome do titular" placeholder="Ex.: Ana" maxLength={40} value={holder} onChange={(e) => setHolder(e.target.value)} />
          )}
          <p className="mt-1 text-xs text-slate-500">
            {othersWallet
              ? kind === 'carteira'
                ? 'Use o mesmo nome do viajante: quando ele pagar um gasto ou um acerto, esta carteira aparece para ele, em qualquer viagem.'
                : 'Use o mesmo nome do viajante: aparece só quando ele pagar um gasto, em qualquer viagem. Não aparece entre os seus meios.'
              : 'Meio seu: aparece quando você paga.'}
          </p>
        </div>

        {multicurrency && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="mp-carga-spread">Spread da carga (%)</label>
              <input id="mp-carga-spread" className="field" inputMode="decimal" placeholder="opcional" value={loadSpread} onChange={(e) => setLoadSpread(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mp-carga-iof">IOF da carga (%)</label>
              <input id="mp-carga-iof" className="field" inputMode="decimal" placeholder="opcional" value={loadIof} onChange={(e) => setLoadIof(e.target.value)} />
            </div>
            <p className="col-span-2 text-xs text-slate-500">
              Quanto custa colocar dinheiro neste cartão, além da cotação do dia. Com os dois preenchidos (pode ser 0), a
              calculadora simula uma carga nova nele; também são sugeridos ao lançar uma carga. O custo médio das cargas já
              feitas não muda.
            </p>
          </div>
        )}

        {card && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="mp-iof">IOF (%)</label>
              <input id="mp-iof" className="field" inputMode="decimal" value={iof} onChange={(e) => setIof(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mp-spread">Spread do banco (%)</label>
              <input id="mp-spread" className="field" inputMode="decimal" value={spread} onChange={(e) => setSpread(e.target.value)} />
            </div>
            <p className="col-span-2 text-xs text-slate-500">
              Confira a alíquota de IOF vigente e o spread na tabela do seu banco. O spread é o acréscimo do banco sobre a
              cotação do dia.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          {method && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button type="submit" className="btn btn-primary ml-auto flex-1 sm:flex-none">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

export function MeiosPage() {
  const [form, setForm] = useState<{ method?: PaymentMethod } | null>(null)
  const methods = (useLiveQuery(() => db.paymentMethods.toArray(), []) ?? [])
    .filter((m) => !m.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const list = (title: string, items: PaymentMethod[], empty: string) => (
    <section>
      <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {items.map((m) => (
          <button key={m.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setForm({ method: m })}>
            <MethodIcon method={m} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{m.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {m.kind === 'cartao_brl'
                  ? `IOF ${decimalText(m.iofPct ?? 0)}% · spread ${decimalText(m.spreadPct ?? 0)}%`
                  : m.kind === 'carteira'
                    ? WALLET_TYPE_LABEL[m.walletType ?? 'multimoeda']
                    : METHOD_KIND_LABEL[m.kind]}
                {m.holderName ? ` · titular ${m.holderName}` : ''}
              </span>
            </span>
          </button>
        ))}
        {items.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{empty}</p>}
      </div>
    </section>
  )

  return (
    <div className="space-y-4">
      <BackLink title="Meios de pagamento" />
      <p className="text-sm text-slate-500">Valem para todas as viagens.</p>
      {list('Cartões que cobram em reais', methods.filter((m) => m.kind === 'cartao_brl'), 'Nenhum cartão cadastrado.')}
      {list('Em reais', methods.filter((m) => m.kind === 'brl'), 'Nenhum meio em reais cadastrado.')}
      {list('Carteiras (multimoeda e espécie)', methods.filter((m) => m.kind === 'carteira'), 'Nenhuma carteira cadastrada.')}
      <button className="btn btn-primary w-full sm:w-auto" onClick={() => setForm({})}>
        <Plus size={18} /> Novo meio de pagamento
      </button>
      {form && <MethodForm method={form.method} onClose={() => setForm(null)} />}
    </div>
  )
}
