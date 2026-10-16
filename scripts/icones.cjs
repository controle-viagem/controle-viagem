// Gera os ícones do Controle de Viagem (aviãozinho visto de cima, inclinado) em PNG, sem bibliotecas.
// Uso: node scripts/icones.cjs   (grava em public/ os PNGs e o favicon.svg)
// O desenho é a silhueta clássica de "voo" (formato do ícone "flight" do Material Icons, Apache 2.0), numa grade
// de 24, girada 45° para o bico apontar para cima e à direita.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const BG = [0x0f, 0x17, 0x2a]
const PLANE = [0x38, 0xbd, 0xf8]
const PATH_D = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'
const CENTER = [11.5, 12]

/** O mesmo contorno em pontos, com as duas curvas do bico divididas em segmentos. */
function outline() {
  const bez = (p0, p1, p2, p3, n = 12) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i + 1) / n
      const u = 1 - t
      return [0, 1].map((k) => u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k])
    })
  return [
    [21, 16], [21, 14], [13, 9], [13, 3.5],
    ...bez([13, 3.5], [13, 2.67], [12.33, 2], [11.5, 2]),
    ...bez([11.5, 2], [10.67, 2], [10, 2.67], [10, 3.5]),
    [10, 9], [2, 14], [2, 16], [10, 13.5], [10, 19], [8, 20.5], [8, 22], [11.5, 21], [15, 22], [15, 20.5], [13, 19], [13, 13.5],
  ]
}

/** Grade de 24 → ícone de 64: centraliza, aumenta `scale` vezes e gira 45° no sentido horário. */
function place(points, scale) {
  const c = Math.SQRT1_2
  return points.map(([x, y]) => {
    const dx = (x - CENTER[0]) * scale
    const dy = (y - CENTER[1]) * scale
    return [32 + dx * c - dy * c, 32 + dx * c + dy * c]
  })
}

function inside(poly, x, y) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

function inRounded(x, y, r) {
  if (r === 0) return x >= 0 && x <= 64 && y >= 0 && y <= 64
  const cx = Math.min(Math.max(x, r), 64 - r)
  const cy = Math.min(Math.max(y, r), 64 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** `radius` 14 = cantos arredondados (transparente fora); 0 = fundo cheio (o sistema recorta). */
function render(size, radius, scale) {
  const plane = place(outline(), scale)
  const S = 4
  const row = size * 4 + 1
  const raw = Buffer.alloc(size * row)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = ((px + (sx + 0.5) / S) / size) * 64
          const y = ((py + (sy + 0.5) / S) / size) * 64
          if (!inRounded(x, y, radius)) continue
          const color = inside(plane, x, y) ? PLANE : BG
          r += color[0]; g += color[1]; b += color[2]; a++
        }
      }
      const o = py * row + 1 + px * 4
      raw[o] = a ? Math.round(r / a) : 0
      raw[o + 1] = a ? Math.round(g / a) : 0
      raw[o + 2] = a ? Math.round(b / a) : 0
      raw[o + 3] = Math.round((a / (S * S)) * 255)
    }
  }
  return png(size, raw)
}

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    let c = (crc ^ byte) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${hex(BG)}"/>
  <path transform="translate(32 32) rotate(45) scale(2) translate(-${CENTER[0]} -${CENTER[1]})" d="${PATH_D}" fill="${hex(PLANE)}"/>
</svg>
`

const out = path.join(__dirname, '..', 'public')
fs.writeFileSync(path.join(out, 'favicon.svg'), favicon)
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, 14, 2))
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, 14, 2))
// Maskable: o Android recorta em círculo ou gota; o avião fica na área segura (80% do centro).
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, 0, 1.55))
// iPhone arredonda sozinho: fundo cheio.
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180, 0, 1.75))
console.log('ícones gerados em', out)
