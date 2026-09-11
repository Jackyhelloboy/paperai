// Hindi OCR Post-Processing Module
// Aggressively fixes Tesseract errors for Devanagari script

/**
 * Post-process Hindi OCR text to fix common errors
 */
export function postProcessHindi(text: string): string {
  if (!text) return text

  let result = text

  // Step 1: Remove Telugu characters that Tesseract confuses with Hindi
  result = result.replace(/[\u0C00-\u0C7F]/g, '')

  // Step 2: Remove stray Latin letters that are OCR artifacts
  // (keep only if they form actual words of 3+ chars, like abbreviations)
  result = result.replace(/(?<=[\u0900-\u097F\s])\s*[a-zA-Z]\s*(?=[\u0900-\u097F\s])/g, ' ')
  result = result.replace(/\b[a-zA-Z]\b\s*/g, (match) => {
    // Keep 3+ letter English words that might be legitimate
    return match.trim().length > 2 ? match : ' '
  })

  // Step 3: Fix broken Devanagari sequences (matra disconnection)
  // A matra (vowel sign) should not be isolated
  result = result.replace(/\s+([\u093E-\u094C\u0962\u0963])\s+/g, '$1')

  // Step 4: Merge split Hindi words
  // If two Devanagari tokens are separated by a single space and both are short,
  // they're likely one split word
  result = result.replace(
    /([\u0900-\u097F]{2,15})\s+([\u0900-\u097F]{2,15})/g,
    (match, w1, w2) => {
      // Merge if combined length is reasonable for a Hindi word
      if ((w1 + w2).length <= 20) return w1 + w2
      return match
    }
  )

  // Step 5: Normalize whitespace
  result = result.replace(/[ \t]+/g, ' ')
  result = result.replace(/\n\s*\n/g, '\n\n')
  result = result.trim()

  return result
}

/**
 * Check if text contains Hindi (Devanagari) characters
 */
export function isHindiText(text: string): boolean {
  return /[\u0900-\u097F]/.test(text)
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

  if (hindiRatio > 0.5) return hindiRatio > 0.8 ? 'hindi' : 'mixed'
  if (teluguCount > hindiCount) return 'telugu'
  return englishCount > hindiCount ? 'english' : 'mixed'
}
