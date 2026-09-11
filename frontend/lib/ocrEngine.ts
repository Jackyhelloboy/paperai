import Tesseract from 'tesseract.js'

export interface OCRResult {
  text: string
  confidence: number
  words: { text: string; confidence: number }[]
}

let scheduler: Tesseract.Scheduler | null = null
let initializing = false

async function getScheduler(
  onProgress?: (progress: number, stage: string) => void
): Promise<Tesseract.Scheduler> {
  if (scheduler) return scheduler
  if (initializing) {
    await new Promise(resolve => setTimeout(resolve, 500))
    return getScheduler(onProgress)
  }

  initializing = true
  scheduler = Tesseract.createScheduler()

  // Use Hindi + English for question papers
  const langs = 'hin+eng'

  for (let i = 0; i < 3; i++) {
    onProgress?.(10 + i * 5, `Loading OCR worker ${i + 1}/3 (${langs})...`)
    const worker = await Tesseract.createWorker(langs, Tesseract.OEM.LSTM_ONLY, {
      logger: () => {},
      cachePath: '/tesseract-cache',
    })

    // Hindi-specific: PSM 6 = Uniform block of text, assumes a single uniform block of text
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: '',
      preserve_interword_spaces: '1',
    })

    scheduler.addWorker(worker)
  }

  initializing = false
  return scheduler
}

export async function recognizeText(
  image: HTMLCanvasElement | string,
  onProgress?: (progress: number, stage: string) => void,
  langHint?: string
): Promise<OCRResult> {
  const sched = await getScheduler(onProgress)
  onProgress?.(50, 'Running OCR...')

  const result: any = await sched.addJob('recognize', image)

  onProgress?.(90, 'Processing results...')

  const words = (result.data.words || [])
    .filter((w: any) => w.confidence > 30)
    .map((w: any) => ({ text: w.text, confidence: w.confidence / 100 }))

  const text = (result.data.text || '').trim()
  const confidence = (result.data.confidence || 0) / 100

  return { text, confidence, words }
}

export async function terminateOCR() {
  if (scheduler) {
    await scheduler.terminate()
    scheduler = null
  }
}
