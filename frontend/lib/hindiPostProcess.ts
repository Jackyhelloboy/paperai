// Conservative OCR post-processing for Hindi/English mixed documents.
// The previous implementation deleted every non-Devanagari character, which
// damaged valid English headings, abbreviations, question labels and numbers.

function devanagariRatio(text: string): number {
  const letters = (text.match(/[A-Za-z\u0900-\u097F]/g) || []).length
  if (!letters) return 0
  return (text.match(/[\u0900-\u097F]/g) || []).length / letters
}

const COMMON_VALID_ACRONYMS = new Set([
  'UPSC', 'PSC', 'SSC', 'PET', 'IAS', 'IPS', 'CBSE', 'ICSE', 'NCERT',
  'MCQ', 'EM', 'PM', 'AM', 'GST', 'RBI', 'NITI', 'UDISE',
])

function cleanHindiDominantLine(line: string): string {
  if (devanagariRatio(line) < 0.55) return line

  // Remove isolated all-caps Latin artifacts only on clearly Hindi-dominant
  // lines. This targets common OCR noise such as FE/TU/WER without deleting
  // legitimate mixed-language sentences or MCQ option labels A/B/C/D.
  return line
    .split(/(\s+)/)
    .filter(token => {
      const stripped = token.replace(/[^A-Za-z]/g, '')
      if (!stripped) return true
      if (/^[A-D]$/.test(stripped)) return true
      if (COMMON_VALID_ACRONYMS.has(stripped.toUpperCase())) return true
      if (/^[A-Z]{2,4}$/.test(stripped)) return false
      return true
    })
    .join('')
}

/**
 * Clean OCR text without inventing words or destroying mixed-script content.
 * Semantic spelling correction belongs in a later confidence-aware stage.
 */
export function postProcessHindi(text: string): string {
  if (!text) return text

  let result = text.normalize('NFC')

  // Remove control characters but retain normal tabs/newlines.
  result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

  // Normalize common Unicode punctuation variants while preserving meaning.
  result = result
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')

  const cleanedLines = result.split('\n').map(rawLine => {
    let line = rawLine
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.;:!?।॥])/g, '$1')
      .replace(/([([{])\s+/g, '$1')
      .replace(/\s+([)\]}])/g, '$1')
      .trim()

    line = cleanHindiDominantLine(line)

    // Trim obvious border/rule debris only at line edges. Do not strip symbols
    // from the middle because arrows/options/math may be legitimate content.
    line = line
      .replace(/^[|_~`^<>\\]+\s*/, '')
      .replace(/\s*[|_~`^<>\\]+$/, '')
      .trim()

    return line
  })

  result = cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return result
}

export function isHindiText(text: string): boolean {
  return /[\u0900-\u097F]/.test(text)
}

export function detectLanguage(text: string): 'hindi' | 'telugu' | 'english' | 'mixed' {
  const hindiCount = (text.match(/[\u0900-\u097F]/g) || []).length
  const teluguCount = (text.match(/[\u0C00-\u0C7F]/g) || []).length
  const englishCount = (text.match(/[a-zA-Z]/g) || []).length

  const total = hindiCount + teluguCount + englishCount
  if (total === 0) return 'english'

  const hindiRatio = hindiCount / total
  const teluguRatio = teluguCount / total
  const englishRatio = englishCount / total

  if (hindiRatio >= 0.75) return 'hindi'
  if (teluguRatio >= 0.75) return 'telugu'
  if (englishRatio >= 0.75) return 'english'
  return 'mixed'
}
