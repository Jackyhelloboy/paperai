import Tesseract from 'tesseract.js'

export interface OCRResult {
  text: string
  confidence: number
  words: { text: string; confidence: number }[]
  language: 'hin' | 'eng' | 'mixed'
  engineLanguage: string
}

type OCRLanguage = 'hin' | 'hin+eng'

const workers = new Map<OCRLanguage, Promise<Tesseract.Worker>>()

function getWorker(language: OCRLanguage): Promise<Tesseract.Worker> {
  const existing = workers.get(language)
  if (existing) return existing

  const promise = Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY, {
    logger: () => {},
  })

  workers.set(language, promise)
  return promise
}

function getScriptStats(text: string) {
  const compact = text.replace(/\s/g, '')
  const total = Math.max(1, compact.length)
  const hindi = (text.match(/[\u0900-\u097F]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  const digits = (text.match(/[0-9०-९]/g) || []).length
  const junk = (text.match(/[|{}<>\\^~`]/g) || []).length

  return {
    hindi,
    latin,
    digits,
    hindiRatio: hindi / total,
    latinRatio: latin / total,
    junkRatio: junk / total,
  }
}

function inferLanguage(text: string): 'hin' | 'eng' | 'mixed' {
  const stats = getScriptStats(text)
  if (stats.hindi > 0 && stats.latin > 0) return 'mixed'
  if (stats.hindi > 0) return 'hin'
  return 'eng'
}

async function runOCR(
  image: HTMLCanvasElement | string,
  language: OCRLanguage,
  psm: Tesseract.PSM = Tesseract.PSM.SINGLE_LINE
): Promise<OCRResult> {
  const worker = await getWorker(language)

  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: '1',
  })

  const result: any = await worker.recognize(image)
  const text = (result.data.text || '').trim()
  const confidence = Math.max(0, Math.min(1, (result.data.confidence || 0) / 100))
  const words = (result.data.words || [])
    .filter((word: any) => typeof word.confidence === 'number' && word.text?.trim())
    .map((word: any) => ({
      text: String(word.text),
      confidence: Math.max(0, Math.min(1, word.confidence / 100)),
    }))

  return {
    text,
    confidence,
    words,
    language: inferLanguage(text),
    engineLanguage: language,
  }
}

function candidateScore(result: OCRResult, preferHindi: boolean): number {
  if (!result.text.trim()) return -1

  const stats = getScriptStats(result.text)
  let score = result.confidence

  if (preferHindi) {
    // Devanagari evidence should beat visually-similar Latin garbage on Hindi
    // notebook pages. English-only headings can still win when confidence is
    // clearly higher and the Hindi pass has little Devanagari evidence.
    score += Math.min(0.18, stats.hindiRatio * 0.22)
    if (stats.latinRatio > 0.55 && stats.hindiRatio < 0.10) score -= 0.05
  }

  score -= Math.min(0.18, stats.junkRatio * 0.8)

  // Penalize very short fragments that often come from rules/borders.
  const meaningful = result.text.replace(/[^A-Za-z\u0900-\u097F0-9०-९]/g, '').length
  if (meaningful <= 1) score -= 0.25
  else if (meaningful <= 3) score -= 0.08

  return score
}

export interface RecognizeOptions {
  preferHindi?: boolean
  pageSegMode?: Tesseract.PSM
  onProgress?: (progress: number, stage: string) => void
}

/**
 * OCR a line/block using Hindi-first routing. We intentionally do not use
 * hin+eng for every line: on handwritten Devanagari that causes Tesseract to
 * reinterpret Hindi strokes as random Latin tokens ("Sar", "wrk", etc.).
 */
export async function recognizeText(
  image: HTMLCanvasElement | string,
  options: RecognizeOptions = {}
): Promise<OCRResult> {
  const preferHindi = options.preferHindi ?? true
  const psm = options.pageSegMode ?? Tesseract.PSM.SINGLE_LINE
  const onProgress = options.onProgress

  onProgress?.(10, 'Hindi OCR pass...')
  const hindi = await runOCR(image, 'hin', psm)
  const hindiStats = getScriptStats(hindi.text)

  const needsMixedRetry =
    hindi.confidence < 0.78 ||
    hindiStats.hindiRatio < 0.25 ||
    hindi.text.replace(/\s/g, '').length < 3

  if (!needsMixedRetry) {
    onProgress?.(95, 'Done')
    return hindi
  }

  onProgress?.(55, 'Mixed Hindi/English retry...')
  const mixed = await runOCR(image, 'hin+eng', psm)

  const hindiScore = candidateScore(hindi, preferHindi)
  const mixedScore = candidateScore(mixed, preferHindi)

  let best = mixedScore > hindiScore ? mixed : hindi

  // If the mixed pass is a very confident, genuinely English-only line and
  // the Hindi pass contains little useful Devanagari, allow the English line.
  const mixedStats = getScriptStats(mixed.text)
  if (
    mixedStats.latinRatio > 0.70 &&
    mixedStats.hindiRatio < 0.05 &&
    mixed.confidence > hindi.confidence + 0.10
  ) {
    best = mixed
  }

  onProgress?.(95, 'Done')
  return best
}

export function isSuspiciousOCR(result: OCRResult): boolean {
  const stats = getScriptStats(result.text)
  const meaningful = result.text.replace(/[^A-Za-z\u0900-\u097F0-9०-९]/g, '').length

  return (
    !result.text.trim() ||
    meaningful < 2 ||
    result.confidence < 0.68 ||
    stats.junkRatio > 0.06 ||
    (stats.latinRatio > 0.50 && stats.hindiRatio > 0.10)
  )
}

export function scoreOCRResult(result: OCRResult): number {
  return candidateScore(result, true)
}

export async function terminateOCR() {
  const pending = Array.from(workers.values())
  workers.clear()

  for (const workerPromise of pending) {
    try {
      const worker = await workerPromise
      await worker.terminate()
    } catch {
      // Ignore cleanup errors.
    }
  }
}
