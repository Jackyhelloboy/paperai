"""
Self-Improving Hindi OCR System
- Large dictionaries
- Letter-level comparison
- Error logging & learning
- Confidence-based correction
"""
import json
import os
import re
import unicodedata
from difflib import SequenceMatcher
from collections import Counter

DATA_DIR = "D:/Paper Ai/training_data"
ERROR_LOG = os.path.join(DATA_DIR, "error_log.json")
LEARNED_WORDS = os.path.join(DATA_DIR, "learned_words.json")
os.makedirs(DATA_DIR, exist_ok=True)

# ==================== DICTIONARIES ====================

HINDI_DICT = set()

# Geography
HINDI_DICT.update([
    "भूकंप", "सिस्मोग्राफ", "ज्वालामुखी", "धूलकण", "हिमस्खलन",
    "सक्रिय", "प्रसुप्त", "विलुप्त", "महासागर", "महाद्वीप",
    "महाद्वीपों", "पृथ्वी", "उत्पत्ति", "अल्फ्रेड", "वेगनर",
    "महाद्वीपीय", "विस्थापन", "सिद्धांत", "पैंजिया", "पैंथालासा",
    "निर्माण", "प्रतिपादन", "वितरण", "प्रभाव", "प्रमुख", "प्रकार",
    "यंत्र", "माध्यम", "गति", "तरंगे", "मापी", "जाती", "कहलाता",
    "लावा", "पिंड", "राख", "भूमि", "हिलना", "आग", "लगना",
    "क्षेत्रफल", "जनसंख्या", "विद्वान", "शिक्षा", "विद्या",
    "प्राथमिक", "माध्यमिक", "उच्च", "विश्वविद्यालय",
    "दिल्ली", "मुंबई", "कोलकाता", "चेन्नई", "बेंगलुरु",
    "अंडमान", "निकोबार", "लक्षद्वीप", "त्रिपुरा", "नागालैंड",
    "मणिपुर", "मिजोरम", "अरुणाचल", "पुडुचेरी", "चंडीगढ़",
    "पाकिस्तान", "चीन", "नेपाल", "भूटान", "बांग्लादेश", "म्यांमार",
    "जर्मनी", "रूस", "अमेरिका", "ब्रिटेन", "फ्रांस", "जापान",
    "ऑस्ट्रेलिया", "कनाडा", "ब्राजील", "अर्जेंटीना",
    "उत्तर", "दक्षिण", "पूर्व", "पश्चिम", "मध्य",
    "नदी", "पहाड़", "पर्वत", "द्वीप", "तट", "समुद्र",
    "राज्य", "जिला", "शहर", "गांव", "देश",
])

# Science
HINDI_DICT.update([
    "विज्ञान", "भौतिक", "रसायन", "जीव", "वनस्पति", "प्रकृति",
    "बिजली", "प्रकाश", "ध्वनि", "ऊष्मा", "ताप", "�र्जा",
    "परमाणु", "अणु", "तत्व", "मिश्रण", "द्रव्य", "पदार्थ",
])

# Common verbs/adjectives
HINDI_DICT.update([
    "है", "हैं", "था", "थे", "थी", "हो", "गया", "गए", "हुआ", "हुए",
    "करना", "होना", "जाना", "आना", "देना", "लेना", "कहना",
    "अच्छा", "बुरा", "बड़ा", "छोटा", "लंबा", "पतला", "मोटा",
    "नया", "पुराना", "गर्म", "ठंडा", "सूखा", "गीला",
    "सफेद", "काला", "लाल", "नीला", "हरा", "पीला",
])

# Short words - DO NOT CORRECT THESE
SAFE_WORDS = {
    "वह", "यह", "जो", "कि", "तो", "ही", "भी", "से", "को", "पर",
    "में", "ने", "का", "की", "के", "और", "या", "एक", "दो", "तीन",
    "है", "हैं", "था", "थे", "थी", "हो", "गया", "गए", "हुआ", "हुए",
    "कर", "करना", "किया", "किए", "होना", "होता", "होते",
    "आग", "वह", "इस", "उस", "यह", "वे", "ये",
    "पर", "ऊपर", "नीचे", "बाएं", "दाएं",
    "ना", "नहीं", "क्या", "कैसे", "कब", "कहाँ", "क्यों",
}

# ==================== LEARNED WORDS ====================

