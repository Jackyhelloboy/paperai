import { preprocessImage } from './imagePreprocess'
import { recognizeText } from './ocrEngine'
import { postProcessHindi } from './hindiPostProcess'

export interface ProcessResult {
  pages: {
    regions: {
      text: string
      confidence: number
      bbox: { x: number; y: number; w: number; h: number }
      words: { text: string; confidence: number }[]
      language: string
    }[]
    fullText: string
    averageConfidence: number
  }[]
  metadata: {
    filename: string
    processedAt: string
    totalRegions: number
    languagesDetected: string[]
    processingTime: number
  }
  summary: {
    averageConfidence: number
    totalRegions: number
    totalCharacters: number
    totalWords: number
  }
}

export async function processImage(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<ProcessResult> {
  const startTime = Date.now()

  onProgress?.(5, 'Loading image...')

  const img = new Image()
  const url = URL.createObjectURL(file)

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })

  onProgress?.(15, 'Preprocessing image...')

  const { canvas } = preprocessImage(img)
  URL.revokeObjectURL(url)

  onProgress?.(40, 'Running OCR on full image...')

  // Send the ENTIRE image to OCR - no region splitting
  // This avoids cutting off matras and gives Tesseract better context
  const result = await recognizeText(canvas)

  onProgress?.(80, 'Post-processing Hindi text...')

  const cleanedText = postProcessHindi(result.text)

  const lang = (cleanedText.match(/[\u0900-\u097F]/g) || []).length > 0 ? 'hin' : 'eng'

  onProgress?.(95, 'Finalizing...')

  const elapsed = Date.now() - startTime

  onProgress?.(100, 'Done!')

  return {
    pages: [{
      regions: [{
        text: cleanedText,
        confidence: result.confidence,
        bbox: { x: 0, y: 0, w: canvas.width, h: canvas.height },
        words: result.words,
        language: lang,
      }],
      fullText: cleanedText,
      averageConfidence: result.confidence,
    }],
    metadata: {
      filename: file.name,
      processedAt: new Date().toISOString(),
      totalRegions: 1,
      languagesDetected: [lang],
      processingTime: elapsed,
    },
    summary: {
      averageConfidence: result.confidence,
      totalRegions: 1,
      totalCharacters: cleanedText.length,
      totalWords: result.words.length,
    },
  }
}
