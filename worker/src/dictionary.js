// Conservative dictionary shim for PaperAI literal-transcription mode.
// The OCR pipeline must not "correct" a student's/source document into more natural language.
// Keep this module intentionally non-destructive until a human-verified dictionary dataset is added.

export const DICTIONARY = Object.freeze({});
export const CONFUSION_PAIRS = Object.freeze({});

export function getDictionaryWords() {
  return Object.keys(DICTIONARY);
}

export function isInDictionary(word) {
  return typeof word === 'string' && word.trim().length > 0;
}

export function verifyWord(word) {
  return {
    word,
    is_valid: true,
    suggested_correction: null,
    reason: 'literal_transcription_mode'
  };
}

export function getSuggestions(_text) {
  return [];
}

export function autoCorrect(text) {
  return {
    text: text || '',
    corrections: []
  };
}
