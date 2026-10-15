// Gera o PDF da prestação de contas a partir do modelo (`domain/relatorio.ts`). Carregado só quando o dono pede o PDF
// (import dinâmico), para não pesar na abertura do app.
import { jsPDF } from 'jspdf'
import { autoTable, type CellHookData, type RowInput } from 'jspdf-autotable'
import { BUDGET_LEVEL_LABEL } from '../domain/orcamento'
import { SECTION_LABEL, type ReportModel, type SectionKey } from '../domain/relatorio'
import { formatBRL, formatMoney, formatRate, fullDate } from './format'

// As fontes padrão do PDF só têm os caracteres do português do dia a dia: estes símbolos viram equivalentes simples.
const clean = (text: string) => text.replace(/≈/g, '~').replace(/[−–]/g, '-').replace(/→/g, '->')
const money = (cents: number, currency: string) => clean(formatMoney(cents, currency))
const brl = (cents: number) => clean(formatBRL(cents))
const signed = (cents: number, currency: string) => `${cents > 0 ? '+' : cents < 0 ? '-' : ''}${money(Math.abs(cents), currency)}`
const pct = (share: number) => `${Math.round(share * 100)}%`

const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const GREEN: [number, number, number] = [5, 150, 105]
const RED: [number, number, number] = [225, 29, 72]
const AMBER: [number, number, number] = [217, 119, 6]
const MARGIN = 14

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export interface Attachment {
  dataUrl: string
  width: number
  height: number
}

/**
 * Gera o PDF e devolve o arquivo. `attachments`: fotos dos comprovantes por gasto, anexadas no fim quando a
 * configuração pede (só de gastos incluídos no relatório).
 */
