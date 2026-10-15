interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

/** Id fixo da pessoa "Eu" (o dono do app): existe sempre e não pode ser excluída. */
export const ME = 'eu'

/**
 * Viajante. Cada viagem tem as suas pessoas (`tripId`); a mesma pessoa em duas viagens são dois cadastros.
 * Só "Eu" (id `ME`) não tem viagem e está em todas.
 */
export interface Person extends Base {
  name: string
  tripId?: string
}

/**
 * Grupo da viagem (ex.: um casal). Só junta as pessoas na hora de ver e acertar o que pagar e receber;
 * cada pessoa continua com a sua parte. Uma pessoa fica em no máximo um grupo por viagem.
 */
export interface TripGroup {
  id: string
  name: string
  memberIds: string[]
}

/**
 * Orçamento: limites em centavos de real para o custo de `personIds` (a soma das partes delas, como no "Custo de" do
 * Início). `total` e cada categoria são opcionais.
 */
export interface Budget {
  personIds: string[]
  total?: number
  byCategory: Record<string, number>
}

export interface Trip extends Base {
  name: string
  destination: string
  /** 'AAAA-MM-DD'. Gastos antes do início (passagens, seguro) são da fase "antes da viagem". */
  startDate: string
  endDate: string
  /** Moedas estrangeiras da viagem (ex.: ['USD']), sugeridas primeiro nos lançamentos. */
  currencies: string[]
  groups: TripGroup[]
  /** Imposto local padrão (%), calculado nos gastos nas moedas estrangeiras da viagem. Ex.: 6,5 na Flórida. */
  localTaxPct?: number
  /** Gorjeta padrão (%), sugerida quando o gasto tem gorjeta. */
  tipPct?: number
  /** Orçamento da viagem (em reais), para o custo das pessoas escolhidas. */
  budget?: Budget
  /** Encerrada pelo dono: só consulta (sem gastos novos); os acertos continuam liberados. */
  closed?: boolean
  archived: boolean
}

export interface Category extends Base {
  name: string
  /** Preenchido apenas em subcategorias. */
  parentId: string | null
  color: string
  /** Chave de CATEGORY_ICONS. Ausente = ícone sugerido pelo nome (ou herdado da categoria-mãe). */
  icon?: string
  archived: boolean
}

/**
 * - `brl`: Pix, débito, conta, dinheiro em reais: só paga em reais.
 * - `cartao_brl`: cartão que cobra em reais as compras feitas em outra moeda, com spread e IOF.
 * - `carteira`: cartão multimoeda ou dinheiro em espécie, com saldo em cada moeda (custo médio em reais).
 */
export type MethodKind = 'brl' | 'cartao_brl' | 'carteira'

export const METHOD_KIND_LABEL: Record<MethodKind, string> = {
  brl: 'Em reais (Pix, débito, dinheiro)',
  cartao_brl: 'Cartão que cobra em reais',
  carteira: 'Cartão multimoeda ou espécie',
}

/** Subtipo da carteira: só muda o nome e o ícone mostrados. */
export type WalletType = 'multimoeda' | 'especie'

export const WALLET_TYPE_LABEL: Record<WalletType, string> = {
  multimoeda: 'Cartão multimoeda',
  especie: 'Dinheiro em espécie',
}

export interface PaymentMethod extends Base {
  name: string
  kind: MethodKind
  archived: boolean
  /** Só em `carteira`. */
  walletType?: WalletType
  /**
   * Só em `carteira`: titular quando não sou eu (ex.: "Ana"). Liga a carteira ao viajante de mesmo nome em qualquer
   * viagem. Ausente = minha.
   */
  holderName?: string
  /** Só em `cartao_brl`: percentuais sugeridos ao lançar uma compra em moeda estrangeira. */
  iofPct?: number
  spreadPct?: number
}

/** Igual entre os participantes, por cotas (pesos) ou por valores exatos. */
export type SplitMode = 'igual' | 'cotas' | 'valores'

export const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  igual: 'Igual',
  cotas: 'Por cotas',
  valores: 'Por valores',
}

export interface SplitShare {
  personId: string
  /** Só em `cotas`: peso da pessoa (padrão 1). */
  weight?: number
  /** Só em `valores`: parte exata, em centésimos da moeda do gasto. */
  amount?: number
}

export interface Payer {
  personId: string
  /** Centésimos da moeda do gasto. */
  amount: number
  /** Meio que a pessoa usou (ex.: a carteira dela); ausente = outro meio, sem controle. */
  methodId?: string
}

export interface Split {
  mode: SplitMode
  shares: SplitShare[]
}

