// Hindi OCR Post-Processing Module
// Fixes common Tesseract errors for Devanagari script

// Common Hindi words that OCR often misreads
const HINDI_COMMON_WORDS: Record<string, string> = {
  // Question paper keywords
  'प्रश': 'प्रश्न',
  'प्रश्': 'प्रश्न',
  'श्': 'श्न',
  'उत्': 'उत्तर',
  'विद्': 'विद्यार्थी',
  'परी': 'परीक्षा',
  'परीक': 'परीक्षा',
  'अंक': 'अंक',
  'अं': 'अंक',
  'समय': 'समय',
  'नंबर': 'नंबर',
  'कक्षा': 'कक्षा',
  'श्रेणी': 'श्रेणी',
  'विषय': 'विषय',
  'भाग': 'भाग',
  'पूर्ण': 'पूर्ण',
  // Common question words
  'लिखिए': 'लिखिए',
  'दीजिए': 'दीजिए',
  'बताइए': 'बताइए',
  'समझाइए': 'समझाइए',
  'चुनिए': 'चुनिए',
  'सही': 'सही',
  'गलत': 'गलत',
  'नहीं': 'नहीं',
}

/**
 * Post-process Hindi OCR text to fix common errors
 */
export function postProcessHindi(text: string): string {
  if (!text) return text

  let result = text

  // Step 1: Fix common word-level errors
  for (const [wrong, correct] of Object.entries(HINDI_COMMON_WORDS)) {
    if (wrong !== correct) {
      result = result.replace(new RegExp(escapeRegex(wrong), 'g'), correct)
    }
  }

  // Step 2: Fix spacing issues (Hindi words often get split)
  result = fixHindiSpacing(result)

  // Step 3: Remove isolated English characters that are OCR artifacts
  result = removeArtifacts(result)

  // Step 4: Fix Devanagari punctuation
  result = fixDevanagariPunctuation(result)

  // Step 5: Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim()

  return result
}

function fixHindiSpacing(text: string): string {
  return text.replace(/([\u0900-\u097F])\s+([\u0900-\u097F])/g, '$1$2')
}

function removeArtifacts(text: string): string {
  return text.replace(/([\u0900-\u097F])\s+[a-zA-Z]\s+([\u0900-\u097F])/g, '$1 $2')
}

function fixDevanagariPunctuation(text: string): string {
  let result = text
  result = result.replace(/[?？]/g, '?')
  result = result.replace(/\.\s*$/g, '।')
  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if text contains Hindi (Devanagari) characters
 */
export function isHindiText(text: string): boolean {
  const hindiRegex = /[\u0900-\u097F]/
  return hindiRegex.test(text)
}

/**
 * Detect dominant language in text
 */
export function detectLanguage(text: string): 'hindi' | 'telugu' | 'english' | 'mixed' {
  const hindiCount = (text.match(/[\u0900-\u097F]/g) || []).length
  const teluguCount = (text.match(/[\u0C00-\u0C7F]/g) || []).length
  const englishCount = (text.match(/[a-zA-Z]/g) || []).length

  const total = hindiCount + teluguCount + englishCount
  if (total === 0) return 'english'

  const hindiRatio = hindiCount / total
  const teluguRatio = teluguCount / total
  const englishRatio = englishCount / total

  if (hindiRatio > 0.5) return hindiRatio > 0.8 ? 'hindi' : 'mixed'
  if (teluguRatio > 0.5) return teluguRatio > 0.8 ? 'telugu' : 'mixed'
  return englishRatio > 0.7 ? 'english' : 'mixed'
}
