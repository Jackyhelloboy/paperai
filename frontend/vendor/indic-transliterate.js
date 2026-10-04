/**
 * indic-transliterate.js — Phonetic Transliteration Engine for Indian Languages
 * 
 * A zero-dependency, fully offline library that converts English (Roman) text to
 * 12 Indian languages using phonetic rules. Works via script tag or ES module import.
 *
 * @version 1.0.0
 * @license MIT
 * @see https://indic-transliteration.netlify.app
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);                          // AMD
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();                   // CommonJS / Node
  } else {
    root.IndicTransliterate = factory();          // Browser global
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ===========================================================
  //  INTERNAL: Devanagari transliteration tables
  // ===========================================================

  var HALANT = '\u094D';

  var CONSONANTS = {
    'ksh': '\u0915\u094D\u0937', 'gny': '\u091C\u094D\u091E',
    'shr': '\u0936\u094D\u0930', 'chh': '\u091B', 'shh': '\u0937',
    'kh': '\u0916', 'gh': '\u0918', 'ng': '\u0919', 'ch': '\u091A',
    'jh': '\u091D', 'Th': '\u0920', 'th': '\u0925', 'Dh': '\u0922',
    'dh': '\u0927', 'ph': '\u092B', 'bh': '\u092D', 'Sh': '\u0937',
    'sh': '\u0936', 'Rh': '\u0922\u093C',
    'k': '\u0915', 'g': '\u0917', 'c': '\u091A', 'j': '\u091C',
    'T': '\u091F', 'D': '\u0921', 'N': '\u0923', 't': '\u0924',
    'd': '\u0926', 'n': '\u0928', 'p': '\u092A', 'b': '\u092C',
    'm': '\u092E', 'y': '\u092F', 'r': '\u0930', 'l': '\u0932',
    'v': '\u0935', 'w': '\u0935', 's': '\u0938', 'h': '\u0939',
    'f': '\u092B\u093C', 'z': '\u091C\u093C', 'q': '\u0915\u093C',
    'x': '\u0915\u094D\u0937', 'R': '\u0921\u093C'
  };

  var VOWELS = {
    'au': ['\u0914', '\u094C'], 'ai': ['\u0910', '\u0948'],
    'aa': ['\u0906', '\u093E'], 'ee': ['\u0908', '\u0940'],
    'ii': ['\u0908', '\u0940'], 'oo': ['\u090A', '\u0942'],
    'uu': ['\u090A', '\u0942'],
    'a': ['\u0905', ''],       'i': ['\u0907', '\u093F'],
    'u': ['\u0909', '\u0941'], 'e': ['\u090F', '\u0947'],
    'o': ['\u0913', '\u094B'],
    'A': ['\u0906', '\u093E'], 'I': ['\u0908', '\u0940'],
    'U': ['\u090A', '\u0942'], 'E': ['\u090F', '\u0947'],
    'O': ['\u0913', '\u094B']
  };

  var MODIFIERS = {
    '||': '\u0965', '|': '\u0964',
    'M': '\u0902', '~': '\u0901', ':': '\u0903'
  };

  var C_KEYS = Object.keys(CONSONANTS).sort(function (a, b) { return b.length - a.length; });
  var V_KEYS = Object.keys(VOWELS).sort(function (a, b) { return b.length - a.length; });
  var M_KEYS = Object.keys(MODIFIERS).sort(function (a, b) { return b.length - a.length; });

  // ===========================================================
  //  INTERNAL: Core transliteration
  // ===========================================================

  function toDevanagari(input) {
    var result = '', i = 0, afterConsonant = false, len = input.length;

    while (i < len) {
      if (input[i] === '\\' && i + 1 < len) {
        result += input[i + 1]; afterConsonant = false; i += 2; continue;
      }

      var matched = false, sub, ki;

      for (ki = 0; ki < M_KEYS.length; ki++) {
        var mk = M_KEYS[ki];
        if (i + mk.length <= len && input.substr(i, mk.length) === mk) {
          result += MODIFIERS[mk]; afterConsonant = false; i += mk.length; matched = true; break;
        }
      }
      if (matched) continue;

      var bestC = null, bestCLen = 0, bestV = null, bestVLen = 0;

      for (ki = 0; ki < C_KEYS.length; ki++) {
        var ck = C_KEYS[ki];
        if (i + ck.length <= len && input.substr(i, ck.length) === ck) {
          bestC = ck; bestCLen = ck.length; break;
        }
      }
      for (ki = 0; ki < V_KEYS.length; ki++) {
        var vk = V_KEYS[ki];
        if (i + vk.length <= len && input.substr(i, vk.length) === vk) {
          bestV = vk; bestVLen = vk.length; break;
        }
      }

      if (bestC && bestCLen >= bestVLen) {
        if (afterConsonant) result += HALANT;
        result += CONSONANTS[bestC]; afterConsonant = true; i += bestCLen;
      } else if (bestV) {
        var pair = VOWELS[bestV];
        result += afterConsonant ? pair[1] : pair[0];
        afterConsonant = false; i += bestVLen;
      } else {
        result += input[i]; afterConsonant = false; i++;
      }
    }
    return result;
  }

  // ===========================================================
  //  INTERNAL: Script conversion
  // ===========================================================

  var SCRIPT_BASES = {
    devanagari: 0x0900, bengali: 0x0980, gurmukhi: 0x0A00,
    gujarati: 0x0A80, odia: 0x0B00, tamil: 0x0B80,
    telugu: 0x0C00, kannada: 0x0C80, malayalam: 0x0D00
  };

  var DIGIT_BASES = {
    devanagari: 0x0966, bengali: 0x09E6, gurmukhi: 0x0A66,
    gujarati: 0x0AE6, odia: 0x0B66, tamil: 0x0BE6,
    telugu: 0x0C66, kannada: 0x0CE6, malayalam: 0x0D66,
    urdu: 0x06F0, kashmiri: 0x06F0
  };

  function convertDigits(text, scriptKey) {
    var base = scriptKey.indexOf('-') > -1 ? scriptKey.split('-')[0] : scriptKey;
    var digitBase = DIGIT_BASES[base];
    if (!digitBase) return text;
    return text.replace(/[0-9]/g, function (d) {
      return String.fromCodePoint(digitBase + parseInt(d, 10));
    });
  }

  var TF = {};
  TF[0x0916] = 0x0B95; TF[0x0917] = 0x0B95; TF[0x0918] = 0x0B95;
  TF[0x091B] = 0x0B9A; TF[0x091D] = 0x0B9A;
  TF[0x0920] = 0x0B9F; TF[0x0921] = 0x0B9F; TF[0x0922] = 0x0B9F;
  TF[0x0925] = 0x0BA4; TF[0x0926] = 0x0BA4; TF[0x0927] = 0x0BA4;
  TF[0x092B] = 0x0BAA; TF[0x092C] = 0x0BAA; TF[0x092D] = 0x0BAA;

  // Urdu (Perso-Arabic): Devanagari codepoint -> Urdu string
  var URDU = {};
  // Vowels (independent)
  URDU[0x0905] = '\u0627'; URDU[0x0906] = '\u0622'; URDU[0x0907] = '\u0627\u0650';
  URDU[0x0908] = '\u0627\u06CC'; URDU[0x0909] = '\u0627\u064F'; URDU[0x090A] = '\u0627\u0648';
  URDU[0x090F] = '\u0627\u06CC'; URDU[0x0910] = '\u0627\u06CC';
  URDU[0x0913] = '\u0627\u0648'; URDU[0x0914] = '\u0627\u0648';
  // Vowel matras
  URDU[0x093E] = '\u0627'; URDU[0x093F] = '\u0650'; URDU[0x0940] = '\u06CC';
  URDU[0x0941] = '\u064F'; URDU[0x0942] = '\u0648'; URDU[0x0947] = '\u06CC';
  URDU[0x0948] = '\u06CC'; URDU[0x094B] = '\u0648'; URDU[0x094C] = '\u0648';
  // Consonants
  URDU[0x0915] = '\u06A9'; URDU[0x0916] = '\u062E'; URDU[0x0917] = '\u06AF';
  URDU[0x0918] = '\u063A'; URDU[0x0919] = '\u0646\u06AF'; URDU[0x091A] = '\u0686';
  URDU[0x091B] = '\u0686\u06BE'; URDU[0x091C] = '\u062C'; URDU[0x091D] = '\u062C\u06BE';
  URDU[0x091E] = '\u0646'; URDU[0x091F] = '\u0679'; URDU[0x0920] = '\u0679\u06BE';
  URDU[0x0921] = '\u0688'; URDU[0x0922] = '\u0688\u06BE'; URDU[0x0923] = '\u0646';
  URDU[0x0924] = '\u062A'; URDU[0x0925] = '\u062A\u06BE'; URDU[0x0926] = '\u062F';
  URDU[0x0927] = '\u062F\u06BE'; URDU[0x0928] = '\u0646'; URDU[0x092A] = '\u067E';
  URDU[0x092B] = '\u0641'; URDU[0x092C] = '\u0628'; URDU[0x092D] = '\u0628\u06BE';
  URDU[0x092E] = '\u0645'; URDU[0x092F] = '\u06CC'; URDU[0x0930] = '\u0631';
  URDU[0x0932] = '\u0644'; URDU[0x0935] = '\u0648'; URDU[0x0936] = '\u0634';
  URDU[0x0937] = '\u0634'; URDU[0x0938] = '\u0633'; URDU[0x0939] = '\u06C1';
  // Special
  URDU[0x093C] = ''; URDU[0x094D] = ''; URDU[0x0902] = '\u0646';
  URDU[0x0901] = '\u06BA'; URDU[0x0903] = '';
  URDU[0x0964] = '\u06D4'; URDU[0x0965] = '\u06D4\u06D4';
  // Nukta'd consonant overrides: consonant + nukta → different Urdu letter
  var URDU_NUKTA = {};
  URDU_NUKTA[0x091C] = '\u0632';       // ज़ -> ze
  URDU_NUKTA[0x0915] = '\u0642';       // क़ -> qaf
  URDU_NUKTA[0x0921] = '\u0691';       // ड़ -> rre
  URDU_NUKTA[0x0922] = '\u0691\u06BE'; // ढ़ -> rrhe
  URDU_NUKTA[0x092B] = '\u0641';       // फ़ -> fe
  URDU_NUKTA[0x0917] = '\u063A';       // ग़ -> ghain
  URDU_NUKTA[0x0916] = '\u062E';       // ख़ -> khe

  // Kashmiri (Perso-Arabic / Nastaliq)
  var KASHMIRI = {};
  KASHMIRI[0x0905] = '\u0627\u064E'; KASHMIRI[0x0906] = '\u0622'; KASHMIRI[0x0907] = '\u0627\u0650';
  KASHMIRI[0x0908] = '\u0627\u06CC\u0656'; KASHMIRI[0x0909] = '\u0627\u064F'; KASHMIRI[0x090A] = '\u0627\u0648';
  KASHMIRI[0x090F] = '\u06CC\u06CC'; KASHMIRI[0x0910] = '\u0627\u06CC';
  KASHMIRI[0x0913] = '\u0627\u0648'; KASHMIRI[0x0914] = '\u0627\u064E\u0648';
  KASHMIRI[0x093E] = '\u0627'; KASHMIRI[0x093F] = '\u0650'; KASHMIRI[0x0940] = '\u06CC\u0656';
  KASHMIRI[0x0941] = '\u064F'; KASHMIRI[0x0942] = '\u0648'; KASHMIRI[0x0947] = '\u06CC';
  KASHMIRI[0x0948] = '\u06CC'; KASHMIRI[0x094B] = '\u0648'; KASHMIRI[0x094C] = '\u064E\u0648';
  KASHMIRI[0x0915] = '\u06A9'; KASHMIRI[0x0916] = '\u062E'; KASHMIRI[0x0917] = '\u06AF';
  KASHMIRI[0x0918] = '\u063A'; KASHMIRI[0x0919] = '\u0646\u06AF'; KASHMIRI[0x091A] = '\u0686';
  KASHMIRI[0x091B] = '\u0686\u06BE'; KASHMIRI[0x091C] = '\u062C'; KASHMIRI[0x091D] = '\u062C\u06BE';
  KASHMIRI[0x091E] = '\u0646'; KASHMIRI[0x091F] = '\u0679'; KASHMIRI[0x0920] = '\u0679\u06BE';
  KASHMIRI[0x0921] = '\u0688'; KASHMIRI[0x0922] = '\u0688\u06BE'; KASHMIRI[0x0923] = '\u0646';
  KASHMIRI[0x0924] = '\u062A'; KASHMIRI[0x0925] = '\u062A\u06BE'; KASHMIRI[0x0926] = '\u062F';
  KASHMIRI[0x0927] = '\u062F\u06BE'; KASHMIRI[0x0928] = '\u0646'; KASHMIRI[0x092A] = '\u067E';
  KASHMIRI[0x092B] = '\u0641'; KASHMIRI[0x092C] = '\u0628'; KASHMIRI[0x092D] = '\u0628\u06BE';
  KASHMIRI[0x092E] = '\u0645'; KASHMIRI[0x092F] = '\u06CC'; KASHMIRI[0x0930] = '\u0631';
  KASHMIRI[0x0932] = '\u0644'; KASHMIRI[0x0935] = '\u0648'; KASHMIRI[0x0936] = '\u0634';
  KASHMIRI[0x0937] = '\u0634'; KASHMIRI[0x0938] = '\u0633'; KASHMIRI[0x0939] = '\u06C1';
  KASHMIRI[0x093C] = ''; KASHMIRI[0x094D] = ''; KASHMIRI[0x0902] = '\u0646';
  KASHMIRI[0x0901] = '\u06BA'; KASHMIRI[0x0903] = '';
  KASHMIRI[0x0964] = '\u06D4'; KASHMIRI[0x0965] = '\u06D4\u06D4';
  var KASHMIRI_NUKTA = {};
  KASHMIRI_NUKTA[0x091C] = '\u0632'; KASHMIRI_NUKTA[0x0915] = '\u0642';
  KASHMIRI_NUKTA[0x0921] = '\u0691'; KASHMIRI_NUKTA[0x0922] = '\u0691\u06BE';
  KASHMIRI_NUKTA[0x092B] = '\u0641'; KASHMIRI_NUKTA[0x0917] = '\u063A';
  KASHMIRI_NUKTA[0x0916] = '\u062E';

  function toScript(devText, scriptKey) {
    var base = scriptKey.indexOf('-') > -1 ? scriptKey.split('-')[0] : scriptKey;
    if (base === 'devanagari') return devText;

    // Urdu / Kashmiri: Perso-Arabic character map with nukta look-ahead
    var _arMap = null, _arNukta = null;
    if (base === 'urdu')     { _arMap = URDU; _arNukta = URDU_NUKTA; }
    if (base === 'kashmiri') { _arMap = KASHMIRI; _arNukta = KASHMIRI_NUKTA; }
    if (_arMap) {
      var uOut = '';
      for (var ui = 0; ui < devText.length; ui++) {
        var uc = devText.codePointAt(ui);
        if (ui + 1 < devText.length && devText.codePointAt(ui + 1) === 0x093C && _arNukta[uc]) {
          uOut += _arNukta[uc]; ui++;
        } else if (_arMap[uc] !== undefined) { uOut += _arMap[uc]; }
        else if (uc >= 0x0900 && uc <= 0x097F) { /* skip unmapped */ }
        else { uOut += devText[ui]; }
      }
      return uOut;
    }

    var targetBase = SCRIPT_BASES[base];
    if (!targetBase) return devText;
    var isTamil = (base === 'tamil'), out = '';
    for (var ci = 0; ci < devText.length; ci++) {
      var code = devText.codePointAt(ci);
      if (code >= 0x0900 && code <= 0x097F) {
        if (isTamil) {
          if (code === 0x093C) continue;
          if (TF[code]) { out += String.fromCodePoint(TF[code]); continue; }
        }
        out += String.fromCodePoint(targetBase + (code - 0x0900));
      } else {
        out += devText[ci];
      }
    }
    return out;
  }

  // ===========================================================
  //  INTERNAL: Variant generation
  // ===========================================================

  function _generateVariants(word, scriptKey) {
    if (!word || word.length < 1) return [];
    var lc = word.toLowerCase();
    var raw = [];
    function add(input) { raw.push(toScript(toDevanagari(input), scriptKey)); }

    var de = lc.replace(/([bcdfghjklmnpqrstvwxyz])\1/g, '$1');
    var hasDbl = (de !== lc);
    if (hasDbl) { add(de); add(lc); } else { add(lc); }

    var bases = hasDbl ? [lc, de] : [lc];
    bases.forEach(function (b) {
      var v;
      v = b.replace(/e/g, 'ai');            if (v !== b) add(v);
      v = b.replace(/e/g, 'a');             if (v !== b) add(v);
      v = b.replace(/i/g, 'ee');            if (v !== b) add(v);
      v = b.replace(/o/g, 'au');            if (v !== b) add(v);
      v = b.replace(/a(?![aiou])/g, 'aa');  if (v !== b) add(v);
      v = b.replace(/u/g, 'oo');            if (v !== b) add(v);
    });

    var seen = {}, unique = [];
    raw.forEach(function (t) { if (!seen[t]) { seen[t] = true; unique.push(t); } });
    var results = unique.slice(0, 5);
    if (!seen[word]) results.push(word);
    return results.slice(0, 6);
  }

  // ===========================================================
  //  PUBLIC API
  // ===========================================================

  /**
   * List of supported script keys.
   * Use these as the `script` parameter in transliterate() etc.
   */
  var SUPPORTED_SCRIPTS = [
    'devanagari', 'bengali', 'gurmukhi', 'gujarati', 'odia',
    'tamil', 'telugu', 'kannada', 'malayalam', 'urdu', 'kashmiri'
  ];

  return {
    /** Library version */
    version: '1.0.0',

    /** Array of supported script keys */
    scripts: SUPPORTED_SCRIPTS,

    /**
     * Transliterate English (phonetic Roman) text to an Indic script.
     *
     * @param {string} input  — English text to transliterate
     * @param {string} [script='devanagari'] — Target script key
     * @returns {string} Transliterated text
     *
     * @example
     * IndicTransliterate.transliterate('namaste', 'devanagari')
     * // → 'नमस्ते'
     *
     * IndicTransliterate.transliterate('namaste', 'bengali')
     * // → 'নমস্তে'
     */
    transliterate: function (input, script) {
      var s = script || 'devanagari';
      return convertDigits(toScript(toDevanagari(input || ''), s), s);
    },

    /**
     * Transliterate to Devanagari only (no script conversion step).
     *
     * @param {string} input — English text
     * @returns {string} Devanagari text
     */
    toDevanagari: function (input) {
      return toDevanagari(input || '');
    },

    /**
     * Convert Devanagari text to another Indic script.
     * Useful when you already have Devanagari and want cross-script output.
     *
     * @param {string} devanagariText — Text in Devanagari
     * @param {string} script — Target script key
     * @returns {string} Converted text
     */
    convertScript: function (devanagariText, script) {
      return toScript(devanagariText || '', script || 'devanagari');
    },

    /**
     * Generate multiple transliteration variants for a single word.
     * Returns up to 6 options (useful for IME-style suggestion dropdowns).
     *
     * @param {string} word — Single English word
     * @param {string} [script='devanagari'] — Target script key
     * @returns {string[]} Array of variant transliterations
     *
     * @example
     * IndicTransliterate.suggest('hello', 'devanagari')
     * // → ['हेलो', 'हेल्लो', 'हैलो', …, 'hello']
     */
    suggest: function (word, script) {
      return _generateVariants(word || '', script || 'devanagari');
    }
  };

}));
