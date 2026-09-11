import { preprocessImage, detectTextRegions, cropRegion } from './imagePreprocess'
import { recognizeText, OCRResult } from './ocrEngine'
import { postProcessHindi, detectLanguage } from './hindiPostProcess'

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

  onProgress?.(10, 'Preprocessing image (upscaling + binarization)...')

  const { canvas } = preprocessImage(img)
  URL.revokeObjectURL(url)

  onProgress?.(30, 'Detecting text lines...')

  const regions = detectTextRegions(canvas)
  onProgress?.(35, `Found ${regions.length} text lines`)

  const ocrRegions: ProcessResult['pages'][0]['regions'] = []

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    onProgress?.(
      35 + Math.round(55 * (i / regions.length)),
      `OCR: line ${i + 1}/${regions.length}...`
    )

    try {
      const cropCanvas = cropRegion(canvas, region)
      const result = await recognizeText(cropCanvas)

      if (result.text.trim().length > 1) {
        const cleanedText = postProcessHindi(result.text)
        if (cleanedText.trim().length > 1) {
          const lang = detectLanguage(cleanedText)
          ocrRegions.push({
            text: cleanedText,
            confidence: result.confidence,
            bbox: region,
            words: result.words,
            language: lang,
          })
        }
      }
    } catch (e) {
      // Skip failed regions
    }
  }

  onProgress?.(95, 'Finalizing...')

  const fullText = ocrRegions.map(r => r.text).join('\n\n')
  const avgConf = ocrRegions.length > 0
    ? ocrRegions.reduce((s, r) => s + r.confidence, 0) / ocrRegions.length
    : 0
  const totalWords = ocrRegions.reduce((s, r) => s + r.words.length, 0)

  const elapsed = Date.now() - startTime

  onProgress?.(100, 'Done!')

  const detectedLangs = Array.from(new Set(ocrRegions.map(r => r.language)))

  return {
    pages: [{
      regions: ocrRegions,
      fullText,
      averageConfidence: avgConf,
    }],
    metadata: {
      filename: file.name,
      processedAt: new Date().toISOString(),
      totalRegions: ocrRegions.length,
      languagesDetected: detectedLangs,
      processingTime: elapsed,
    },
    summary: {
      averageConfidence: avgConf,
      totalRegions: ocrRegions.length,
      totalCharacters: fullText.length,
      totalWords,
    },
  }
}
