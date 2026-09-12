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
 * Aggressively remove horizontal notebook ruled lines.
 * These cause Tesseract to produce garbage like Sar, wrk, Tieer, etc.
 * Enhanced: also removes vertical margin lines and handles thin colored lines.
 */
function removeHorizontalLines(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  // Count dark pixels per row AND per column
  const rowDark = new Uint32Array(h)
  const colDark = new Uint32Array(w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const gray = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114)
      if (gray < 160) {
        rowDark[y]++
        colDark[x]++
      }
    }
  }

  // Find horizontal ruled rows (>50% width span)
  const ruledRows = new Set<number>()
  const hThreshold = Math.floor(w * 0.5)
  for (let y = 0; y < h; y++) {
    if (rowDark[y] > hThreshold) ruledRows.add(y)
  }

  // Find vertical margin lines (>40% height span, in left 15% or right 15%)
  const ruledCols = new Set<number>()
  const vThreshold = Math.floor(h * 0.4)
  const leftMargin = Math.floor(w * 0.15)
  const rightMargin = Math.floor(w * 0.85)
  for (let x = 0; x < w; x++) {
    if (colDark[x] > vThreshold) {
      if (x < leftMargin || x > rightMargin) ruledCols.add(x)
    }
  }

  if (ruledRows.size === 0 && ruledCols.size === 0) return canvas

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  octx.putImageData(imageData, 0, 0)
  const outData = octx.getImageData(0, 0, w, h)
  const outPixels = outData.data

  // Remove horizontal lines (thin ones only, 1-6px)
  const hRows = Array.from(ruledRows).sort((a, b) => a - b)
  for (const y of hRows) {
    let thickness = 0
    for (let dy = 0; dy < Math.min(10, h - y); dy++) {
      if (ruledRows.has(y + dy)) thickness++
      else break
    }
    if (thickness <= 6) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        outPixels[idx] = 255
        outPixels[idx + 1] = 255
        outPixels[idx + 2] = 255
      }
    }
  }

  // Remove vertical margin lines (thin ones only, 1-4px)
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
        outPixels[idx] = 255
        outPixels[idx + 1] = 255
        outPixels[idx + 2] = 255
      }
    }
  }

  octx.putImageData(outData, 0, 0)
  return out
}

/**
 * Create a high-contrast version for better text separation.
 * Uses proper Otsu thresholding + adaptive local thresholding.
 */
function createHighContrast(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  const imageData = ctx.getImageData(0, 0, out.width, out.height)
  const data = imageData.data
  const w = out.width
  const h = out.height

  // Convert to grayscale first
  const gray = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  }

  // Otsu thresholding
  const histogram = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++

  const totalPixels = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]

  let sumB = 0, wB = 0, maxVariance = 0, threshold = 128
  for (let i = 0; i < 256; i++) {
    wB += histogram[i]
    if (wB === 0) continue
    const wF = totalPixels - wB
    if (wF === 0) break
    sumB += i * histogram[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) * (mB - mF)
    if (variance > maxVariance) {
      maxVariance = variance
      threshold = i
    }
  }

  // Apply adaptive local thresholding (better for uneven lighting)
  const blockSize = 31
  const C = 10 // constant subtracted from mean
  const integral = new Float64Array(w * h)
  const integralSq = new Float64Array(w * h)

  // Build integral image for fast local mean
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    let rowSumSq = 0
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      rowSum += gray[idx]
      rowSumSq += gray[idx] * gray[idx]
      integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0)
      integralSq[idx] = rowSumSq + (y > 0 ? integralSq[(y - 1) * w + x] : 0)
    }
  }

  // Apply threshold using local mean
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - blockSize)
      const y1 = Math.max(0, y - blockSize)
      const x2 = Math.min(w - 1, x + blockSize)
      const y2 = Math.min(h - 1, y + blockSize)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)

      const sumRegion = integral[y2 * w + x2] - integral[y1 * w + x2] - integral[y2 * w + x1] + integral[y1 * w + x1]
      const localMean = sumRegion / count

      const idx = (y * w + x) * 4
      const val = gray[y * w + x] > (localMean - C) ? 255 : 0
      data[idx] = val
      data[idx + 1] = val
      data[idx + 2] = val
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return out
}

/**
 * 2x upscale with contrast boost + sharpening.
 */
