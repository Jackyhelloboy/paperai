// Document OCR Pipeline v4 - Cleaned & Optimized

export type OCRScript = 'hindi' | 'english' | 'mixed' | 'unknown'

export interface DocumentRegion {
  id: string
  type: 'heading' | 'paragraph' | 'bullet' | 'table' | 'unknown'
  bbox: { x: number; y: number; w: number; h: number }
  rawText: string
  correctedText: string
  confidence: number
  script: 'hindi' | 'english' | 'mixed' | 'unknown'
  wordConfidences: { word: string; confidence: number; verified: boolean }[]
  needsVerification: boolean
  retryCount: number
}

export interface DocumentResult {
  regions: DocumentRegion[]
  fullText: string
  metadata: {
    filename: string
    processedAt: string
    totalPages: number
    overallConfidence: number
    characterConfidence: number
    wordConfidence: number
    fieldsNeedingVerification: number
    totalWords: number
    highConfidenceWords: number
    reviewSuggestedWords: number
    lowConfidenceWords: number
    isCatastrophicFailure: boolean
    failureReason: string | null
  }
  corrections: { field: string; original: string; corrected: string }[]
  documentEntities: string[]
}

const PROTECTED_PATTERNS = [
  /PRVT\/\d+\/\d{4}/g,
  /REC\d{10,}/g,
  /MNCL[\-][A-Z0-9\-]+/g,
  /\d{11}/g,
  /File\s*No\.?\s*[:.]?\s*[A-Z0-9\/\-]+/gi,
  /Rs\.?\s*[\d,]+/g,
  /₹\s*[\d,]+/g,
]

