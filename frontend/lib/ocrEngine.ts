import Tesseract from 'tesseract.js'

export interface OCRResult {
  text: string
  confidence: number
  words: { text: string; confidence: number; bbox?: { x: number; y: number; w: number; h: number } }[]
  language: string
  script: 'hindi' | 'english' | 'mixed' | 'unknown'
}

export interface RecognizeOptions {
  language?: string
  scriptHint?: 'hindi' | 'english' | 'mixed' | 'unknown'
  psmMode?: Tesseract.PSM
}

let hindiWorker: Tesseract.Worker | null = null
let englishWorker: Tesseract.Worker | null = null
let mixedWorker: Tesseract.Worker | null = null
let initializing = false

async function initWorkers(
  onProgress?: (progress: number, stage: string) => void
): Promise<void> {
  if (hindiWorker && englishWorker && mixedWorker) return
  if (initializing) {
    await new Promise(resolve => setTimeout(resolve, 500))
    return
  }

  initializing = true
  onProgress?.(5, 'Loading OCR engines...')

  hindiWorker = await Tesseract.createWorker('hin', Tesseract.OEM.LSTM_ONLY, {
    logger: () => {},
  })
  await hindiWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    preserve_interword_spaces: '1',
  })

  englishWorker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    logger: () => {},
  })
  await englishWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    preserve_interword_spaces: '1',
  })

  mixedWorker = await Tesseract.createWorker('hin+eng', Tesseract.OEM.LSTM_ONLY, {
    logger: () => {},
  })
  await mixedWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    preserve_interword_spaces: '1',
  })

  initializing = false
}

function detectScript(text: string): OCRResult['script'] {
  const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length
  const totalChars = text.replace(/\s/g, '').length

  if (totalChars === 0) return 'unknown'

  const hindiRatio = hindiChars / totalChars
  const latinRatio = latinChars / totalChars

  if (hindiRatio > 0.3) return 'hindi'
  if (latinRatio > 0.5) return 'english'
  if (hindiRatio > 0.1 && latinRatio > 0.1) return 'mixed'
  return 'unknown'
}

/**
 * Remove horizontal ruled lines and vertical margin lines.
 */
function removeLines(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  const rowDark = new Uint32Array(h)
  const colDark = new Uint32Array(w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const gray = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8
      if (gray < 160) {
        rowDark[y]++
        colDark[x]
      }
    }
  }

  const ruledRows = new Set<number>()
  const hThreshold = (w * 0.5) | 0
  for (let y = 0; y < h; y++) {
    if (rowDark[y] > hThreshold) ruledRows.add(y)
  }

  const ruledCols = new Set<number>()
  const vThreshold = (h * 0.4) | 0
  const leftMargin = (w * 0.15) | 0
  const rightMargin = (w * 0.85) | 0
  for (let x = 0; x < w; x++) {
    if (colDark[x] > vThreshold && (x < leftMargin || x > rightMargin)) {
      ruledCols.add(x)
    }
  }

  if (ruledRows.size === 0 && ruledCols.size === 0) return canvas

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  octx.putImageData(imageData, 0, 0)
  const outPixels = octx.getImageData(0, 0, w, h).data

  // Remove horizontal lines (1-6px thick)
  const hRows = Array.from(ruledRows).sort((a, b) => a - b)
  for (const y of hRows) {
    let thickness = 0
    for (let dy = 0; dy < Math.min(10, h - y); dy++) {
      if (ruledRows.has(y + dy)) thickness++
      else break
    }
    if (thickness <= 6) {
      const rowIdx = y * w * 4
      for (let x = 0; x < w; x++) {
        const idx = rowIdx + x * 4
        outPixels[idx] = outPixels[idx + 1] = outPixels[idx + 2] = 255
      }
    }
  }

  // Remove vertical margin lines (1-4px thick)
  const vCols = Array.from(ruledCols).sort((a, b) => a - b)
  for (const x of vCols) {
    let thickness = 0
    for (let dx = 0; dx < Math.min(6, w - x); dx++) {
      if (ruledCols.has(x + dx)) thickness++
      else break
    }
    if (thickness <= 4) {
      for (let y = 0; y < h; y++) {
        const idx = (y * w + x) * 4
        outPixels[idx] = outPixels[idx + 1] = outPixels[idx + 2] = 255
      }
    }
  }

  octx.putImageData(new ImageData(outPixels, w, h), 0, 0)
  return out
}

