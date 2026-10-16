export interface ShrunkImage {
  /** JPEG como data URL. */
  dataUrl: string
  width: number
  height: number
}

/** Abre a imagem respeitando a orientação da câmera (foto de celular "deitada" fica em pé). */
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    // Navegadores sem createImageBitmap para esse formato: carrega por um <img>.
    const url = URL.createObjectURL(file)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'))
      img.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  }
}

/**
 * Reduz a foto do comprovante antes de guardar: lado maior até `maxSide` px e JPEG com a qualidade indicada
 * (uns 200–300 KB numa foto de celular), legível para conferir valores.
 */
export async function shrinkImage(file: Blob, maxSide = 1600, quality = 0.75): Promise<ShrunkImage> {
  const image = await decode(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível preparar a imagem.')
    // Fundo branco: PNG com transparência não fica preto no JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image.source, 0, 0, width, height)
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height }
  } finally {
    image.close()
  }
}

/** Tamanho aproximado, em bytes, de uma imagem guardada como data URL. */
export const dataUrlBytes = (dataUrl: string) => Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)

/** Imagem guardada (data URL) como arquivo, para enviar à nuvem. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',')
  const type = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Arquivo baixado da nuvem como data URL, o formato em que as fotos ficam guardadas no aparelho. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível ler a foto baixada.'))
    reader.readAsDataURL(blob.type ? blob : new Blob([blob], { type: 'image/jpeg' }))
  })
}
