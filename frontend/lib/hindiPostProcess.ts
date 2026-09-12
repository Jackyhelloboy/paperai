// Hindi OCR Post-Processing Module
// Aggressive garbage removal + conservative correction + number/name fixing

// Comprehensive Hindi word dictionary (expanded)
const HINDI_WORDS = new Set([
  // Function words (most common)
  'की', 'के', 'का', 'में', 'से', 'पर', 'को', 'ने', 'है', 'था', 'थे', 'थी',
  'और', 'या', 'परंतु', 'इसलिए', 'अतः', 'किंतु', 'क्योंकि', 'जब', 'तब',
  'यह', 'वह', 'ये', 'वे', 'इन', 'उन', 'यहाँ', 'वहाँ',
  'हो', 'हैं', 'हुआ', 'हुई', 'हुए', 'कर', 'करें', 'किया',
  'मैं', 'तुम', 'आप', 'हम', 'वे', 'ये',
  'इस', 'उस', 'इसमें', 'उसमें', 'इसका', 'उसका',
  'तो', 'भी', 'ही', 'कि', 'जो', 'तक', 'बाद', 'पहले',
  'अब', 'फिर', 'अभी', 'वहाँ', 'यहाँ', 'कहीं',
  // Content words
  'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
  'पाठ', 'लिखूँ', 'लेखक', 'निबंध', 'सारांश', 'रचना', 'प्रक्रिया',
  'क्या', 'क्यों', 'कैसे', 'कहाँ', 'कब', 'कौन',
  'मेरा', 'मेरी', 'मेरे', 'तुम्हारा', 'तुम्हारी', 'तुम्हारे',
  'उसका', 'उसकी', 'उसके', 'इसका', 'इसकी', 'इसके',
  'होना', 'करना', 'देना', 'लेना', 'जाना', 'आना', 'कहना', 'बोलना',
  'पढ़ना', 'लिखना', 'समझना', 'जानना', 'सोचना',
  // Historical names
  'मंगल', 'पांडे', 'लक्ष्मीबाई', 'तात्या', 'टोपे',
  'नाना', 'साहब', 'भगत', 'सिंह',
  'बहादुर', 'शाह', 'जफर', 'कुंवर',
  'रानी', 'महाराजा',
  // Historical terms
  'क्रांति', 'स्वतंत्रता', 'विद्रोह', 'संघर्ष', 'देश', 'देशभक्त',
  'सैनिक', 'सेना', 'युद्ध', 'लड़ाई', 'जीत',
  'शासक', 'राजा', 'बादशाह', 'नवाब',
  'अंग्रेज', 'ब्रिटिश', 'ईस्ट', 'कंपनी', 'सरकार',
  // Education terms
  'कक्षा', 'विद्यालय', 'छात्र', 'शिक्षक', 'परीक्षा', 'प्रश्न',
  'अंक', 'गणित', 'हिंदी', 'विज्ञान', 'सामाजिक',
  'राज्य', 'प्रांत', 'जिला', 'भारत',
  'पुस्तक', 'पत्र',
  // Common words
  'तथा', 'अर्थात्', 'उपरांत', 'वर्तमान', 'भविष्य',
  'स्वयं', 'परिवार', 'समाज', 'राष्ट्र', 'धर्म',
  'घटना', 'घटनाओं', 'टाइमलाइन', 'महत्वपूर्ण',
  'प्रमुख', 'ऐतिहासिक', 'वर्ष', 'सन्',
  // Additional common words for better correction
  'आज', 'कल', 'परसों', 'सुबह', 'शाम', 'रात', 'दिन', 'रात',
  'घर', 'कमरा', 'दरवाजा', 'खिड़की', 'कुर्सी', 'मेज़',
  'पानी', 'खाना', 'रोटी', 'चावल', 'दाल', 'सब्ज़ी',
  'आदमी', 'औरत', 'बच्चा', 'बच्ची', 'लड़का', 'लड़की',
  'बड़ा', 'छोटा', 'लंबा', 'नया', 'पुराना', 'अच्छा', 'बुरा',
  'सफ़ेद', 'काला', 'लाल', 'नीला', 'हरा', 'पीला',
  'ऊपर', 'नीचे', 'बाएँ', 'दाएँ', 'सामने', 'पीछे',
  'चलो', 'आओ', 'जाओ', 'रुको', 'बैठो', 'उठो',
  'हाँ', 'नहीं', 'शायद', 'ज़रूर', 'कभी', 'हमेशा',
  // Numbers as words
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
  'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे', 'सौ',
  // Verbs
  'है', 'हैं', 'था', 'थे', 'थी', 'होगा', 'होंगे', 'होगी',
  'करता', 'करती', 'करते', 'किया', 'की', 'के',
  'जाता', 'जाती', 'जाते', 'गया', 'गई', 'गए',
  'आता', 'आती', 'आते', 'आया', 'आई', 'आए',
  'देता', 'देती', 'देते', 'दिया', 'दी', 'दिए',
  'लेता', 'लेती', 'लेते', 'लिया', 'ली', 'लिए',
  // Question words
  'क्या', 'क्यों', 'कैसे', 'कहाँ', 'कब', 'कौन', 'कितना', 'कौन सा',
  // Pronouns
  'मैं', 'तुम', 'आप', 'हम', 'वह', 'यह', 'वे', 'ये',
  'मुझे', 'तुम्हें', 'आपको', 'हमें', 'उसे', 'इसे',
  'मेरा', 'मेरी', 'मेरे', 'तुम्हारा', 'तुम्हारी', 'तुम्हारे',
  'उसका', 'उसकी', 'उसके', 'इसका', 'इसकी', 'इसके',
  'हमारा', 'हमारी', 'हमारे', 'उनका', 'उनकी', 'उनके',
  // Conjunctions
  'और', 'या', 'परंतु', 'किंतु', 'क्योंकि', 'इसलिए', 'अतः',
  'जब', 'तब', 'जो', 'तो', 'फिर', 'अगर', 'तो',
  // Prepositions
  'में', 'पर', 'से', 'को', 'के', 'की', 'का', 'ने', 'तक', 'तक',
  'बाद', 'पहले', 'साथ', 'बिना', 'लिए', 'ओर', 'की ओर',
  // Adverbs
  'बहुत', 'कम', 'ज़्यादा', 'थोड़ा', 'आधा', 'पूरा',
  'अच्छी', 'अच्छे', 'बुरी', 'बुरे',
  'जल्दी', 'धीरे', 'सीधा', 'सीधे',
  // Common phrases
  'कृपया', 'धन्यवाद', 'माफ़ कीजिए', 'स्वागत',
  'शुभकामनाएँ', 'बधाई', 'अभिवादन',
  // Numbers
  '१', '२', '३', '४', '५', '६', '७', '८', '९', '०',
  // Important verbs
  'करना', 'होना', 'जाना', 'आना', 'देना', 'लेना',
  'कहना', 'सुनना', 'देखना', 'पढ़ना', 'लिखना',
  'बोलना', 'समझना', 'जानना', 'सोचना', 'याद',
  // Common nouns
  'नाम', 'काम', 'घर', 'पैसा', 'समय', 'दिन', 'रात',
  'पानी', 'हवा', 'आग', 'धरती', 'आसमान', 'सूरज', 'चाँद',
  'फूल', 'पत्ता', 'पेड़', 'जानवर', 'पक्षी', 'मछली',
  'माँ', 'बाप', 'भाई', 'बहन', 'बेटा', 'बेटी',
  'दोस्त', 'दुश्मन', 'पड़ोसी', 'यार',
])

