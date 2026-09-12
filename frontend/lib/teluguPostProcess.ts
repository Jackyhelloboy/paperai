// Telugu OCR Post-Processing Module

const TELUGU_WORDS = new Set([
  'మరియు', 'కానీ', 'అయితే', 'కాబట్టి', 'అందువల్ల', 'ఎందుకంటే',
  'ఇది', 'అది', 'ఇవి', 'అవి', 'ఇక్కడ', 'అక్కడ',
  'నేను', 'నీవు', 'అతను', 'ఆమె', 'మేము', 'మీరు', 'వారు',
  'ఒక', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది', 'పది',
  'చదువు', 'రాయడం', 'చదవడం', 'వినడం', 'చూడడం',
  'పాఠశాల', 'పాఠ్యపుస్తకం', 'ఉపాధ్యాయుడు', 'విద్యార్థి',
  'ప్రశ్న', 'సమాధానం', 'పరీక్ష', 'అంకెలు',
  'గణితం', 'హిందీ', 'తెలుగు', 'ఆంగ్లం', 'సైన్స్',
  'రాజ్యం', 'ప్రాంతం', 'జిల్లా', 'భారతదేశం',
  'పుస్తకం', 'పత్రిక', 'వార్త',
  'మంచి', 'చెడు', 'పెద్ద', 'చిన్న', 'కొత్త', 'పాత',
  'ఎక్కువ', 'తక్కువ', 'సరైన', 'తప్పు',
  'ముందు', 'తర్వాత', 'ఇప్పుడు', 'తరువాత',
  'అవును', 'కాదు', 'బహుశా', 'తప్పక',
  'ప్రతి', 'కొన్ని', 'అన్ని', 'ఎవరైనా',
  'ఎప్పుడు', 'ఎక్కడ', 'ఎలా', 'ఎందుకు',
  'చేయడం', 'ఇవ్వడం', 'తీసుకోవడం', 'వెళ్ళడం', 'రావడం',
  'చెప్పడం', 'వినడం', 'చూడడం', 'తెలుసుకోవడం',
  'ఉండటం', 'అవడం', 'చేయగలగడం', 'కూడా',
  'లో', 'మీద', 'కింద', 'పక్కన', 'మధ్యలో',
  'నుండి', 'వరకు', 'గురించి', 'ప్రకారం',
  'తో', 'కోసం', 'చేత', 'లోని',
  'భారత', 'దేశ', 'ప్రభుత్వ', 'పాఠశాల',
  'పరీక్షలో', 'ప్రశ్నలు', 'సమాధానాలు',
  'అంకెలు', 'గణిత', 'శాస్త్ర', 'సామాజిక',
  'చరిత్ర', 'భూగోళశాస్త్ర', 'ఆంగ్ల',
  'హిందీ', 'తెలుగు', 'కన్నడ', 'తమిళ',
  'చదువు', 'విద్య', 'జ్ఞానం', 'నైపుణ్యం',
  'ఉపాధి', 'ఉద్యోగం', 'వ్యాపారం',
  'ఆరోగ్యం', 'సంతోషం', 'ప్రేమ',
  'స్నేహం', 'కుటుంబం', 'సమాజం',
])

const TELUGU_CONFUSION_MAP: [string, string][] = [
  ['ా', 'ా'],
  ['ి', 'ి'],
  ['ీ', 'ీ'],
  ['ు', 'ు'],
  ['ూ', 'ూ'],
  ['ె', 'ె'],
  ['ే', 'ే'],
  ['ై', 'ై'],
  ['ొ', 'ొ'],
  ['ో', 'ో'],
  ['ౌ', 'ౌ'],
  ['ం', 'ం'],
  ['ః', 'ః'],
  ['ఁ', 'ఁ'],
]

function isGarbageText(text: string): boolean {
  const clean = text.replace(/[\s]/g, '')
  if (clean.length === 0) return true

  const teluguChars = (clean.match(/[\u0C00-\u0C7F]/g) || []).length
  const latinChars = (clean.match(/[a-zA-Z]/g) || []).length
  const validChars = teluguChars + latinChars

  if (validChars / clean.length < 0.4) return true
  if (latinChars > 3 && teluguChars === 0 && clean === clean.toUpperCase()) return true

  return false
}

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[b.length]
}

function tryDictionaryCorrection(word: string): string {
  const cleanWord = word.replace(/[^\u0C00-\u0C7F]/g, '')
  if (cleanWord.length < 2) return word
  if (TELUGU_WORDS.has(cleanWord)) return word

  let bestMatch = ''
  let bestDistance = Infinity

  for (const dictWord of TELUGU_WORDS) {
    const lenDiff = Math.abs(dictWord.length - cleanWord.length)
    if (lenDiff > 1) continue

    const dist = editDistance(dictWord, cleanWord)
    if (dist < bestDistance) {
      bestDistance = dist
      bestMatch = dictWord
    }
  }

  if (bestDistance === 1) return bestMatch
  if (bestDistance === 2 && cleanWord.length >= 4) {
    const garbageRatio = (cleanWord.match(/[|\\\/\[\]{}<>~`^=_!@#$%^&*]/g) || []).length / cleanWord.length
    if (garbageRatio > 0.3) return bestMatch
  }

  return word
}

export function postProcessTelugu(
  text: string,
  wordConfidences?: { word: string; confidence: number }[]
): string {
  if (!text) return text

  let result = text

  // Remove garbage characters
  result = result.replace(/[|\\\/\[\]{}<>~`^©®™¶§£€¥]/g, ' ')

  // Remove garbage patterns
  result = result.replace(/[-=_]{3,}/g, ' ')
  result = result.replace(/[.]{4,}/g, ' ')
  result = result.replace(/[+]{2,}/g, ' ')

  // Normalize whitespace
  result = result.replace(/[ \t]+/g, ' ')
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n')

  // Remove garbage lines
  result = result
    .split('\n')
    .filter(line => !isGarbageText(line))
    .join('\n')

  // Dictionary correction on low-confidence words
  if (wordConfidences && wordConfidences.length > 0) {
    const words = result.split(/(\s+)/)
    const corrected = words.map(word => {
      if (/^\s+$/.test(word)) return word

      const conf = wordConfidences.find(wc =>
        wc.word.toLowerCase() === word.toLowerCase() ||
        word.toLowerCase().includes(wc.word.toLowerCase())
      )

      if (conf && conf.confidence < 50) {
        return tryDictionaryCorrection(word)
      }

      return word
    })

    result = corrected.join('')
  }

  return result.trim()
}

export function isTeluguText(text: string): boolean {
  return /[\u0C00-\u0C7F]/.test(text)
}