/**
 * High contrast with adaptive local thresholding via integral image.
 */
function highContrast(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Grayscale
  const gray = new Float64Array(w * h)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8
  }

  // Integral image for O(1) local mean
  const integral = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      rowSum += gray[idx]
      integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0)
    }
  }

  // Adaptive threshold
  const blockSize = 31
  const C = 10
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - blockSize) | 0
      const y1 = Math.max(0, y - blockSize) | 0
      const x2 = Math.min(w - 1, x + blockSize) | 0
      const y2 = Math.min(h - 1, y + blockSize) | 0
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)

      const sumRegion = integral[y2 * w + x2] - integral[y1 * w + x2] - integral[y2 * w + x1] + integral[y1 * w + x1]
      const localMean = sumRegion / count

      const val = gray[y * w + x] > (localMean - C) ? 255 : 0
      const idx = (y * w + x) * 4
      data[idx] = data[idx + 1] = data[idx + 2] = val
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return out
}

/**
 * Morphological: dilate+erode to connect broken strokes.
 */
function morphological(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Grayscale + Otsu binarize
  const gray = new Uint8Array(w * h)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8
  }

  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, maxV = 0, thresh = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const variance = wB * wF * ((sumB / wB) - ((sum - sumB) / wF)) ** 2
    if (variance > maxV) { maxV = variance; thresh = i }
  }

  const bin = new Uint8Array(w * h)
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < thresh ? 1 : 0

  // Dilate
  const dilated = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (bin[y * w + x] || bin[(y - 1) * w + x] || bin[(y + 1) * w + x] ||
          bin[y * w + (x - 1)] || bin[y * w + (x + 1)]) {
        dilated[y * w + x] = 1
      }
    }
  }

  // Erode
  const eroded = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (dilated[y * w + x] && dilated[(y - 1) * w + x] && dilated[(y + 1) * w + x] &&
          dilated[y * w + (x - 1)] && dilated[y * w + (x + 1)]) {
        eroded[y * w + x] = 1
      }
    }
  }

  for (let i = 0; i < gray.length; i++) {
    const val = eroded[i] ? 0 : 255
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = val
  }

  ctx.putImageData(imageData, 0, 0)
  return out
}

/**
 * Score an OCR result. Higher = better.
 */