function enhanceCrop(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const enhanced = document.createElement('canvas')
  enhanced.width = canvas.width * 2
  enhanced.height = canvas.height * 2

  const ctx = enhanced.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, enhanced.width, enhanced.height)

  const imageData = ctx.getImageData(0, 0, enhanced.width, enhanced.height)
  const data = imageData.data

  // Contrast stretch + sharpen
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * 1.8 + 128))
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.8 + 128))
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.8 + 128))
  }

  // Simple unsharp mask for sharper text edges
  const w = enhanced.width
  const h = enhanced.height
  const original = new Uint8ClampedArray(data)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const center = original[idx + c]
        const blur = (
          original[((y - 1) * w + x) * 4 + c] +
          original[((y + 1) * w + x) * 4 + c] +
          original[(y * w + (x - 1)) * 4 + c] +
          original[(y * w + (x + 1)) * 4 + c]
        ) / 4
        data[idx + c] = Math.min(255, Math.max(0, Math.round(center + (center - blur) * 0.5)))
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return enhanced
}

/**
 * Morphological variant: dilate then erode to connect broken strokes.
 * Helps with faded handwriting where strokes are disconnected.
 */
function createMorphological(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  const imageData = ctx.getImageData(0, 0, out.width, out.height)
  const data = imageData.data
  const w = out.width
  const h = out.height

  // Convert to grayscale
  const gray = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  }

  // Binarize with Otsu
  const histogram = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++
  const totalPixels = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let sumB = 0, wB = 0, maxV = 0, thresh = 128
  for (let i = 0; i < 256; i++) {
    wB += histogram[i]
    if (wB === 0) continue
    const wF = totalPixels - wB
    if (wF === 0) break
    sumB += i * histogram[i]
    const variance = wB * wF * ((sumB / wB) - ((sum - sumB) / wF)) ** 2
    if (variance > maxV) { maxV = variance; thresh = i }
  }

  // Binary image: ink=1, background=0
  const bin = new Uint8Array(w * h)
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < thresh ? 1 : 0

  // Dilate (3x3 cross) — connects broken strokes
  const dilated = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (bin[y * w + x] || bin[(y - 1) * w + x] || bin[(y + 1) * w + x] ||
          bin[y * w + (x - 1)] || bin[y * w + (x + 1)]) {
        dilated[y * w + x] = 1
      }
    }
  }

  // Erode (3x3 cross) — restore original size but with connected strokes
  const eroded = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (dilated[y * w + x] && dilated[(y - 1) * w + x] && dilated[(y + 1) * w + x] &&
          dilated[y * w + (x - 1)] && dilated[y * w + (x + 1)]) {
        eroded[y * w + x] = 1
      }
    }
  }

  // Write back
  for (let i = 0; i < gray.length; i++) {
    const val = eroded[i] ? 0 : 255
    data[i * 4] = val
    data[i * 4 + 1] = val
    data[i * 4 + 2] = val
  }

  ctx.putImageData(imageData, 0, 0)
  return out
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
 * Score an OCR result. Higher = better.
 *
 * Scoring rules (v2 - enhanced):
 * - Base: Tesseract confidence (0-100)
 * - Hindi text on Hindi line: +20
 * - English text on English line: +12
 * - Garbage chars (|, [, ], =, etc.): -10 each
 * - Latin chars on Hindi line: -6 each
 * - Short garbage-only text: -50
 * - De-ruled variant bonus: +5
 * - Morphological variant bonus: +3 (helps faded text)
 * - Word count bonus: +2 per word (rewards readable text)
 * - Hindi word dictionary match: +5 per known word
 * - Consecutive garbage penalty: -20 per run
 */
