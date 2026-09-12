import { preprocessImage } from './imagePreprocess'
import { recognizeText } from './ocrEngine'
import { pdfToImages } from './pdfProcess'
import { processDocument, DocumentResult } from './documentProcessor'

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
  documentAnalysis?: DocumentResult
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export async function processImage(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<ProcessResult> {
  const startTime = Date.now()

  onProgress?.(5, 'Loading file...')

  // For images, use the document processor with script-aware routing
  if (!isPdfFile(file)) {
    try {
      const docResult = await processDocument(file, onProgress)
      const elapsed = Date.now() - startTime

      return {
        pages: [{
          regions: docResult.regions.map(r => ({
            text: r.correctedText,
            confidence: r.confidence,
            bbox: r.bbox,
            words: r.wordConfidences.map(wc => ({
              text: wc.word,
              confidence: wc.confidence,
            })),
            language: r.script === 'hindi' ? 'hin' : r.script === 'english' ? 'eng' : 'mixed',
          })),
          fullText: docResult.fullText,
          averageConfidence: docResult.metadata.overallConfidence,
        }],
        metadata: {
          filename: file.name,
          processedAt: new Date().toISOString(),
          totalRegions: docResult.regions.length,
          languagesDetected: Array.from(new Set(docResult.regions.map(r =>
            r.script === 'hindi' ? 'hin' : r.script === 'english' ? 'eng' : 'mixed'
          ))),
          processingTime: elapsed,
        },
        summary: {
          averageConfidence: docResult.metadata.overallConfidence,
          totalRegions: docResult.regions.length,
          totalCharacters: docResult.fullText.length,
          totalWords: docResult.fullText.split(/\s+/).length,
        },
        documentAnalysis: docResult,
      }
    } catch (err) {
      console.error('Document processor failed, falling back to simple OCR:', err)
    }
  }

  // PDF processing (simple OCR)
  const pages: ProcessResult['pages'] = []
  const allLanguages = new Set<string>()

  if (isPdfFile(file)) {
    const canvases = await pdfToImages(file, onProgress)

    for (let i = 0; i < canvases.length; i++) {
      onProgress?.(
        30 + ((i / canvases.length) * 60) | 0,
        `OCR page ${i + 1}/${canvases.length}...`
      )

      const { canvas } = preprocessImage(canvases[i])
      const result = await recognizeText(canvas)

      const lang = (result.text.match(/[\u0900-\u097F]/g) || []).length > 0 ? 'hin' :
                   (result.text.match(/[\u0C00-\u0C7F]/g) || []).length > 0 ? 'tel' : 'eng'
      allLanguages.add(lang)

      pages.push({
        regions: [{
          text: result.text,
          confidence: result.confidence,
          bbox: { x: 0, y: 0, w: canvas.width, h: canvas.height },
          words: result.words,
          language: lang,
        }],
        fullText: result.text,
        averageConfidence: result.confidence,
      })
    }
  }

  onProgress?.(95, 'Finalizing...')

  const elapsed = Date.now() - startTime
  const totalRegions = pages.reduce((sum, p) => sum + p.regions.length, 0)
  const totalWords = pages.reduce((sum, p) => sum + p.regions.reduce((s, r) => s + r.words.length, 0), 0)
  const totalCharacters = pages.reduce((sum, p) => sum + p.fullText.length, 0)
  const avgConfidence = pages.reduce((sum, p) => sum + p.averageConfidence, 0) / Math.max(pages.length, 1)

  onProgress?.(100, 'Done!')

  return {
    pages,
    metadata: {
      filename: file.name,
      processedAt: new Date().toISOString(),
      totalRegions,
      languagesDetected: Array.from(allLanguages),
      processingTime: elapsed,
    },
    summary: {
      averageConfidence: avgConfidence,
      totalRegions,
      totalCharacters,
      totalWords,
    },
  }
}