export function renderReportPdf(model: ReportModel, title: string, attachments?: Map<string, Attachment[]>): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const width = pageWidth - MARGIN * 2
  const { config } = model
  const showBRL = config.moeda !== 'original'
  const showOriginal = config.moeda !== 'reais'
  let y = MARGIN

  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y
  const ensure = (space: number) => {
    if (y + space > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage()
      y = MARGIN
    }
  }
  const heading = (key: SectionKey, extra?: string) => {
    ensure(18)
    y += 4
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK)
    doc.text(clean(SECTION_LABEL[key] + (extra ? ` ${extra}` : '')), MARGIN, y)
    y += 2
  }
  const note = (text: string) => {
    ensure(8)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    const lines = doc.splitTextToSize(clean(text), width)
    doc.text(lines, MARGIN, y + 4)
    y += 4 * lines.length + 1
  }
  const table = (head: string[], body: RowInput[], options: Parameters<typeof autoTable>[1] = {}) => {
    autoTable(doc, {
      head: [head.map(clean)],
      body: body.map((row) => (Array.isArray(row) ? row.map((c) => (typeof c === 'string' ? clean(c) : c)) : row)),
      startY: y + 2,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: INK },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      ...options,
    })
    y = lastY() + 2
  }
  /** Coluna com uma barra proporcional (cor da categoria ou cinza). */
  const barHook = (column: number, shares: number[], colors?: [number, number, number][]) => (data: CellHookData) => {
    if (data.section !== 'body' || data.column.index !== column) return
    const share = shares[data.row.index] ?? 0
    const w = Math.max(0.5, (data.cell.width - 2) * Math.min(1, share))
    doc.setFillColor(...(colors?.[data.row.index] ?? MUTED))
    doc.rect(data.cell.x + 1, data.cell.y + data.cell.height / 2 - 1.5, w, 3, 'F')
  }

  // Cabeçalho
  doc.setFillColor(15, 23, 42).rect(0, 0, pageWidth, 30, 'F')
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(16).text(clean(title), MARGIN, 12)
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(clean(`${model.tripName} · ${fullDate(model.startDate)} a ${fullDate(model.endDate)}`), MARGIN, 19)
  doc.text(clean(`Para: ${model.forNames} · emitido em ${new Date().toLocaleDateString('pt-BR')}`), MARGIN, 25)
  y = 36
  const scopeText = config.scope === 'envolvidos'
    ? `Inclui só os gastos de que ${model.forNames} participou ou pagou.`
    : 'Inclui todos os gastos da viagem.'
  const period = config.de || config.ate ? ` Período: ${config.de ? fullDate(config.de) : 'início'} a ${config.ate ? fullDate(config.ate) : 'fim'}.` : ''
  note(`${scopeText}${period} Valores em reais com "~" ainda são estimativa (fatura não conferida ou pago por outra pessoa em moeda estrangeira).`)

  for (const key of config.sections) {
    switch (key) {
      case 'resumo': {
        const s = model.summary
        if (!s) break
        heading(key)
        const rows: RowInput[] = [
          [`Custo de ${model.forNames}`, brl(s.total)],
          ['Antes da viagem', brl(s.antes)],
          ['Durante a viagem', brl(s.durante)],
          ...(s.depois ? [['Depois da viagem', brl(s.depois)]] : []),
          ['Média por dia', s.perDay === null ? '-' : brl(s.perDay)],
          [`Projeção para os ${s.days} dias`, brl(s.projection)],
          ...(s.estimated ? [['Ainda estimado', brl(s.estimated)]] : []),
          ...s.byCurrency.filter((c) => c.currency !== 'BRL').map((c) => [`Gasto em ${c.currency}`, money(c.amount, c.currency)]),
        ]
        table(['Item', 'Valor'], rows, { columnStyles: { 1: { halign: 'right' } }, tableWidth: width * 0.65 })
        break
      }
      case 'categorias': {
        const rows = model.categories
        if (!rows) break
        heading(key)
        const body: RowInput[] = []
        const shares: number[] = []
        const colors: [number, number, number][] = []
        for (const c of rows) {
          body.push([c.name, '', pct(c.share), brl(c.total)])
          shares.push(c.share)
          colors.push(hexToRgb(c.color))
          for (const sub of c.subs.filter((x) => x.name !== 'Sem subcategoria' || c.subs.length > 1)) {
            body.push([`   ${sub.name}`, '', pct(sub.share * c.share), brl(sub.total)])
            shares.push(sub.share * c.share)
            colors.push([203, 213, 225])
          }
        }
        if (body.length === 0) note('Nenhum gasto.')
        else table(['Categoria', '', '%', 'Valor'], body, {
          columnStyles: { 1: { cellWidth: 50 }, 2: { halign: 'right', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 30 } },
          didDrawCell: barHook(1, shares, colors),
        })
        break
      }
      case 'dias': {
        const days = model.days
        if (!days) break
        heading(key)
        const max = Math.max(...days.map((d) => d.total), 1)
        if (days.length === 0) note('Nenhum gasto durante a viagem.')
        else table(['Dia', '', 'Valor'], days.map((d) => [fullDate(d.date), '', brl(d.total)]), {
          columnStyles: { 1: { cellWidth: 90 }, 2: { halign: 'right' } },
          didDrawCell: barHook(1, days.map((d) => d.total / max)),
        })
        break
      }
      case 'pessoas': {
        const people = model.people
        if (!people) break
        heading(key)
        note('Quanto custou a parte de cada pessoa nos gastos incluídos, em reais.')
        table(['Pessoa', 'Custo'], people.map((p) => [p.name, brl(p.total)]), { columnStyles: { 1: { halign: 'right' } }, tableWidth: width * 0.6 })
        break
      }
      case 'gastos': {
        const rows = model.expenses
        if (!rows) break
        heading(key, `(${rows.length})`)
        const withPart = config.valores === 'parte'
        const head = ['Data', 'Gasto', 'Pago por', 'Participantes']
        if (showOriginal) head.push('Valor', ...(withPart ? ['Parte'] : []))
        if (showBRL) head.push(withPart ? 'Parte em R$' : 'Em R$')
        const body: RowInput[] = rows.map((e) => {
          const row: string[] = [fullDate(e.date).slice(0, 5), `${e.description}\n${e.category}`, e.paidBy, e.participants]
          if (showOriginal) row.push(money(e.total, e.currency), ...(withPart ? [money(e.part, e.currency)] : []))
          if (e.pending) row[1] += ' (a pagar)'
          if (showBRL) row.push(`${e.estimated ? '~ ' : ''}${brl(withPart ? e.brlPart : e.brlTotal)}`)
          return row
        })
        const right = Object.fromEntries(head.map((h, i) => [i, h === 'Data' || h === 'Gasto' || h === 'Pago por' || h === 'Participantes' ? {} : { halign: 'right' as const }]))
        const total = rows.reduce((sum, e) => sum + (withPart ? e.brlPart : e.brlTotal), 0)
        if (showBRL) body.push([{ content: 'Total em reais', colSpan: head.length - 1, styles: { fontStyle: 'bold', halign: 'right' } }, { content: brl(total), styles: { fontStyle: 'bold', halign: 'right' } }])
        if (rows.length === 0) note('Nenhum gasto.')
        else table(head, body, { columnStyles: { 0: { cellWidth: 12 }, ...right }, styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.3, textColor: INK } })
        break
      }
      case 'saldos': {
        const rows = model.balances
        if (!rows) break
        heading(key)
        note('Positivo = tem a receber; negativo = tem a pagar. Considera a viagem inteira e os acertos já feitos.')
        table(['Pessoa', 'Saldo'], rows.map((r) => [r.name, r.amounts.length ? r.amounts.map((a) => signed(a.value, a.currency)).join('\n') : 'Tudo acertado']), {
          columnStyles: { 1: { halign: 'right' } },
          tableWidth: width * 0.7,
          didParseCell: (data) => {
            if (data.section !== 'body' || data.column.index !== 1) return
            const first = rows[data.row.index]?.amounts[0]?.value ?? 0
            data.cell.styles.textColor = first > 0 ? GREEN : first < 0 ? RED : MUTED
          },
        })
        break
      }
      case 'sugeridos': {
        const rows = model.transfers
        if (!rows) break
        heading(key)
        if (rows.length === 0) note('Nada a acertar.')
        else table(['Quem paga', 'Para quem', 'Valor', 'Em reais (ref.)'], rows.map((t) => [t.from, t.to, money(t.amount, t.currency), t.brl === null ? '-' : `~ ${brl(t.brl)}`]), {
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
        })
        break
      }
      case 'acertos': {
        const rows = model.settlements
        if (!rows) break
        heading(key)
        if (rows.length === 0) note('Nenhum acerto registrado.')
        else table(['Data', 'De', 'Para', 'Valor', 'Pago'], rows.map((s) => [fullDate(s.date), s.from, s.to, money(s.amount, s.currency), s.paid ? money(s.paid.amount, s.paid.currency) : '-']), {
          columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
        })
        break
      }
      case 'cambio': {
        const fx = model.fx
        if (!fx) break
        heading(key)
        table(['Item', 'Valor'], [
          ['IOF nos cartões que cobram em reais', brl(fx.cardIof)],
          ['Spread dos bancos nesses cartões', brl(fx.cardSpread)],
          ...fx.extras.flatMap((x) => [[`Imposto local (${x.currency})`, money(x.localTax, x.currency)], [`Gorjetas (${x.currency})`, money(x.tip, x.currency)]]),
        ], { columnStyles: { 1: { halign: 'right' } }, tableWidth: width * 0.7 })
        if (fx.loads.length) {
          note('Cargas das carteiras (compra de moeda) até o fim da viagem: cotação efetiva = total pago em reais ÷ valor recebido.')
          table(['Data', 'Carteira', 'Recebido', 'Pago', 'Cotação efetiva', 'Detalhe'], fx.loads.map((l) => [
            fullDate(l.date), l.wallet, money(l.amount, l.currency), brl(l.brl), formatRate(l.rate),
            [l.commercialRate ? `cotação ${formatRate(l.commercialRate)}` : '', l.spreadPct ? `spread ${l.spreadPct}%` : '', l.iofPct ? `IOF ${l.iofPct}%` : ''].filter(Boolean).join(' · ') || '-',
          ]), { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } })
        }
        break
      }
      case 'carteiras': {
        const rows = model.wallets
        if (!rows) break
        heading(key)
        if (rows.length === 0) note('Nenhuma carteira com saldo.')
        else table(['Carteira', 'Titular', 'Saldo', 'Custo médio', 'Custou'], rows.map((w) => [w.name, w.holder, money(w.units, w.currency), w.avg === null ? '-' : formatRate(w.avg), brl(w.cost)]), {
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        })
        break
      }
      case 'previstos': {
        const f = model.forecast
        if (!f) break
        heading(key)
        if (f.items.length === 0) { note('Nenhum gasto a pagar.'); break }
        note('Custos já conhecidos que ainda não foram pagos; viram saldo a acertar quando forem pagos.')
        table(['Data prevista', 'Gasto', 'Valor', 'Parte'], f.items.map((i) => [fullDate(i.date), i.description, money(i.amount, i.currency), money(i.part, i.currency)]), {
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
        })
        table(['Pessoa', 'Quando pagos'], f.balances.map((b) => [b.name, b.amounts.length ? b.amounts.map((a) => signed(a.value, a.currency)).join('\n') : '-']), { columnStyles: { 1: { halign: 'right' } }, tableWidth: width * 0.7 })
        break
      }
      case 'orcamento': {
        const b = model.budget
        if (!b) break
        heading(key, `(custo de ${b.forNames})`)
        const lines = [...(b.total ? [b.total] : []), ...b.categories]
        const levelColor = { ok: GREEN, atencao: AMBER, estourou: RED }
        table(['Limite', '', 'Usado', 'Gasto', 'Limite (R$)', 'Situação'], lines.map((l) => [
          l.id ? (b.names.get(l.id) ?? '-') : 'Total da viagem', '', pct(l.share), brl(l.spent), brl(l.limit), BUDGET_LEVEL_LABEL[l.level],
        ]), {
          columnStyles: { 1: { cellWidth: 35 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
          didDrawCell: barHook(1, lines.map((l) => l.share), lines.map((l) => levelColor[l.level])),
        })
        if (b.total) note(`Projeção do total no ritmo atual: ${brl(b.total.projection)} (${BUDGET_LEVEL_LABEL[b.total.projectedLevel].toLowerCase()}).`)
        break
      }
    }
  }

  // Comprovantes: uma foto por página, com a identificação do gasto, na ordem dos gastos.
  if (config.anexos && attachments) {
    const pageHeight = doc.internal.pageSize.getHeight()
    let first = true
    for (const e of model.included) {
      const photos = attachments.get(e.id) ?? []
      photos.forEach((photo, i) => {
        doc.addPage()
        y = MARGIN
        if (first) {
          doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK)
          doc.text('Comprovantes', MARGIN, y + 2)
          y += 8
          first = false
        }
        doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
        const caption = `${fullDate(e.date)} · ${e.description} · ${money(e.amount, e.currency)}${photos.length > 1 ? ` · foto ${i + 1} de ${photos.length}` : ''}`
        doc.text(clean(caption), MARGIN, y + 2)
        y += 6
        const maxW = width
        const maxH = pageHeight - y - 16
        const scale = Math.min(maxW / photo.width, maxH / photo.height)
        const w = photo.width * scale
        const h = photo.height * scale
        doc.addImage(photo.dataUrl, 'JPEG', MARGIN + (maxW - w) / 2, y, w, h)
      })
    }
  }

  // Rodapé com páginas.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    doc.text(`Controle de Viagem · página ${i} de ${pages}`, pageWidth - MARGIN, doc.internal.pageSize.getHeight() - 8, { align: 'right' })
  }
  return doc.output('blob')
}
