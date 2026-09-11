import Tesseract from 'tesseract.js'

export interface OCRResult {
  text: string
  confidence: number
  words: { text: string; confidence: number }[]
  language: string
}

// Separate workers for Hindi and English to avoid script confusion
let hindiWorker: Tesseract.Worker | null = null
let englishWorker: Tesseract.Worker | null = null
let initializing = false

async function initWorkers(
  onProgress?: (progress: number, stage: string) => void
): Promise<void> {
  if (hindiWorker && englishWorker) return
  if (initializing) {
    await new Promise(resolve => setTimeout(resolve, 500))
    return
  }

  initializing = true

  onProgress?.(5, 'Loading Hindi OCR model...')
  hindiWorker = await Tesseract.createWorker('hin', Tesseract.OEM.DEFAULT, {
    logger: () => {},
  })
  await hindiWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
  })

  onProgress?.(25, 'Loading English OCR model...')
  englishWorker = await Tesseract.createWorker('eng', Tesseract.OEM.DEFAULT, {
    logger: () => {},
  })
  await englishWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
  })

  initializing = false
}

/**
 * Run OCR with both Hindi and English, pick the best result
 * by checking how many Devanagari characters each produces
 */
export async function recognizeText(
  image: HTMLCanvasElement | string,
  onProgress?: (progress: number, stage: string) => void
): Promise<OCRResult> {
  await initWorkers(onProgress)
  onProgress?.(50, 'Running OCR...')

  // Run both engines in parallel
  const [hinResult, engResult] = await Promise.all([
    hindiWorker!.recognize(image),
    englishWorker!.recognize(image),
  ])

  onProgress?.(85, 'Selecting best result...')

  const hinText = (hinResult as any).data.text || ''
  const engText = (engResult as any).data.text || ''

  // Count Devanagari characters in each result
  const hinDevCount = (hinText.match(/[\u0900-\u097F]/g) || []).length
  const engDevCount = (engText.match(/[\u0900-\u097F]/g) || []).length

  // Pick the result with more Devanagari characters (likely Hindi text)
  const bestResult = hinDevCount >= engDevCount ? hinResult : engResult
  const bestText = (bestResult as any).data.text || ''
  const bestConfidence = ((bestResult as any).data.confidence || 0) / 100
  const bestWords = ((bestResult as any).data.words || [])
    .filter((w: any) => w.confidence > 20)
    .map((w: any) => ({ text: w.text, confidence: w.confidence / 100 }))

  const detectedLang = hinDevCount >= engDevCount ? 'hin' : 'eng'

  onProgress?.(95, 'Done')

  return {
    text: bestText.trim(),
    confidence: bestConfidence,
    words: bestWords,
    language: detectedLang,
  }
}

export async function terminateOCR() {
  if (hindiWorker) {
    await hindiWorker.terminate()
    hindiWorker = null
  }
  if (englishWorker) {
    await englishWorker.terminate()
    englishWorker = null
  }
}