// Comprehensive number corrections
// Maps common OCR misreads to correct numbers
const NUMBER_CORRECTIONS: [RegExp, string][] = [
  // 1857 variants
  [/\b4857\b/g, '1857'],
  [/\b2857\b/g, '1857'],
  [/\b3857\b/g, '1857'],
  [/\b857\b/g, '1857'],
  // 1858 variants
  [/\b4858\b/g, '1858'],
  [/\b2858\b/g, '1858'],
  [/\b3858\b/g, '1858'],
  [/\b858\b/g, '1858'],
]

// Historical name corrections (visual confusions in Hindi)
const NAME_CORRECTIONS: [RegExp, string][] = [
  [/(?:मंगल|मगंल|मङ्गल)\s*(?:पांडे|पांडेय|पांडe)/g, 'मंगल पांडे'],
  [/(?:रानी|रानि)\s*(?:लक्मीबाई|लकमीबाई|लक्ष्मीबाई|लक्षीबाई)/g, 'रानी लक्ष्मीबाई'],
  [/(?:तात्या|तात्या)\s*(?:टोपे|टोपी)/g, 'तात्या टोपे'],
  [/(?:बहादुर|बहादर)\s*(?:शाह|शाह)\s*(?:जफर|ज़फर)/g, 'बहादुर शाह जफर'],
  [/(?:कुंवर|कुंवर)\s*(?:सिंह|सिह)/g, 'कुंवर सिंह'],
  [/(?:नाना|नाना)\s*(?:साहब|साहब)/g, 'नाना साहब'],
  [/(?:विद्रोह|बिद्रोह)/g, 'विद्रोह'],
  [/(?:क्रांति|क्रांती)/g, 'क्रांति'],
  [/(?:स्वतंत्रता|स्वतन्त्रता)/g, 'स्वतंत्रता'],
  [/(?:घटना|घटना)\s*(?:ओं|ओ)/g, 'घटनाओं'],
]

