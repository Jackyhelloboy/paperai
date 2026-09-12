import {
  preprocessImage,
  detectTextRegions,
  cropRegion,
  createDeruledVariant,
  TextRegion,
} from './imagePreprocess'
import {
  recognizeText,
  OCRResult,
  isSuspiciousOCR,
  scoreOCRResult,
} from './ocrEngine'
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

function meaningfulLength(text: string): number {
  return text.replace(/[^A-Za-z\u0900-\u097F0-9०-९]/g, '').length
}

function candidateQuality(result: OCRResult): number {
  let score = scoreOCRResult(result)
  const text = result.text.trim()
  const hindi = (text.match(/[\u0900-\u097F]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  const meaningful = meaningfulLength(text)

  if (meaningful < 2) score -= 0.4
  if (hindi > 0 && latin > hindi * 1.8) score -= 0.08
  if ((text.match(/[|{}<>\\^~`]/g) || []).length > 2) score -= 0.08

  return score
}

async function recognizeRegionVariants(
  originalCrop: HTMLCanvasElement,
  enhancedCrop: HTMLCanvasElement
): Promise<OCRResult> {
  const candidates: OCRResult[] = []

  const original = await recognizeText(originalCrop, { preferHindi: true })
  candidates.push(original)

  if (isSuspiciousOCR(original) || original.confidence < 0.84) {
    const enhanced = await recognizeText(enhancedCrop, { preferHindi: true })
    candidates.push(enhanced)
  }

  const bestSoFar = candidates.reduce((a, b) =>
    candidateQuality(b) > candidateQuality(a) ? b : a
  )

  // Notebook ruling lines and box borders commonly become |, -, 7, [ and ]
  // in Tesseract output. Only pay for the de-ruled retry when necessary.
  if (isSuspiciousOCR(bestSoFar) || bestSoFar.confidence < 0.72) {
    const deruled = createDeruledVariant(enhancedCrop)
    const retry = await recognizeText(deruled, { preferHindi: true })
    candidates.push(retry)
  }

  return candidates.reduce((a, b) =>
    candidateQuality(b) > candidateQuality(a) ? b : a
  )
}

function reconstructLayoutText(
  regions: ProcessResult['pages'][0]['regions']
): string {
  if (!regions.length) return ''

  const sorted = [...regions].sort((a, b) => {
    const ac = a.bbox.y + a.bbox.h / 2
    const bc = b.bbox.y + b.bbox.h / 2
    const tolerance = Math.max(8, Math.min(a.bbox.h, b.bbox.h) * 0.45)
    if (Math.abs(ac - bc) <= tolerance) return a.bbox.x - b.bbox.x
    return ac - bc
  })

  type Row = {
    centerY: number
    height: number
    items: typeof sorted
  }

  const rows: Row[] = []
  for (const region of sorted) {
    const centerY = region.bbox.y + region.bbox.h / 2
    const last = rows[rows.length - 1]
    const tolerance = Math.max(10, Math.min(last?.height || region.bbox.h, region.bbox.h) * 0.5)

    if (last && Math.abs(centerY - last.centerY) <= tolerance) {
      last.items.push(region)
      last.centerY = (last.centerY * (last.items.length - 1) + centerY) / last.items.length
      last.height = Math.max(last.height, region.bbox.h)
    } else {
      rows.push({ centerY, height: region.bbox.h, items: [region] })
    }
  }

  for (const row of rows) row.items.sort((a, b) => a.bbox.x - b.bbox.x)

  const heights = rows.map(r => r.height).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] || 30

  const output: string[] = []
  let previousBottom: number | null = null

  for (const row of rows) {
    const top = Math.min(...row.items.map(i => i.bbox.y))
    const bottom = Math.max(...row.items.map(i => i.bbox.y + i.bbox.h))

    if (previousBottom !== null && top - previousBottom > medianHeight * 0.75) {
      output.push('')
    }

    let line = ''
    let previous: (typeof row.items)[number] | null = null

    for (const item of row.items) {
      if (!previous) {
        line = item.text
      } else {
        const gapPx = Math.max(0, item.bbox.x - (previous.bbox.x + previous.bbox.w))
        const prevChars = Math.max(1, previous.text.length)
        const approxCharWidth = Math.max(5, previous.bbox.w / prevChars)
        const spaces = Math.max(1, Math.min(16, Math.round(gapPx / approxCharWidth)))
        line += ' '.repeat(spaces) + item.text
      }
      previous = item
    }

    output.push(line.trimEnd())
    previousBottom = bottom
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function processImage(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<ProcessResult> {
  const startTime = Date.now()

  onProgress?.(5, 'Loading full-resolution image...')

  const img = new Image()
  const url = URL.createObjectURL(file)

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })

  onProgress?.(12, 'Preparing OCR-safe image variants...')
  const { canvas, originalCanvas } = preprocessImage(img)
  URL.revokeObjectURL(url)

  onProgress?.(22, 'Detecting individual text lines...')
  const detected = detectTextRegions(canvas)

  // Keep only plausible regions and never vertically merge them into giant
  // blocks. The old merge logic was the main reason dense Hindi notes became
  // 2-4 enormous OCR regions.
  const regions: TextRegion[] = detected.filter(r =>
    r.w >= 18 && r.h >= 12 && r.w * r.h >= 300
  )

  onProgress?.(28, `Found ${regions.length} OCR line regions`)

  const ocrRegions: ProcessResult['pages'][0]['regions'] = []

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const progress = 28 + Math.round(64 * (i / Math.max(1, regions.length)))
    onProgress?.(progress, `Recognizing line ${i + 1}/${regions.length}...`)

    try {
      const originalCrop = cropRegion(originalCanvas, region)
      const enhancedCrop = cropRegion(canvas, region)
      const result = await recognizeRegionVariants(originalCrop, enhancedCrop)
      const cleanedText = postProcessHindi(result.text)

      if (meaningfulLength(cleanedText) < 2) continue

      ocrRegions.push({
        text: cleanedText,
        confidence: result.confidence,
        bbox: region,
        words: result.words,
        language: detectLanguage(cleanedText),
      })
    } catch (error) {
      // One difficult line should not fail the whole page.
      console.warn('OCR region failed:', error)
    }
  }

  onProgress?.(94, 'Reconstructing page reading order...')

  const fullText = reconstructLayoutText(ocrRegions)
  const totalWordConfidence = ocrRegions.reduce((sum, region) => {
    if (!region.words.length) return sum + region.confidence
    return sum + region.words.reduce((s, w) => s + w.confidence, 0) / region.words.length
  }, 0)

  const avgConf = ocrRegions.length > 0 ? totalWordConfidence / ocrRegions.length : 0
  const totalWords = ocrRegions.reduce((s, r) => s + (r.words.length || r.text.split(/\s+/).filter(Boolean).length), 0)
  const elapsed = Date.now() - startTime
  const detectedLangs = Array.from(new Set(ocrRegions.map(r => r.language)))

  onProgress?.(100, 'Done!')

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