function scoreResult(text: string, confidence: number, workerLang: string, variantName: string): number {
  if (!text || text.length === 0) return -1000

  const script = detectScript(text)
  let score = confidence

  // Garbage penalties
  const garbageChars = (text.match(/[|\\\/\[\]{}<>~`^=_!@#$%^&*]/g) || []).length
  score -= garbageChars * 10

  const garbageRuns = (text.match(/[|\\\/]{3,}/g) || []).length
  score -= garbageRuns * 20

  const multiDashes = (text.match(/[-=_]{2,}/g) || []).length
  score -= multiDashes * 20

  // Script coherence
  const totalChars = text.replace(/\s/g, '').length
  if (totalChars > 0) {
    const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length
    const digitChars = (text.match(/[0-9]/g) || []).length
    const hindiRatio = hindiChars / totalChars
    const latinRatio = latinChars / totalChars

    if (hindiRatio > 0.3) {
      score += 20
      score -= latinChars * 6
    } else if (latinRatio > 0.5) {
      score += 12
    }

    const validRatio = (hindiChars + latinChars + digitChars) / totalChars
    score += (validRatio * 15) | 0
  }

  // Word count bonus
  const words = text.split(/\s+/).filter(w => w.length > 0)
  score += Math.min(words.length * 2, 20)

  // Worker match bonus
  if (script === 'hindi' && workerLang === 'hin') score += 12
  if (script === 'english' && workerLang === 'eng') score += 12

  // Variant bonus
  if (variantName === 'de-ruled') score += 5
  else if (variantName === 'high-contrast') score += 3
  else if (variantName === 'morphological') score += 3

  // Short garbage penalty
  const cleanText = text.replace(/[\s|\\\/\[\]{}<>~`^=_!@#$%^&*-]/g, '')
  if (cleanText.length < 2 && text.length > 0) score -= 50

  // Word separation bonus
  if (words.length > 2 && totalChars > 10) score += 5

  return score
}

/**
 * Run a single OCR pass.
 */
async function runOCR(
  canvas: HTMLCanvasElement,
  worker: Tesseract.Worker,
  lang: string,
  psm?: Tesseract.PSM
): Promise<{ text: string; confidence: number; words: any[] }> {
  if (psm !== undefined) {
    await worker.setParameters({ tessedit_pageseg_mode: psm })
  }

  const result: any = await worker.recognize(canvas)
  const text = (result.data.text || '').trim()
  const confidence = result.data.confidence || 0
  const words = (result.data.words || [])
    .filter((w: any) => w.text && w.text.trim().length > 0)
    .map((w: any) => ({
      text: w.text.trim(),
      confidence: w.confidence || 0,
      bbox: w.bbox ? {
        x: w.bbox.x0,
        y: w.bbox.y0,
        w: w.bbox.x1 - w.bbox.x0,
        h: w.bbox.y1 - w.bbox.y0,
      } : undefined,
    }))

  return { text, confidence, words }
}

/**
 * Core OCR function - SPEED OPTIMIZED.
 *
 * Strategy (fast):
 * 1. Run mixed worker only (fastest path)
 * 2. If confidence >= 50, return immediately
 * 3. Only try de-ruled variant if confidence < 30
 * 4. Skip morphological/high-contrast entirely (too slow)
 */
export async function recognizeText(
  image: HTMLCanvasElement,
  onProgress?: (progress: number, stage: string) => void,
  options?: RecognizeOptions
): Promise<OCRResult> {
  await initWorkers(onProgress)
  onProgress?.(50, 'Running OCR...')

  const psm = options?.psmMode ?? Tesseract.PSM.SINGLE_LINE
  const langPreference = options?.language

  // Choose worker - prefer mixed for speed
  let worker: Tesseract.Worker
  let lang: string
  if (langPreference === 'hin' && hindiWorker) {
    worker = hindiWorker; lang = 'hin'
  } else if (langPreference === 'eng' && englishWorker) {
    worker = englishWorker; lang = 'eng'
  } else {
    worker = mixedWorker!; lang = 'hin+eng'
  }

  // Fast path: single pass with mixed worker
  try {
    const { text, confidence, words } = await runOCR(image, worker, lang, psm)
    if (text && text.length > 0) {
      const score = scoreResult(text, confidence, lang, 'original')
      if (confidence >= 50) {
        onProgress?.(95, 'Done')
        return { text, confidence, words, language: lang, script: detectScript(text) }
      }
      // Try de-ruled only if very low confidence
      if (confidence < 30) {
        try {
          const deRuled = removeLines(image)
          const retry = await runOCR(deRuled, worker, lang, psm)
          if (retry.confidence > confidence) {
            onProgress?.(95, 'Done')
            return { text: retry.text, confidence: retry.confidence, words: retry.words, language: lang, script: detectScript(retry.text) }
          }
        } catch {}
      }
      onProgress?.(95, 'Done')
      return { text, confidence, words, language: lang, script: detectScript(text) }
    }
  } catch {}

  onProgress?.(95, 'Done')
  return { text: '', confidence: 0, words: [], language: lang, script: 'unknown' }
}

/**
 * Recognize with retry - SKIPPED for speed (use recognizeText directly).
 */
export async function recognizeWithRetry(
  image: HTMLCanvasElement,
  onProgress?: (progress: number, stage: string) => void,
  options?: RecognizeOptions
): Promise<OCRResult> {
  return recognizeText(image, onProgress, options)
}

export async function terminateOCR() {
  if (hindiWorker) { await hindiWorker.terminate(); hindiWorker = null }
  if (englishWorker) { await englishWorker.terminate(); englishWorker = null }
  if (mixedWorker) { await mixedWorker.terminate(); mixedWorker = null }
}