export interface Expense extends Base {
  tripId: string
  /** 'AAAA-MM-DD'. */
  date: string
  description: string
  categoryId: string
  subcategoryId: string | null
  /** Quem pagou (uma pessoa). Ausente = "Eu". Com `payers`, vale `payers`. */
  payerId?: string
  /** Mais de uma pessoa pagou: quanto cada uma pagou (soma = `amount`). */
  payers?: Payer[]
  /** Quem participa e quanto cabe a cada um. Ausente = o gasto é todo de "Eu". */
  split?: Split
  /**
   * Meio de pagamento de quem pagou, quando foi uma pessoa só (eu, ou outra pessoa com uma carteira controlada); vazio =
   * outro meio, sem controle. Com vários pagadores, cada um tem o seu em `payers` e aqui fica o meu.
   */
  methodId: string
  /** Moeda em que a compra foi feita (código ISO). */
  currency: string
  /** Total pago, em centésimos da moeda da compra, já com imposto local e gorjeta. */
  amount: number
  /**
   * Ainda não pago (custo já conhecido, ex.: transfer, aluguel de cadeirinha). Conta no custo da viagem como previsto,
   * mas não sai de carteira nem gera dívida em Acertos até ser marcado como pago. `dueDate` = pagamento previsto.
   */
  pending?: boolean
  dueDate?: string
  /** Partes do total, só para relatório (mesma moeda da compra). */
  localTax?: number
  tip?: number
  /** Percentuais usados para calcular `localTax`/`tip` a partir do total (ausente = valor digitado ou sem). */
  localTaxPct?: number
  tipPct?: number
  /**
   * Compra em outra moeda no cartão em reais: cotação, spread e IOF usados na estimativa, e o valor em reais
   * (estimado ou o confirmado na fatura) — sempre da parte que eu paguei.
   */
  rate?: number
  spreadPct?: number
  iofPct?: number
  brlAmount?: number
  /** O valor em reais já foi conferido na fatura. Ausente/false = estimado. */
  brlConfirmed?: boolean
}

/**
 * - `carga`: compra de moeda com reais (cartão multimoeda, casa de câmbio).
 * - `conversao`: troca de uma moeda por outra dentro da mesma carteira.
 * - `transferencia`: mesma moeda de uma carteira para outra (ex.: saque do cartão para espécie).
 * - `ajuste`: correção do saldo, para mais ou para menos.
 * - `venda`: a sobra vendida de volta por reais.
 */
export type WalletMoveKind = 'carga' | 'conversao' | 'transferencia' | 'ajuste' | 'venda'

export const WALLET_MOVE_LABEL: Record<WalletMoveKind, string> = {
  carga: 'Carga',
  conversao: 'Conversão',
  transferencia: 'Transferência',
  ajuste: 'Ajuste de saldo',
  venda: 'Venda da sobra',
}

/** Movimento de carteira. Carteiras são globais: a sobra de uma viagem segue para a próxima. */
export interface WalletMove extends Base {
  kind: WalletMoveKind
  /** 'AAAA-MM-DD'. */
  date: string
  /** Carteira de origem (ou a única envolvida). */
  walletId: string
  /** Moeda que entra (carga, ajuste) ou que sai (conversão, transferência, venda). Nunca BRL. */
  currency: string
  /**
   * Centésimos de `currency`. Positivo, exceto no ajuste: positivo entra, negativo sai.
   * Na transferência, é o que chega ao destino (a tarifa sai à parte da origem).
   */
  amount: number
  /**
   * Centavos de real. Carga: total pago (já com spread, IOF e tarifa). Venda: total recebido.
   * Ajuste para mais: custo das unidades que entraram (opcional; sem ele, entram pelo custo médio).
   */
  brlAmount?: number
  /** Só na carga, para relatório: cotação, spread e IOF (%) e tarifa em centavos de real. */
  rate?: number
  spreadPct?: number
  iofPct?: number
  brlFee?: number
  /** Conversão: moeda e valor recebidos. */
  toCurrency?: string
  toAmount?: number
  /** Transferência: carteira de destino e tarifa (centésimos de `currency`, sai da origem). */
  toWalletId?: string
  fee?: number
  note: string
}

/**
 * Acerto entre duas pessoas: `fromId` pagou a `toId` uma dívida de `amount` em `currency`. Pode ter sido pago em
 * outra moeda (ex.: dívida em dólar paga em reais por Pix): `paidCurrency`/`paidAmount` guardam o que foi pago.
 * Um acerto feito entre grupos vira uma linha por pessoa, com o mesmo `batchId`.
 */
export interface Settlement extends Base {
  tripId: string
  batchId: string
  /** 'AAAA-MM-DD'. */
  date: string
  fromId: string
  toId: string
  currency: string
  amount: number
  paidCurrency?: string
  paidAmount?: number
  /**
   * Pago na moeda da dívida: carteiras de onde o dinheiro saiu e para onde foi, quando são controladas (só mexem no
   * saldo das carteiras, não no custo da viagem).
   */
  fromWalletId?: string
  toWalletId?: string
  /** Pago em reais: cotação combinada e, se houver, spread e IOF (%) usados para chegar ao valor pago. */
  rate?: number
  spreadPct?: number
  iofPct?: number
  note: string
}

/**
 * Foto de comprovante de um gasto, já reduzida (lib/image.ts). A imagem fica como data URL JPEG, para entrar no backup
 * e na sincronização sem conversão.
 */
export interface Receipt extends Base {
  expenseId: string
  tripId: string
  dataUrl: string
  width: number
  height: number
}

/** Configuração compartilhada (sincroniza e entra no backup). */
export interface Setting {
  key: string
  value: unknown
  updatedAt?: string
}

/** Valor que pertence só a este aparelho (ex.: viagem aberta, data do último backup). */
export interface LocalValue {
  key: string
  value: unknown
}