def load_learned_words():
    """Load previously learned word corrections"""
    if os.path.exists(LEARNED_WORDS):
        with open(LEARNED_WORDS, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_learned_words(words):
    """Save learned word corrections"""
    with open(LEARNED_WORDS, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

# ==================== ERROR LOGGING ====================

def log_error(ocr_text, correct_text, context=""):
    """Log an error for learning"""
    errors = []
    if os.path.exists(ERROR_LOG):
        with open(ERROR_LOG, "r", encoding="utf-8") as f:
            errors = json.load(f)
    
    errors.append({
        "ocr": ocr_text,
        "correct": correct_text,
        "context": context,
        "timestamp": __import__('time').time()
    })
    
    with open(ERROR_LOG, "w", encoding="utf-8") as f:
        json.dump(errors, f, ensure_ascii=False, indent=2)

def learn_correction(ocr_word, correct_word):
    """Learn a word correction for future use"""
    learned = load_learned_words()
    learned[ocr_word] = correct_word
    save_learned_words(learned)

# ==================== LETTER-LEVEL ANALYSIS ====================

def analyze_word(word):
    """Analyze Hindi word structure - consonants, matras, etc."""
    analysis = {
        "consonants": [],
        "matras": [],
        "vowels": [],
        "halants": 0,
        "anusvara": 0,
        "length": len(word)
    }
    
    for ch in word:
        code = ord(ch)
        if 0x0915 <= code <= 0x0939:  # Consonants
            analysis["consonants"].append(ch)
        elif 0x093E <= code <= 0x094D:  # Matras
            analysis["matras"].append(ch)
        elif 0x0905 <= code <= 0x0914:  # Vowels
            analysis["vowels"].append(ch)
        elif code == 0x094D:  # Halant
            analysis["halants"] += 1
        elif code == 0x0902:  # Anusvara
            analysis["anusvara"] += 1
    
    return analysis

def compare_words(ocr_word, dict_word):
    """Compare words at letter level"""
    ocr_analysis = analyze_word(ocr_word)
    dict_analysis = analyze_word(dict_word)
    
    # Check consonant match
    ocr_consonants = "".join(ocr_analysis["consonants"])
    dict_consonants = "".join(dict_analysis["consonants"])
    
    consonant_similarity = SequenceMatcher(None, ocr_consonants, dict_consonants).ratio()
    
    # Check matra count
    matra_diff = abs(len(ocr_analysis["matras"]) - len(dict_analysis["matras"]))
    
    return {
        "consonant_similarity": consonant_similarity,
        "matra_difference": matra_diff,
        "overall": consonant_similarity * (1.0 - matra_diff * 0.1)
    }

# ==================== CORRECTION SYSTEM ====================

def get_candidates(word, max_dist=2):
    """Get correction candidates with letter analysis"""
    candidates = []
    
    # Direct lookup
    if word in HINDI_DICT:
        return [(word, 1.0, "exact")]
    
    # Check learned words
    learned = load_learned_words()
    if word in learned:
        return [(learned[word], 0.95, "learned")]
    
    # Find matches
    for dict_word in HINDI_DICT:
        if abs(len(word) - len(dict_word)) > max_dist:
            continue
        
        # Letter-level comparison
        comparison = compare_words(word, dict_word)
        
        # String similarity
        str_sim = SequenceMatcher(None, word, dict_word).ratio()
        
        # Combined score
        score = comparison["overall"] * 0.4 + str_sim * 0.6
        
        if score > 0.6:
            candidates.append((dict_word, score, f"consonant_sim={comparison['consonant_similarity']:.2f}"))
    
    candidates.sort(key=lambda x: -x[1])
    return candidates[:5]

def correct_word(word, confidence_threshold=0.7):
    """Correct a word with confidence check"""
    # Skip safe words
    if word in SAFE_WORDS:
        return word, 1.0, "safe"
    
    # Skip short words (too risky)
    if len(word) <= 2:
        return word, 0.5, "short"
    
    # Skip English/numbers
    if re.match(r'^[A-Za-z0-9.,;:!?()\-/]+$', word):
        return word, 1.0, "english"
    
    # Get candidates
    candidates = get_candidates(word)
    
    if candidates:
        best, score, method = candidates[0]
        
        # Only correct if confident AND the word is clearly wrong
        if score >= confidence_threshold and score > 0.8:
            # Don't correct if the original is already a valid word
            if word not in HINDI_DICT:
                return best, score, method
    
    return word, 0.5, "unchanged"

def post_process(text):
    """Main post-processing with confidence-based correction"""
    if not text:
        return text
    
    # Unicode normalization
    text = unicodedata.normalize("NFC", text)
    
    # Safe character filtering
    text = re.sub(
        r'[^\u0900-\u097F\u0A00-\u0A7F\u0980-\u09FFA-Za-z0-9\s.,;:!?()\-/]',
        '', text
    )
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Word-level correction
    words = text.split()
    corrected = []
    
    for word in words:
        new_word, confidence, method = correct_word(word)
        corrected.append(new_word)
    
    return " ".join(corrected)


if __name__ == "__main__":
    # Test
    tests = [
        "वह यंत्र जिसके माध्यम से भूकंप की गति",
        "भकप महसगर जवलमख",
        "धूनकपा बीलना आगमनाना",
        "पैन्थालासा किसे कहा गया",
    ]
    
    for t in tests:
        fixed = post_process(t)
        print(f"Input:  {t}")
        print(f"Output: {fixed}")
        print()
