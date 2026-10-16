# Controle de Viagem

App pessoal de gastos de viagem: lançamentos em reais e em moeda estrangeira, câmbio (IOF, spread), saldos de
moedas e divisão de despesas entre pessoas (PWA, pt-BR). Irmão do app de gastos (`../app gastos`), com a mesma base.
O dono do projeto não é programador: explique decisões em linguagem simples e valide regras de negócio com ele
antes de mudar.

## Comandos

- `npm run dev` — servidor local em http://localhost:5174 (o app de gastos usa a 5173)
- `npm test` — testes das regras de negócio (Vitest)
- `npm run build` — checagem de tipos + build de produção em `dist/`
- Publicação: GitHub Actions (`.github/workflows/deploy.yml`) a cada push na `main`. Repositório na organização
  `controle-viagem` (https://github.com/controle-viagem/controle-viagem), site https://controle-viagem.github.io/controle-viagem/.

## Arquitetura

Vite + React + TypeScript, Tailwind v4, Dexie (IndexedDB), vite-plugin-pwa. Rotas com `HashRouter`.

- `src/domain/` — regras puras, sem banco nem tela, cada uma com teste ao lado. Toda regra de negócio nova entra aqui.
- `src/sync/` — login Microsoft, arquivos no OneDrive (dados e fotos) e o motor que decide quando sincronizar.
- `src/db/` — `db.ts` (schema e migrações), `types.ts`, `seed.ts`, e `repo.ts`: **única** camada que grava no banco.
- `src/features/<tela>/` — uma pasta por tela (`carteiras/useWalletData.ts` carrega carteiras, movimentos e
  gastos pagos por elas, com custo médio e saldos calculados). `src/app/` — contexto e a viagem aberta (`useTrips`).
- `src/components/` — layout, modal, campo de valor em qualquer moeda, ícones de categoria.
- `src/lib/format.ts` — moeda (`formatMoney`, `formatBRL`), cotação e datas em pt-BR.
- Peças copiadas do app de gastos (tema, modal, ícones, backup, `domain/sync.ts`): se corrigir algo nelas, avalie
  levar a correção para o outro app.

## Convenções

- Valores em **centésimos inteiros da moeda** (`amount` + `currency` ISO). Iene e peso chileno também são guardados
  em centésimos; só a digitação e a exibição ficam sem decimais (`currencyDigits`).
- Cotação = reais por 1 unidade da moeda, número decimal. Valores em reais são arredondados para centavos só no fim.
- Datas como texto `AAAA-MM-DD`; comparações são por texto.
- Todo registro tem `id` (UUID), `createdAt`, `updatedAt`. Toda exclusão passa por `remove()` em `repo.ts`, que deixa
  o registro em `deletions` (preparação para a sincronização futura).
- Mudou o formato dos dados? Crie uma nova `db.version(n)` com migração; nunca edite uma versão já publicada.
- Tabela nova entra em `BACKUP_TABLES` (`domain/backup.ts`) e sobe `FILE_FORMAT` (hoje 5), para
  um app mais antigo recusar o arquivo em vez de perder a tabela.
- Excluir categoria ou meio de pagamento já usado apenas arquiva (`archived`), para preservar o histórico.
- Números digitados (cotação, %) aceitam vírgula ou ponto: sempre leia com `parseDecimal`.

## Regras de negócio decididas com o dono

- **Viagem**: nome, destino, ida, volta e moedas. Gastos são sempre de uma viagem. A viagem aberta é escolhida por
  aparelho (`local.viagemAberta`); sem escolha vale a em andamento, senão a próxima, senão a mais recente.
  Gasto antes da ida (passagens, seguro) é da fase "antes da viagem" pela data.
- **Categorias e meios de pagamento são globais** (valem para todas as viagens).
- **Meios de pagamento**: `brl` (só paga em reais), `cartao_brl` (cobra em reais compras em outra moeda, com IOF e
  spread sugeridos do cadastro) e `carteira` (subtipo `walletType`: cartão multimoeda ou espécie; paga só em moeda
  estrangeira). IOF padrão 3,5%, spread 4%: editáveis. Um meio não vira carteira nem deixa de ser depois de cadastrado.
- **Compra em outra moeda no cartão em reais**: reais = valor × cotação × (1 + spread) × (1 + IOF)
  (`domain/cambio.ts`). Fica **estimada** até o dono marcar o valor cobrado na fatura (`brlConfirmed`); o valor
  confirmado substitui o estimado e mostra a cotação efetiva. A cotação sugerida é a do último gasto da mesma moeda
  na viagem.
- **Imposto local e gorjeta** são partes do total pago (não somam por cima), só para relatório.
- Totais em reais incluem os estimados; o Início avisa quanto ainda é estimado.
- Custo do câmbio (`fxCost`): IOF contido no valor em reais; spread = o que passa de valor × cotação, fora o IOF.
  Sem cotação informada, só o IOF é conhecido.

### Carteiras (fase 2, versão 0.2.0)

- **Carteiras são globais**: a sobra de uma viagem segue para a próxima. Movimentos ficam em `walletMoves`
  (`WalletMove` em `db/types.ts`): `carga` (BRL → moeda, com o **total pago em reais**; cotação, spread, IOF e tarifa
  são detalhes opcionais só para relatório), `conversao` (moeda → outra moeda na mesma carteira), `transferencia`
  (mesma moeda entre carteiras, tarifa opcional na moeda, sai da origem além do valor que chega), `ajuste` (`amount`
  com sinal) e `venda` (sobra vendida por reais).
- **Custo médio móvel por carteira e moeda** (`domain/custoMedio.ts`), em ordem cronológica (data; no mesmo
  dia, **entradas antes das saídas** — `dayOrder` em `saldoCarteira.ts`, decisão do dono na 1.2.0; depois `createdAt`): carga soma unidades e reais pagos; gasto, venda, transferência, conversão e ajuste para menos saem
  pelo médio do momento. Transferência e conversão levam esse custo para o destino, então a tarifa do saque encarece
  o dinheiro que chega. Ajuste para mais entra pelo custo informado ou, sem ele, pelo médio atual. Esvaziar a
  carteira leva o custo restante inteiro (sem sobra de arredondamento). Venda mostra ganho/perda = recebido − custo.
- O custo em reais de um gasto pela carteira **é sempre calculado, nunca digitado nem guardado**: tudo é
  recalculado do zero, então editar algo antigo corrige o que vem depois. As telas recebem `walletCosts` (de
  `useWalletData` / `useTripData`) e passam para `brlValue`, `isEstimate` e `summarize`. Gasto pela carteira
  nunca é "estimado".
- Saldo sem cobertura (`domain/saldoCarteira.ts`): é permitido salvar, com aviso. Enquanto o saldo está negativo,
  as saídas usam o último médio conhecido (ou zero, se nunca houve carga). O aviso aparece quando o saldo está ou
  **já ficou** negativo (gasto lançado antes da carga), com a data.
- **Nunca há médio juntando carteiras de titulares diferentes** (decisão do dono, 1.1.0): em Carteiras, cada grupo
  ("Minhas carteiras", "Carteiras de Ana") mostra o total por moeda e o médio só com saldos positivos
  (`positiveByCurrency`); saldos negativos ficam de fora, com aviso. Spread e IOF opcionais no cadastro do **cartão
  multimoeda** (`spreadPct`/`iofPct`, mesmos campos do cartão): custo de uma carga nova, sugeridos ao lançar a carga.
  **Espécie não tem** (decisão do dono, 1.2.2): o custo dele vem do saque/transferência ou da casa de câmbio.
- Telas: Carteiras (`/carteiras`, no menu lateral e no Mais; no celular também pelo cartão do Início), formulário
  de movimento `features/carteiras/MoveForm.tsx`, prévia do custo no formulário de gasto.
- As 6 regras das carteiras da fase 2 foram **aprovadas pelo dono** (15/10/2026): tarifa de saque embutida no custo
  do dinheiro que chega (não vira gasto separado), conversão leva o custo, ajuste pelo custo digitado ou médio, gasto
  sem saldo salva com aviso, venda mostra ganho/perda, IOF/spread das cargas já estão no custo médio (não somar de novo).

### Viajantes e acertos (versões 0.3.0 e 0.4.0)

- **Viajantes são de cada viagem** (decisão do dono na 0.4.0): `Person.tripId`; a mesma pessoa em duas viagens são
  dois cadastros, sem copiar entre viagens. Só "Eu" (id fixo `ME = 'eu'`) não tem viagem e está em todas; o nome dele
  é editado no editor de viajantes. Viajantes = "Eu" + pessoas com o `tripId` (`useTripData().travelers`).
  Grava tudo por `saveTravelers` (ids de pessoas novas gerados na tela); quem está em gastos ou acertos não pode sair.
  A migração v4 (`domain/migracao.ts`, também usada no backup formato < 4) dividiu o cadastro antigo por viagem.
- **Pessoas separadas, grupos só para ver e acertar** (decisão do dono): cada pessoa tem a sua parte e o seu saldo;
  na visão por grupo, os saldos dos membros somam e o que um deve ao outro se anula.
- Gasto: quem pagou é `payerId` (um só; ausente = "Eu") ou `payers` (vários, com o valor de cada, somando o total);
  use sempre `payersOf`/`paidBy` de `domain/rateio.ts`. `split` (ausente = tudo de "Eu"): igual, cotas ou valores
  exatos; centavos que sobram vão primeiro para o pagador principal. A divisão é **opcional** no formulário (seção
  recolhida "Dividir ou pago por outra pessoa").
- **Meio de pagamento, cartão e câmbio valem só para a parte que eu paguei**: `brlAmount`/estimativa do cartão e o
  custo da carteira são dessa parte (`useWalletData` desconta só `paidBy(e, ME)`). Sem parte minha: `methodId` vazio.
  Gasto pago por outro com a minha parte = valor que eu devo.
- **Saldos na moeda de cada gasto** (`domain/saldos.ts`): cada pagador + o que pagou, participantes − parte; acerto: quem
  pagou +, quem recebeu −. Pagamentos sugeridos com o menor número de pagamentos, moeda por moeda.
- **Acerto** (`settlements`): sempre na moeda da dívida; pode registrar o pago em reais com a cotação combinada
  (sugerida = custo médio das carteiras, senão a última cotação da viagem). Acerto entre grupos vira uma linha por
  pessoa com o mesmo `batchId` (`settlementRows`, na proporção do saldo de cada membro); excluir apaga o lote.
- **Cada pessoa fica em um só grupo** (senão o saldo contaria duas vezes na visão por grupo): marcar num grupo tira
  do outro, e grupo vazio não é salvo. O editor mostra em que grupo a pessoa já está e avisa do grupo vazio.
- **Editar acerto** (toque na linha em "Acertos feitos"): reabre o lote inteiro (`editContext`), com os saldos sem ele para
  redividir; pessoas do lote que não formam um grupo viram uma parte própria ("Ana + Léo"). Salvar substitui o lote.
- Pago em reais: cotação + spread % + IOF % (como no cartão, `cardCharge`), ou o valor digitado à mão; quando é
  calculado, `rate`/`spreadPct`/`iofPct` ficam guardados no acerto para a edição voltar igual.
- **Meu custo** (`summarize` com `personIds`, `custoViagem.ts`): só a minha parte (ou do meu grupo, no seletor do
  Início) de cada gasto, em reais pelo custo real. O que outra pessoa pagou em moeda estrangeira vai pela cotação de
  referência (`referenceRates`) e conta como estimado. Lista de gastos e Viagens mostram o meu custo.
- Texto para WhatsApp: `domain/textoAcertos.ts`, com o equivalente em reais pela cotação de referência.
- **Calculadora** (`/calculadora`, `domain/calculadora.ts`): preço + imposto % + gorjeta % (sobre o preço sem imposto)
  para o viajante escolhido em "Quem paga" (`payerOptions`, decisão do dono na 1.2.1): **uma linha "Saldo das
  carteiras"** pelo médio de todas as carteiras dele com saldo positivo (avisa se não cobre); **uma "carga nova" por
  cartão multimoeda com spread e IOF cadastrados** (1.2.2; pode ser 0), simulando carregar hoje: cotação do dia
  (digitada ou PTAX) × spread × IOF do cadastro. Espécie só entra pelo saldo, quando tem; cada cartão em reais dele e a simulação livre; destaca a mais barata.
- **Cotação de referência por viajante** (1.1.0, `referenceRates`, `RateLookup(moeda, { personId, methodId })`):
  médio das carteiras de quem pagou (membros, se for grupo), só saldos positivos; sem nenhuma, a última cotação da
  viagem. Cartão em reais dele: cotação do dia (última da viagem) × spread × IOF do cartão. Usada no custo do que
  outro pagou, na sugestão do acerto (pelo pagador) e no texto do WhatsApp.
- O quadro "Câmbio (IOF + spread)" saiu do Início a pedido do dono (volta nos relatórios). `fx` segue em `summarize`.
- Navegação no celular: Início, Gastos, +, Acertos, Mais. Carteiras, Calculadora e Viagens no Mais e no menu
  lateral; Calculadora também no topo do Início.

### Encerrar viagem, imposto e lista de gastos (versão 0.4.0)

- **Encerrar viagem** (`Trip.closed`, `setTripClosed`): só consulta — sem gastos novos nem edição (formulário em modo
  leitura, "+" avisa), mas **acertos continuam liberados**; dá para reabrir. Situação: "Encerrada" (pelo dono) ou
  "Terminou" (pela data), `statusLabel`. Encerradas vão para o fim da lista.
- **Pendências de outras viagens** (`usePending`, `PendingCard`): no Início e em Acertos, o meu saldo nas viagens que
  ainda têm algo a acertar; tocar abre aquela viagem em Acertos. Acertos tem seletor de viagem (troca a viagem aberta).
- **Imposto local e gorjeta** (`domain/impostos.ts`): `Trip.localTaxPct`/`tipPct`. Nas moedas da viagem, o imposto vem
  automático pela taxa da viagem; em cada gasto: taxa %, valor ou sem; gorjeta: sem, % ou valor. A partir do total
  pago: preço = (total − valores fixos) ÷ (1 + imposto% + gorjeta%). Grava `localTax`/`tip` e os % usados.
  A calculadora usa a taxa da viagem como padrão.
- **Lista de gastos**: filtros de várias opções no endereço (`domain/filtro.ts`, `FiltroModal`): categorias e
  subcategorias (subcategoria marcada restringe a categoria dela), pessoas (pagou ou participa), meios, moedas, fase,
  período, "A conferir na fatura" (antigo "só estimados": cartão em reais ainda não conferido), divididos, pagos por
  outros e texto. Seleção de vários (botão ou toque longo): mudar categoria e excluir. Totais = meu custo.
- O aviso do Início separa o que é "a conferir na fatura" do que é estimado por ter sido pago por outra pessoa em
  moeda estrangeira (convertido pela cotação de referência).

### Carteiras dos pares e custo por viajantes (versão 0.5.0)

- **Titular da carteira** (`PaymentMethod.holderName`, ausente = minha): ligação com o viajante **pelo nome**
  (`domain/titular.ts`, `walletsOf`, sem diferenciar maiúsculas/acentos), válida em qualquer viagem. Carteiras agrupadas
  por titular; o dono lança as cargas das carteiras dos pares também.
- **Cada pagador com o seu meio** (`Payer.methodId`; um pagador só = `payerId` + `methodId`, agora também para outra
  pessoa). Para quem não sou eu: as carteiras dele ou "outro meio (sem controle)". Cada parte paga por carteira é uma
  saída dela (`useWalletData().spends`, chave `spendId(gasto, pessoa)` em `domain/despesa.ts`; `walletCosts` usa essa
  chave). No custo da viagem, a parte de outra pessoa paga por carteira controlada vai pelo **custo médio real** dela;
  sem carteira, pela cotação de referência (estimado).
- **Acerto em moeda mexe nas carteiras** (`Settlement.fromWalletId`/`toWalletId`, "Saiu de / Entrou em"; só quando não
  é pago em reais): saída pelo médio; entrada com o custo da saída (como transferência) ou, sem carteira de saída, pelo
  médio de quem recebe. Só controle de saldo: não muda o custo da viagem.
- **Custo de** (Início, Relatórios, orçamento, prestação de contas — `CostSelector`): três visões (decisão do dono,
  0.8.1): **"Eu e meu grupo"** (padrão: eu ou o grupo de que faço parte, um de cada vez), **"Grupos"** (um ou mais
  grupos, somados) e **"Viajantes"** (cada pessoa, com "Só eu" e "Todos"). Sem grupos na viagem, só viajantes. A
  visão segue a escolha guardada até o dono tocar numa aba. Tudo do Início soma as partes dessas pessoas e o
  saldo a acertar delas. Guardado por viagem neste aparelho (`local` `custoDe:<viagem>`). "Saldos em moeda" mostra as
  minhas carteiras e as dos viajantes da viagem.

### Relatórios, prestação de contas e orçamento (fase 4, versão 0.6.0)

- **Modelo único** (`domain/relatorio.ts`, `buildReport`): só dados, usado pela tela de Relatórios, pela prévia e pelo
  PDF. `ReportConfig`: pessoas (de quem é o custo / para quem é), gastos "só os que envolvem" ou "todos", período e
  categorias, seções ligáveis (`SECTIONS`), valores (total e parte, ou só total), moeda (reais, original, as duas) e
  nomes de terceiros (sem nome / com nome). Modelos prontos em `presetConfig`. A última configuração fica por viagem
  neste aparelho (`local prestacao:<viagem>`).
- **Privacidade (decisão do dono)**: com "só os que envolvem", nada sem as pessoas escolhidas entra; com "sem nome",
  terceiros viram "outro viajante" / "+N pessoas" nos gastos. "Eu" (quem emite) sempre aparece com nome. Saldos,
  pagamentos e acertos valem para a viagem inteira e mostram o outro lado com nome.
- **PDF** (`lib/pdf.ts`, jsPDF 4.2.1 + jspdf-autotable 5.0.9, versões fixas): carregado só ao gerar. Fontes padrão do
  PDF: os acentos do português saem certos; `≈ − →` viram `~ - ->` (`clean`). Compartilhar com
  `navigator.share({ files })` quando o aparelho deixa; senão, baixar.
- A antiga tela **Relatórios** saiu na 1.4.0 (ver abaixo): `/relatorios` agora é a prestação de contas. A cor das barras
  (`components/chartTheme.ts`) foi validada para daltonismo — não trocar sem validar.
- **Orçamento** (`domain/orcamento.ts`): limites em reais, total e por categoria. Atenção a partir de 80%, estourou
  acima de 100%; projeção = antes + depois + média por dia × dias. Desde a 1.4.0, **um orçamento por conjunto de pessoas
  do "Custo de"** (`Trip.budgets`, `budgetFor`/`withBudget`; o antigo `Trip.budget` vale como o primeiro). Editor em
  `features/relatorios/OrcamentoEditor.tsx`, aberto pelo Início ("Por orçamento").

### Comprovantes e planilha (versão 0.7.0)

- **Fotos dos comprovantes** (`receipts`, `db.version(5)`): reduzidas antes de guardar (`lib/image.ts`: lado maior
  1600 px, JPEG 75%, orientação da câmera) e guardadas como **data URL** (texto), para backup e sincronização sem
  conversão. No gasto: "Foto" (câmera) e "Galeria"; miniaturas, tela cheia (`ReceiptViewer`), tirar. Lista mostra o
  clipe com a quantidade (`useTripData().receiptCounts`, só pelas chaves do índice, sem carregar as imagens). Excluir
  gasto ou viagem leva as fotos. Entram no backup (`FILE_FORMAT = 5`). Decisão do dono: irão para a nuvem com o sync.
- Botões dentro de `<form>` precisam de `type="button"`, senão salvam o formulário (aconteceu no visualizador de fotos).
- **PDF com anexos** (`ReportConfig.anexos`): uma foto por página no fim, só dos gastos incluídos (`model.included`).
- **Planilha .xlsx** (`domain/planilha.ts` monta as abas; `lib/planilha.ts` grava com write-excel-file 4.1.1, versão
  fixa, carregado só ao exportar): abas Gastos (com "Parte de <pessoa>" por pessoa escolhida), Acertos, Carteiras,
  Saldos e Resumo, com a mesma configuração e privacidade da prestação de contas. Dinheiro em unidades (centavos ÷ 100).

### Gastos a pagar (versão 0.8.0)

- `Expense.pending`: custo já conhecido, ainda não pago (transfer, aluguel na retirada). No formulário, a caixa
  "Já foi pago" desmarcada; a data vira "Pagamento previsto". Marcar como pago = marcar a caixa de novo.
- **Entra no custo da viagem** como previsto (`summarize().pending` mostra à parte no Início, com atalho).
- **Não sai de carteira** (`useWalletData` ignora) e **não gera dívida** (`balances()` pula) até ser pago.
- **Acertos**: saldos e pagamentos sugeridos só com o que foi pago. Embaixo, linha recolhida "Previstos: N gastos a
  pagar · …" (só aparece se houver), com o que cada parte receberia ou pagaria (`tripBalances().forecast`).
- Filtro "A pagar" (`apagar=1`); selo "a pagar" na lista; seção opcional "Gastos previstos" na prestação de contas,
  **desligada por padrão, inclusive no modelo Completo**; coluna "Situação" (pago / a pagar) na planilha.

### Meios de pagamento dos outros viajantes (versão 0.9.0)

- **Titular em qualquer meio** (não só carteira): conta em reais, cartão em reais, multimoeda ou espécie de outro
  viajante, ligado pelo nome (`methodsFor` em `domain/titular.ts`: em reais, contas e cartões; em outra moeda,
  cartões e carteiras). Os meios com titular **nunca aparecem entre os meus** (formulário, calculadora).
- No "quem pagou", **pessoa sem nenhum meio cadastrado não mostra a pergunta** do meio (decisão do dono: não interessa).
- **Cartão em reais de outro viajante** (decisão do dono): a parte dele em moeda estrangeira custa cotação de
  referência × (1 + spread) × (1 + IOF) do cadastro do cartão, e conta como estimado (`RateLookup(moeda, meio)`,
  `payerBRL` em `custoViagem.ts`). Carteira dele continua pelo custo médio real.
- **Por meio de pagamento** (`totalsByMethod`): quanto cada pessoa escolhida pagou com cada meio, em reais, sem os
  gastos a pagar. Seção `meios` da prestação de contas (entra no Completo) e quadro em Relatórios. O filtro "Meios"
  da lista acha o meio de qualquer pagador.

### Início concentra os relatórios (versão 1.4.0, decisões do dono)

- **Sem a tela Relatórios**: o botão "Relatórios" (Início, menu e Mais) abre a prestação de contas (`/relatorios`;
  `/relatorios/prestacao` redireciona). Recharts saiu do projeto (o gráfico por dia continua no PDF, seção "Por dia").
- **Quadro de visões no Início** (`components/Breakdown.tsx`): Por categoria, Por pessoa (só com mais de uma pessoa
  escolhida), Por orçamento (o das pessoas escolhidas; sem ele, convite para definir) e Por meio de pagamento
  (`totalsByMethod`). Botões no computador, lista suspensa no celular.
- **Últimos gastos**: só os que envolvem as pessoas escolhidas (`involves`); "Ver todos" abre a lista já filtrada.
- **Em outras moedas**: valor na moeda e, discreto, quanto custou em reais (`summarize().byCurrency[].brl`).
- **Câmbio, imposto e gorjeta** no fim do Início (sem as cargas): IOF e spread dos cartões e, por moeda, imposto local
  e gorjetas também em reais pela cotação que cada gasto usou (`extras[].localTaxBRL`/`tipBRL`).
- **Saldos em moeda**: cada pessoa numa linha com o total à direita (moeda e ≈ reais); as carteiras dela recuadas,
  só com o saldo (médio e custo de cada carteira ficam na tela Carteiras); com mais de uma pessoa, o total somado.
- Projeção ("no ritmo atual, deve fechar em…") no destaque do Início.

### Visões por viajante e auditoria (versão 1.3.0, decisões do dono)

- **Início, "Saldos em moeda"**: só as carteiras das pessoas do "Custo de", agrupadas por pessoa, com o total dela
  por moeda em reais pelo médio das carteiras dela (`HolderTotals` em `CarteirasPage`, só saldos positivos).
- **Carteiras**: filtro "Carteiras de" com o mesmo "Custo de" das outras abas (`useCostPeople`); carteiras de quem
  não está na viagem não aparecem (com aviso). Total por viajante também em reais.
- **"Por categoria" / "Por pessoa"** (`components/Breakdown.tsx`; desde a 1.4.0, parte do quadro de visões do Início): "Por pessoa"
  só com mais de uma pessoa escolhida e só com as escolhidas.
- **Auditoria** (seção opcional `divisao` da prestação de contas, "Divisão de cada gasto"): em cada gasto, quanto cada
  um pagou e a parte de cada um; terceiros seguem a regra de nomes ("outro viajante" / "outras pessoas").
  Seções opcionais (`OPTIONAL` em `relatorio.ts`): previstos, extrato e divisão, desligadas também no Completo.
- PDF: o título de cada coluna segue o alinhamento do conteúdo (helper `table` em `lib/pdf.ts`).
- Pagamento de outra pessoa sem meio cadastrado aparece como "Outro meio" (sem "(sem controle)").

### Página da carteira e extrato (versão 1.2.0)

- **Mesmo dia** (decisão do dono): o que só entra (carga, ajuste para mais, acerto recebido) conta antes das trocas
  (conversão, transferência) e do que só sai (gasto, venda, ajuste para menos, acerto pago), seja qual for a ordem
  do lançamento. Assim gasto e recarga do mesmo dia não "ficam negativos" e o gasto sai pelo custo da recarga.
- **Página de cada carteira** (`/carteiras/:id`, `CarteiraPage`): tocar no cartão da carteira abre saldo, médio e o
  extrato só dela (mais recente primeiro, com o saldo depois de cada linha); "Editar carteira" é um botão. A lista
  geral continua em Carteiras.
- **Extrato** (`domain/extrato.ts`, `walletStatement`): todos os movimentos de uma carteira na ordem do custo médio,
  uma linha por moeda (conversão = duas), com o valor em reais (`Ledger.settlementCosts` para os acertos) e o saldo
  corrido. Seção opcional "Extrato das carteiras" na prestação de contas (desligada por padrão, inclusive no
  Completo): uma tabela por carteira e moeda, com saldo anterior, no período escolhido (sem período: seis meses antes
  da viagem até o fim dela); escolha das carteiras das pessoas escolhidas (`ReportConfig.extratoCarteiras`).

### Sincronização e cotação PTAX (fase 5, versão 1.0.0)

- **Sincronização** (`src/sync/`, copiada do app de gastos com a renovação de login que funcionou lá): arquivo
  `dados.json` na pasta "Controle de Viagem" do OneDrive, junção registro a registro (`domain/sync.ts`). Mesmo
  registro de app na Microsoft que o app de gastos (`CLIENT_ID`, decisão do dono): os endereços do app de viagem
  (publicado e `http://localhost:5174/`) precisam estar cadastrados nele como SPA. Modo convidado (outra pessoa
  entra pelo link da pasta) igual ao do app de gastos. Tela em Mais → Sincronização; selo de estado no menu.
- A Microsoft só renova o acesso sozinha por 24 h em apps web. Vencido, o app tenta ao abrir uma ida e volta **sem
  tela** (`prompt: 'none'`), uma vez por abertura e só nos primeiros 20 s (nunca com formulário aberto). Se falhar,
  fica o aviso; "Entrar de novo" vai à Microsoft já com a conta. Não mexer nisso sem conferir no app de gastos.
- **Fotos dos comprovantes** (decisão do dono: baixar só ao abrir): a imagem **não vai no arquivo de dados**
  (`withoutPhotos`); cada foto é um arquivo `comprovantes/<id>.jpg`, que sobe uma vez, **antes** dos dados
  (`sendPhotos`). No outro aparelho o comprovante chega com `dataUrl` vazio e a foto é baixada ao abrir o gasto
  (`fetchPhoto`, em `ReceiptsField`) ou ao gerar o PDF com anexos. `keepLocalPhotos` nunca apaga uma foto já
  baixada. Excluir o comprovante apaga a foto da nuvem (melhor esforço). Fotos só na nuvem não entram no backup.
- Restaurar backup substitui também a nuvem (`replaceRemote`); "Apagar tudo" desconecta antes.
- **Cotação PTAX** (`domain/ptax.ts`, `components/PtaxButton.tsx`): só ao tocar no botão (decisão do dono), na
  Calculadora, no gasto no cartão em reais, no acerto pago em reais e na carga. Serviço público do Banco Central
  (Olinda), cotação de **venda** do boletim mais recente (4 por dia útil; o último é o fechamento), dizendo de quando
  é. Só 10 moedas têm PTAX (`PTAX_CURRENCIES`); nas outras o botão não aparece. Fonte "comercial em tempo real"
  avaliada e descartada: a gratuita estava com dias de atraso.

## Decisões para as próximas fases

- **Consulta por viajante** (adiada pelo dono): link só leitura por pessoa/grupo com o extrato embutido (sem
  servidor, exige o app publicado); consulta ao vivo depois do sync.

## Aparência

- Tema claro/escuro em `src/lib/theme.ts`, com a mesma regra repetida em `index.html`; mude os dois juntos.
- O escuro redefine a escala do Tailwind em `.dark` (`src/index.css`): use as classes normais, sem hexadecimal fixo.
- **Cores de valores** num lugar só (`components/valueStyle.ts`): a receber verde (+), a pagar vermelho (−),
  estimado âmbar (≈), saldo de carteira índigo. Selos de moeda e avatares de pessoa (`components/Badges.tsx`) usam
  cores de destaque com `color-mix`, como os ícones de categoria, e servem nos dois temas.
- O total do Início fica num cartão invertido (`bg-slate-900 text-white`), que se inverte sozinho no escuro.
- Ícones próprios: aviãozinho visto de cima, inclinado (decisão do dono; o de papel lembrava o Telegram). Gerados
  por `node scripts/icones.cjs` (sem bibliotecas), que grava os PNGs e o `favicon.svg` em `public/`. Antes eram os
  do app de gastos. O manifesto tem `id` fixo
  (`/controle-viagem/`).
- **Site próprio** (16/10/2026): no mesmo site do app de gastos (graraujo90.github.io), o Chrome do Android dizia
  "já instalado" sem estar (chrome://webapks só tinha o Gastos). Por isso o repositório foi para a organização
  `controle-viagem`: endereço novo, armazenamento e login próprios. O endereço novo precisa estar no portal Microsoft.

## Armadilhas do ambiente

- O projeto fica dentro do OneDrive, e o servidor de desenvolvimento às vezes **não percebe arquivos alterados**.
  Na dúvida, reinicie o `npm run dev`.
- Não há Python na máquina: scripts auxiliares em Node ou PowerShell.
- Em scripts Node que trocam texto, `String.replace` com texto de substituição interpreta `$'`, `$&` e `$1`
  (ex.: "R$'" corrompeu um arquivo). Use `split(a).join(b)`, função como substituição, ou a ferramenta de edição.