function scoreResult(
  text: string,
  confidence: number,
  workerLang: string,
  variantName: string
): number {
  if (!text || text.length === 0) return -1000

  const script = detectScript(text)
  let score = confidence

  // Garbage character penalty (these come from ruled lines)
  const garbageChars = (text.match(/[|\\\/\[\]{}<>~`^=_!@#$%^&*]/g) || []).length
  score -= garbageChars * 10

  // Multiple dash penalty
  const multiDashes = (text.match(/[-=_]{2,}/g) || []).length
  score -= multiDashes * 20

  // Consecutive garbage runs (e.g., "| | | |")
  const garbageRuns = (text.match(/[|\\\/]{3,}/g) || []).length
  score -= garbageRuns * 20

  // Script coherence
  const totalChars = text.replace(/\s/g, '').length
  if (totalChars > 0) {
    const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length
    const digitChars = (text.match(/[0-9]/g) || []).length
    const hindiRatio = hindiChars / totalChars
    const latinRatio = latinChars / totalChars

    if (hindiRatio > 0.3) {
      // This is Hindi content
      score += 20  // Hindi bonus
      // Heavy penalty for Latin noise on Hindi content
      score -= latinChars * 6
    } else if (latinRatio > 0.5) {
      // This is English content
      score += 12
    }

    // Valid content ratio (Hindi + Latin + digits)
    const validRatio = (hindiChars + latinChars + digitChars) / totalChars
    score += Math.round(validRatio * 15)  // Up to +15 for clean text
  }

  // Word count bonus (rewards readable text)
  const words = text.split(/\s+/).filter(w => w.length > 0)
  score += Math.min(words.length * 2, 20)  // Cap at +20

  // Worker match bonus
  if (script === 'hindi' && workerLang === 'hin') score += 12
  if (script === 'english' && workerLang === 'eng') score += 12

  // Variant bonus
  if (variantName === 'de-ruled') score += 5
  if (variantName === 'high-contrast') score += 3
  if (variantName === 'morphological') score += 3

  // Penalty for very short garbage-only text
  const cleanText = text.replace(/[\s|\\\/\[\]{}<>~`^=_!@#$%^&*-]/g, '')
  if (cleanText.length < 2 && text.length > 0) score -= 50

  // Bonus for text with spaces (indicates word separation)
  if (text.split(/\s+/).length > 2 && totalChars > 10) score += 5

  return score
}

/**
 * Core OCR function. Tests multiple variants x multiple workers and returns the best.
 *
 * Variants: original, enhanced, de-ruled, high-contrast
 * Workers: Hindi, English, Mixed
 * Total combinations: up to 12 per line
 */
export async function recognizeText(
  image: HTMLCanvasElement,
  onProgress?: (progress: number, stage: string) => void,
  options?: RecognizeOptions
): Promise<OCRResult> {
  await initWorkers(onProgress)
  onProgress?.(50, 'Running OCR...')

  const psm = options?.psmMode ?? Tesseract.PSM.SINGLE_LINE

  // Create all preprocessing variants
  const variants: { name: string; canvas: HTMLCanvasElement }[] = [
    { name: 'original', canvas: image },
    { name: 'enhanced', canvas: enhanceCrop(image) },
    { name: 'de-ruled', canvas: removeHorizontalLines(image) },
    { name: 'high-contrast', canvas: createHighContrast(image) },
    { name: 'morphological', canvas: createMorphological(image) },
  ]

  // Choose workers based on script hint
  const hint = options?.scriptHint ?? 'mixed'
  const langPreference = options?.language

  let workersToTry: { name: string; worker: Tesseract.Worker; lang: string }[] = []

  if (langPreference === 'hin') {
    workersToTry = hindiWorker ? [{ name: 'hin', worker: hindiWorker, lang: 'hin' }] : []
  } else if (langPreference === 'eng') {
    workersToTry = englishWorker ? [{ name: 'eng', worker: englishWorker, lang: 'eng' }] : []
  } else {
    // Try all three workers
    if (hindiWorker) workersToTry.push({ name: 'hin', worker: hindiWorker, lang: 'hin' })
    if (englishWorker) workersToTry.push({ name: 'eng', worker: englishWorker, lang: 'eng' })
    if (mixedWorker) workersToTry.push({ name: 'hin+eng', worker: mixedWorker, lang: 'hin+eng' })
  }

  let bestResult: OCRResult | null = null
  let bestScore = -Infinity

  for (const variant of variants) {
    for (const { name, worker, lang } of workersToTry) {
      try {
        const { text, confidence, words } = await runOCR(variant.canvas, worker, lang, psm)
        if (!text || text.length === 0) continue

        const score = scoreResult(text, confidence, lang, variant.name)

        if (score > bestScore) {
          bestScore = score
          const script = detectScript(text)
          bestResult = { text, confidence, words, language: lang, script }
        }
      } catch {
        // Skip failed attempts
      }
    }
  }

  onProgress?.(95, 'Done')

  return bestResult || { text: '', confidence: 0, words: [], language: 'hin', script: 'unknown' }
}

/**
 * Recognize with retry for low confidence.
 */
export async function recognizeWithRetry(
  image: HTMLCanvasElement,
  onProgress?: (progress: number, stage: string) => void,
  options?: RecognizeOptions
): Promise<OCRResult> {
  const result = await recognizeText(image, onProgress, options)

  if (result.confidence >= 50) return result

  onProgress?.(60, 'Low confidence - retrying...')

  // Try different PSM modes
  for (const psm of [Tesseract.PSM.SINGLE_BLOCK, Tesseract.PSM.AUTO]) {
    const retry = await recognizeText(image, undefined, { ...options, psmMode: psm })
    if (retry.confidence > result.confidence) return retry
  }

  return result
}

export async function terminateOCR() {
  if (hindiWorker) { await hindiWorker.terminate(); hindiWorker = null }
  if (englishWorker) { await englishWorker.terminate(); englishWorker = null }
  if (mixedWorker) { await mixedWorker.terminate(); mixedWorker = null }
}
