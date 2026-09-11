import Tesseract from 'tesseract.js'

export interface OCRResult {
  text: string
  confidence: number
  words: { text: string; confidence: number }[]
}

let scheduler: Tesseract.Scheduler | null = null

async function getScheduler(): Promise<Tesseract.Scheduler> {
  if (scheduler) return scheduler

  scheduler = Tesseract.createScheduler()

  for (let i = 0; i < 2; i++) {
    const worker = await Tesseract.createWorker('eng+hin+tel', 1, {
      logger: () => {},
    })
    scheduler.addWorker(worker)
  }

  return scheduler
}

export async function recognizeText(
  image: HTMLCanvasElement | string,
  onProgress?: (progress: number, stage: string) => void
): Promise<OCRResult> {
  const sched = await getScheduler()

  onProgress?.(50, 'Running OCR...')

  const result: any = await sched.addJob('recognize', image)

  onProgress?.(90, 'Processing results...')

  const words = (result.data.words || [])
    .filter((w: any) => w.confidence > 20)
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
