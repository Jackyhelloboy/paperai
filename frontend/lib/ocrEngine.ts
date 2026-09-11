import Tesseract from 'tesseract.js'

export interface OCRResult {
  text: string
  confidence: number
  words: { text: string; confidence: number }[]
  language: string
}

let worker: Tesseract.Worker | null = null
let initializing = false

async function initWorker(
  onProgress?: (progress: number, stage: string) => void
): Promise<Tesseract.Worker> {
  if (worker) return worker
  if (initializing) {
    await new Promise(resolve => setTimeout(resolve, 500))
    return worker!
  }

  initializing = true
  onProgress?.(5, 'Loading OCR engine (Hindi + English)...')

  worker = await Tesseract.createWorker('hin+eng', Tesseract.OEM.LSTM_ONLY, {
    logger: () => {},
  })

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_COLUMN,
    preserve_interword_spaces: '1',
  })

  initializing = false
  return worker
}

export async function recognizeText(
  image: HTMLCanvasElement | string,
  onProgress?: (progress: number, stage: string) => void
): Promise<OCRResult> {
  const w = await initWorker(onProgress)
  onProgress?.(50, 'Running OCR...')

  const result: any = await w.recognize(image)

  onProgress?.(85, 'Processing results...')

  const text = (result.data.text || '').trim()
  const confidence = (result.data.confidence || 0) / 100
  const words = (result.data.words || [])
    .filter((word: any) => word.confidence > 20)
    .map((word: any) => ({ text: word.text, confidence: word.confidence / 100 }))

  const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length
  const totalChars = text.replace(/\s/g, '').length
  const lang = totalChars > 0 && hindiChars / totalChars > 0.3 ? 'hin' : 'eng'

  onProgress?.(95, 'Done')

  return { text, confidence, words, language: lang }
}

export async function terminateOCR() {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}
