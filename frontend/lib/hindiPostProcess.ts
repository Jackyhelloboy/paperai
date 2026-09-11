// Hindi OCR Post-Processing Module
// Aggressively cleans Tesseract output for Devanagari text

/**
 * Post-process Hindi OCR text - strip everything that isn't Devanagari
 */
export function postProcessHindi(text: string): string {
  if (!text) return text

  let result = text

  // Step 1: Remove ALL non-Devanagari characters except digits, spaces, newlines, and basic punctuation
  // Keep: Devanagari (0900-097F), digits (0030-0039), spaces, newlines, basic punctuation
  result = result.replace(/[^\u0900-\u097F0-9\s.,;:!?\-'"()।॥०-९]/g, ' ')

  // Step 2: Remove isolated single characters that are likely artifacts
  result = result.replace(/\b[a-zA-Z]\b/g, ' ')

  // Step 3: Remove lines that are mostly non-Hindi
  const lines = result.split('\n')
  const cleanLines = lines.map(line => {
    const hindiCount = (line.match(/[\u0900-\u097F]/g) || []).length
    const totalChars = line.replace(/\s/g, '').length
    // If less than 30% Hindi characters, the line is mostly garbage
    if (totalChars > 0 && hindiCount / totalChars < 0.3) return ''
    return line
  })
  result = cleanLines.join('\n')

  // Step 4: Normalize whitespace
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