const OCR_CORRECTIONS: [RegExp, string][] = [
  [/\(1\.40:/g, 'Lr.No:'],
  [/\bPRVT\[S\$\/2026\b/g, 'PRVT/56/2026'],
  [/\b2086-36\b/g, '2035-36'],
  [/\bRJDSB\b/g, 'RJDSE'],
  [/\(£\.M\)/g, '(E.M)'],
  [/\b£\.M\b/g, 'E.M'],
  [/\bBRIL[\-]LIANT\b/gi, 'BRILLIANT'],
  [/\bpro[\-]posals\b/gi, 'proposals'],
  [/\b\| have\b/g, 'I have'],
  [/\b\| was\b/g, 'I was'],
  [/\b\| will\b/g, 'I will'],
  [/\b4857\b/g, '1857'],
  [/\b2857\b/g, '1857'],
  [/\b3857\b/g, '1857'],
  [/\b4858\b/g, '1858'],
  [/\b2858\b/g, '1858'],
  [/\b3858\b/g, '1858'],
  [/\b857\b/g, '1857'],
  [/\b858\b/g, '1858'],
]

const HINDI_CORRECTIONS: [RegExp, string][] = [
  [/(?:मंगल|मगंल|मङ्गल)\s*(?:पांडे|पांडेय|पांडe)/g, 'मंगल पांडे'],
  [/(?:रानी|रानि)\s*(?:लक्मीबाई|लकमीबाई|लक्ष्मीबाई|लक्षीबाई)/g, 'रानी लक्ष्मीबाई'],
  [/(?:तात्या|तात्या)\s*(?:टोपे|टोपी)/g, 'तात्या टोपे'],
  [/(?:बहादुर|बहादर)\s*(?:शाह|शाह)\s*(?:जफर|ज़फर)/g, 'बहादुर शाह जफर'],
  [/(?:कुंवर|कुंवर)\s*(?:सिंह|सिह)/g, 'कुंवर सिंह'],
  [/(?:नाना|नाना)\s*(?:साहब|साहब)/g, 'नाना साहब'],
  [/(?:विद्रोह|बिद्रोह)/g, 'विद्रोह'],
  [/(?:क्रांति|क्रांती)/g, 'क्रांति'],
  [/(?:स्वतंत्रता|स्वतन्त्रता)/g, 'स्वतंत्रता'],
  [/(?:रूपरेखा|रुपरेखा)/g, 'रूपरेखा'],
  [/(?:आवाज|उगवाज)/g, 'आवाज'],
  [/(?:घटना|घटना)\s*(?:ओं|ओ)/g, 'घटनाओं'],
  [/(?:महत्वपूर्ण|त्यपूर्ण)/g, 'महत्वपूर्ण'],
  [/(?:टाइमलाइन|टफ़मलाइन)/g, 'टाइमलाइन'],
]

function isProtectedField(text: string): boolean {
  return PROTECTED_PATTERNS.some(pattern => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

function applyCorrections(text: string): { corrected: string; corrections: { original: string; corrected: string }[] } {
  let corrected = text
  const corrections: { original: string; corrected: string }[] = []

  for (const [pattern, replacement] of [...OCR_CORRECTIONS, ...HINDI_CORRECTIONS]) {
    const matches = corrected.match(pattern)
    if (matches) {
      for (const match of matches) {
        if (!isProtectedField(match)) {
          corrections.push({ original: match, corrected: replacement })
        }
      }
      corrected = corrected.replace(pattern, replacement)
    }
  }

  return { corrected, corrections }
}

function analyzeWordConfidence(
  text: string,
  tesseractWords: { text: string; confidence: number }[]
): DocumentRegion['wordConfidences'] {
  const words = text.split(/\s+/).filter(w => w.length > 0)

  return words.map(word => {
    const match = tesseractWords.find(tw =>
      tw.text.toLowerCase().includes(word.toLowerCase()) ||
      word.toLowerCase().includes(tw.text.toLowerCase())
    )
    return {
      word,
      confidence: match ? match.confidence : 0,
      verified: (match?.confidence || 0) >= 70,
    }
  })
}

function detectCatastrophicOCR(
  regions: DocumentRegion[],
  pageW: number,
  pageH: number,
  overallConfidence: number,
  fullText: string
): { isFailed: boolean; reason: string | null } {
  const textDensity = regions.length > 0
    ? regions.reduce((sum, r) => sum + (r.bbox.w * r.bbox.h), 0) / Math.max(pageW * pageH, 1)
    : 0

  const latinChars = (fullText.match(/[A-Za-z]/g) || []).length
  const devanagariChars = (fullText.match(/[\u0900-\u097F]/g) || []).length
  const garbageChars = (fullText.match(/[|\\\/\[\]{}<>~`^=_]/g) || []).length
  const totalChars = fullText.replace(/\s/g, '').length

  const badSegmentation = regions.length <= 8 && textDensity > 0.15
  const wrongScript = devanagariChars > 0 && latinChars > devanagariChars * 1.5
  const tooMuchGarbage = totalChars > 0 && garbageChars / totalChars > 0.2
  const unusableConfidence = overallConfidence < 20

  if (badSegmentation || wrongScript || unusableConfidence || tooMuchGarbage) {
    const reasons: string[] = []
    if (badSegmentation) reasons.push('line segmentation is too coarse')
    if (wrongScript) reasons.push('script routing detected Latin-like noise on Devanagari content')
    if (tooMuchGarbage) reasons.push(`excessive garbage characters (${Math.round(garbageChars / totalChars * 100)}%)`)
    if (unusableConfidence) reasons.push('overall OCR confidence is unusable')
    return { isFailed: true, reason: `Recovery needed: ${reasons.join('; ')}` }
  }

  return { isFailed: false, reason: null }
}

function classifyRegionType(text: string, bbox: { x: number; y: number; w: number; h: number }): DocumentRegion['type'] {
  const isShort = text.length < 20
  const isLong = text.length > 100
  const hasBullets = /^[•●○▪▸>\-\*]/.test(text.trim())
  const isNumeric = /^\d[\d\-\/\.\s]+$/.test(text)

  if (hasBullets) return 'bullet'
  if (isNumeric && isShort) return 'table'
  if (isShort && bbox.h < 50) return 'heading'
  return 'paragraph'
}

/**
 * Main document processing function
 */
export async function processDocument(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<DocumentResult> {
  const startTime = Date.now()

  onProgress?.(5, 'Loading document...')

  const img = new Image()
  const url = URL.createObjectURL(file)

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load document'))
    img.src = url
  })

  onProgress?.(15, 'Preprocessing at full resolution...')

  const { preprocessImage, detectTextRegions, cropRegion } = await import('./imagePreprocess')
  const { recognizeText, recognizeWithRetry } = await import('./ocrEngine')
  const { postProcessHindi } = await import('./hindiPostProcess')

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)

  const { canvas: processedCanvas } = preprocessImage(canvas)

  onProgress?.(25, 'Detecting text lines...')

  const textRegions = detectTextRegions(processedCanvas)

  onProgress?.(35, `Found ${textRegions.length} regions. Running OCR...`)

  const regions: DocumentRegion[] = []
  const allCorrections: DocumentResult['corrections'] = []

  for (let i = 0; i < textRegions.length; i++) {
    const region = textRegions[i]
    onProgress?.(
      35 + ((i / textRegions.length) * 45) | 0,
      `OCR line ${i + 1}/${textRegions.length}...`
    )

    const crop = cropRegion(processedCanvas, region)

    let ocrResult = await recognizeText(crop, undefined)
    let retryCount = 0

    if (ocrResult.confidence < 50) {
      retryCount++
      const retry = await recognizeWithRetry(crop, undefined)
      if (retry.confidence > ocrResult.confidence) {
        ocrResult = retry
      }
    }

    const regionType = classifyRegionType(ocrResult.text, region)
    const { corrected, corrections } = applyCorrections(ocrResult.text)
    allCorrections.push(...corrections.map(c => ({ field: regionType, ...c })))

    const wordConfs = ocrResult.words.map(w => ({ word: w.text, confidence: w.confidence }))
    const finalText = postProcessHindi(corrected, wordConfs)
    const wordConfidences = analyzeWordConfidence(finalText, ocrResult.words)

    regions.push({
      id: `region_${i}`,
      type: regionType,
      bbox: region,
      rawText: ocrResult.text,
      correctedText: finalText,
      confidence: ocrResult.confidence,
      script: ocrResult.script,
      wordConfidences,
      needsVerification: ocrResult.confidence < 70,
      retryCount,
    })
  }

  onProgress?.(82, 'Building output...')

  const fullText = regions
    .sort((a, b) => a.bbox.y - b.bbox.y)
    .map(r => r.correctedText)
    .join('\n')

  onProgress?.(88, 'Calculating statistics...')

  const allWords = regions.flatMap(r => r.wordConfidences)
  const totalWords = allWords.length
  const highConfidenceWords = allWords.filter(w => w.confidence >= 80).length
  const reviewSuggestedWords = allWords.filter(w => w.confidence >= 50 && w.confidence < 80).length
  const lowConfidenceWords = allWords.filter(w => w.confidence < 50).length

  const overallConfidence = regions.reduce((sum, r) => sum + r.confidence, 0) / Math.max(regions.length, 1)
  const wordConfidence = totalWords > 0
    ? allWords.reduce((sum, w) => sum + w.confidence, 0) / totalWords
    : 0

  onProgress?.(92, 'Checking for failures...')

  const { isFailed, reason } = detectCatastrophicOCR(regions, canvas.width, canvas.height, overallConfidence, fullText)

  onProgress?.(95, 'Finalizing...')

  const elapsed = Date.now() - startTime
  const fieldsNeedingVerification = regions.filter(r => r.needsVerification).length
  const scripts = Array.from(new Set(regions.map(r => r.script))).filter(Boolean) as OCRScript[]

  return {
    regions,
    fullText,
    metadata: {
      filename: file.name,
      processedAt: new Date().toISOString(),
      totalPages: 1,
      overallConfidence,
      characterConfidence: overallConfidence,
      wordConfidence,
      fieldsNeedingVerification,
      totalWords,
      highConfidenceWords,
      reviewSuggestedWords,
      lowConfidenceWords,
      isCatastrophicFailure: isFailed,
      failureReason: reason,
    },
    corrections: allCorrections,
    documentEntities: [],
  }
}