// Characters that are NEVER valid in Hindi/English text
const GARBAGE_CHARS = /[|\\\/\[\]{}<>~`^©®™¶§£€¥]/g

// Patterns that are clearly garbage
const GARBAGE_PATTERNS = [
  /[-=_]{3,}/g,
  /[.]{4,}/g,
  /[+]{2,}/g,
  /[*]{3,}/g,
  /[>]{2,}/g,
  /[<]{2,}/g,
  /[A-Z]{4,}/g,  // Long English uppercase sequences (likely hallucinated)
]

/**
 * Check if a text segment is garbage.
 */
function isGarbageText(text: string): boolean {
  const clean = text.replace(/[\s]/g, '')
  if (clean.length === 0) return true

  const hindiChars = (clean.match(/[\u0900-\u097F]/g) || []).length
  const latinChars = (clean.match(/[a-zA-Z]/g) || []).length
  const digitChars = (clean.match(/[0-9]/g) || []).length
  const validChars = hindiChars + latinChars + digitChars

  // Less than 40% valid = garbage
  if (validChars / clean.length < 0.4) return true

  // All uppercase English with no Hindi = likely hallucinated
  if (latinChars > 3 && hindiChars === 0 && clean === clean.toUpperCase()) return true

  return false
}

/**
 * Post-process OCR text.
 */
export function postProcessHindi(
  text: string,
  wordConfidences?: { word: string; confidence: number }[]
): string {
  if (!text) return text

  let result = text

  // Step 1: Remove garbage characters
  result = result.replace(GARBAGE_CHARS, ' ')

  // Step 2: Remove garbage patterns
  for (const pattern of GARBAGE_PATTERNS) {
    result = result.replace(pattern, ' ')
  }

  // Step 3: Fix common duplicate matras
  for (const [pattern, replacement] of COMMON_CONFUSIONS) {
    result = result.replace(pattern, replacement)
  }

  // Step 4: Fix numbers
  for (const [pattern, replacement] of NUMBER_CORRECTIONS) {
    result = result.replace(pattern, replacement)
  }

  // Step 5: Fix historical names
  for (const [pattern, replacement] of NAME_CORRECTIONS) {
    result = result.replace(pattern, replacement)
  }

  // Step 6: Normalize whitespace
  result = result.replace(/[ \t]+/g, ' ')
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n')

  // Step 7: Remove garbage lines
  result = result
    .split('\n')
    .filter(line => !isGarbageText(line))
    .join('\n')

  // Step 8: Dictionary correction on low-confidence words
  if (wordConfidences && wordConfidences.length > 0) {
    const words = result.split(/(\s+)/)
    const corrected = words.map(word => {
      if (/^\s+$/.test(word)) return word

      const conf = wordConfidences.find(wc =>
        wc.word.toLowerCase() === word.toLowerCase() ||
        word.toLowerCase().includes(wc.word.toLowerCase())
      )

      if (conf && conf.confidence < 50) {
        // Try name corrections first
        for (const [wrong, correct] of OCR_CONFUSION_MAP) {
          if (word.includes(wrong)) {
            return word.replace(wrong, correct)
          }
        }

        // Try dictionary correction
        const correctedWord = tryDictionaryCorrection(word)
        if (correctedWord !== word) return correctedWord
      }

      return word
    })

    result = corrected.join('')
  }

  result = result.trim()
  return result
}

// Common OCR confusion corrections (expanded)
const OCR_CONFUSION_MAP: [string, string][] = [
  // Historical name corrections
  ['रुपरेखा', 'रूपरेखा'],
  ['उगवाज', 'आवाज'],
  ['ऊर', 'ओर'],
  ['पुननालाल', 'पुन्नालाल'],
  ['कया', 'क्या'],
  ['लिखू', 'लिखूँ'],
  ['त्यपूर्ण', 'महत्वपूर्ण'],
  ['टन', 'घटना'],
  ['टफ़मलाइन', 'टाइमलाइन'],
  // Additional common OCR errors
  ['मगंल', 'मंगल'],
  ['मङ्गल', 'मंगल'],
  ['पांडेय', 'पांडे'],
  ['लक्मीबाई', 'लक्ष्मीबाई'],
  ['लकमीबाई', 'लक्ष्मीबाई'],
  ['लक्षीबाई', 'लक्ष्मीबाई'],
  ['बहादर', 'बहादुर'],
  ['ज़फर', 'जफर'],
  ['कुंवर', 'कुंवर'],
  ['नाना', 'नाना'],
  ['स्वतन्त्रता', 'स्वतंत्रता'],
  ['क्रांती', 'क्रांति'],
  ['विद्रोह', 'विद्रोह'],
  ['बिद्रोह', 'विद्रोह'],
  ['घटना', 'घटना'],
  ['घटनाओं', 'घटनाओं'],
  // Common matra confusion
  ['ि', 'ी'],  // short i vs long ii
  ['ु', 'ू'],  // short u vs long uu
  ['े', 'ै'],  // e vs ai
  ['ो', 'ौ'],  // o vs au
]

// Common OCR confusion pairs (always safe)
const COMMON_CONFUSIONS: [RegExp, string][] = [
  [/[\u0947\u0947]+/g, '\u0947'],
  [/[\u0940\u0940]+/g, '\u0940'],
  [/[\u0942\u0942]+/g, '\u0942'],
  [/[\u0941\u0941]+/g, '\u0941'],
  [/[\u093C\u093C]+/g, '\u093C'],
  [/\u0905\u0906/g, '\u0906'],
  [/\u0907\u0908/g, '\u0908'],
]

function tryDictionaryCorrection(word: string): string {
  const cleanWord = word.replace(/[^\u0900-\u097F]/g, '')
  if (cleanWord.length < 2) return word
  if (HINDI_WORDS.has(cleanWord)) return word

  // Try edit distance 1 first (most common OCR errors)
  let bestMatch = ''
  let bestDistance = Infinity

  for (const dictWord of HINDI_WORDS) {
    const lenDiff = Math.abs(dictWord.length - cleanWord.length)
    if (lenDiff > 1) continue

    const dist = editDistance(dictWord, cleanWord)
    if (dist < bestDistance) {
      bestDistance = dist
      bestMatch = dictWord
    }
  }

  // If edit distance is 1, it's likely an OCR error
  if (bestDistance === 1) {
    return bestMatch
  }

  // For edit distance 2, only correct if the word looks like garbage
  if (bestDistance === 2 && cleanWord.length >= 4) {
    const garbageRatio = (cleanWord.match(/[|\\\/\[\]{}<>~`^=_!@#$%^&*]/g) || []).length / cleanWord.length
    if (garbageRatio > 0.3) {
      return bestMatch
    }
  }

  return word
}

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Optimized: only use 2 rows instead of full matrix
  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[b.length]
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
  if (hindiRatio > 0.5) return hindiRatio > 0.8 ? 'hindi' : 'mixed'
  if (teluguCount > hindiCount) return 'telugu'
  return englishCount > hindiCount ? 'english' : 'mixed'
}
