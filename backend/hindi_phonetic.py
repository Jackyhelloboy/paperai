"""
Hindi Phonetic Post-Processor
Restores matras using Hindi grammar rules
"""
import re

# Hindi vowel marks (matras) that attach to consonants
MATRAS = {
    'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'an', 'ः': 'ah'
}

# Common Hindi words - consonant skeleton -> full word
# This maps what OCR captures (without matras) to correct form
COMMON_WORDS = {
    # Geography
    "महसगर": "महासागर",
    "महसगरो": "महासागरों",
    "महदप": "महाद्वीप",
    "महदपो": "महाद्वीपों",
    "महदवपय": "महाद्वीपीय",
    "भकप": "भूकंप",
    "जवलमख": "ज्वालामुखी",
    "ससमगरफ": "सिस्मोग्राफ",
    "वतरण": "वितरण",
    "पनथलस": "पैंथालासा",
    "अलफरड": "अल्फ्रेड",
    "वगनर": "वेगनर",
    "जरमन": "जर्मनी",
    
    # Actions/states
    "यतर": "यंत्र",
    "मधयम": "माध्यम",
    "गत": "गति",
    "तरग": "तरंगे",
    "मप": "मापी",
    "जत": "जाती",
    "कहलत": "कहलाता",
    "लव": "लावा",
    "पड": "पिंड",
    "रख": "राख",
    "धनकष": "धूलकण",
    "भम": "भूमि",
    "बनन": "हिलना",
    "हमसखलन": "हिमसखलन",
    "सकरय": "सक्रिय",
    "परसपत": "प्रसुप्त",
    "वलपत": "विलुप्त",
    "पथव": "पृथ्वी",
    "उतपत": "उत्पत्ति",
    "परभव": "प्रभाव",
    "परमख": "प्रमुख",
    "परकर": "प्रकार",
    "नमन": "निम्न",
    "धरत": "धरती",
    "आग": "आग",
    
    # Science
    "वगयन": "विज्ञान",
    "भतगत": "भौतिक",
    "रसयन": "रसायन",
    "वनसपत": "वनस्पति",
    "परकृत": "प्रकृति",
    "सधदत": "सिद्धांत",
    "वसथपन": "विस्थापन",
    "परतपदन": "प्रतिपादन",
    
    # Places
    "दहल": "दिल्ली",
    "मुबई": "मुंबई",
    "कलकत": "कलकत्ता",
    "चन्नई": "चेन्नई",
    "बेगलुर": "बेंगलुरु",
    
    # People/things
    "वदवन": "विद्वान",
    "शक्ष": "शिक्षा",
    "वदय": "विद्या",
    "परभा": "प्राथमिक",
    "मदय": "माध्यमिक",
    "उचच": "उच्च",
    "वशव": "विश्वविद्यालय",
    
    # Time
    "अरब": "अरब",
    "करब": "खरब",
    
    # Common words
    "घर": "घर",
    "कर": "कार",
    "पर": "पर",
    "तर": "तर",
    "बर": "बर",
    "सर": "सर",
    "मर": "मर",
    "हर": "हर",
    "दर": "दर",
    "पथ": "पथ",
    "मथ": "मथ",
    "सथ": "सथ",
    "रथ": "रथ",
    "हथ": "हथ",
    "अथ": "अथ",
    "ध": "ध",
    "भ": "भ",
    "प": "प",
    "फ": "फ",
    "ब": "ब",
    "म": "म",
    "य": "य",
    "र": "र",
    "ल": "ल",
    "व": "व",
    "स": "स",
    "श": "श",
    "ष": "ष",
    "ह": "ह",
    "न": "न",
    "त": "त",
    "द": "द",
    "थ": "थ",
    "ध": "ध",
    "क": "क",
    "ग": "ग",
    "घ": "घ",
    "च": "च",
    "ज": "ज",
    "झ": "झ",
    "ट": "ट",
    "ड": "ड",
    "ण": "ण",
}

# Words that should have long 'aa' matra
AA_WORDS = ["महासागर", "महाद्वीप", "ज्वालामुखी", "माध्यम", "गति", "तरंगे", "मापी", "जाती"]

def restore_matras(text):
    """Restore matras using dictionary lookup"""
    if not text:
        return text
    
    words = text.split()
    result = []
    
    for word in words:
        # Check direct dictionary match
        if word in COMMON_WORDS:
            result.append(COMMON_WORDS[word])
        else:
            # Try partial matches
            fixed = word
            for wrong, right in COMMON_WORDS.items():
                if wrong in fixed:
                    fixed = fixed.replace(wrong, right)
            result.append(fixed)
    
    return " ".join(result)

def fix_vowel_lengths(text):
    """Try to fix vowel length issues"""
    # Common patterns where long vowels get shortened
    patterns = [
        (r'महसगर', 'महासागर'),
        (r'महदप', 'महाद्वीप'),
        (r'भकप', 'भूकंप'),
        (r'जवलमख', 'ज्वालामुखी'),
        (r'गत\b', 'गति'),
        (r'तरग', 'तरंगे'),
        (r'मप', 'मापी'),
        (r'जत', 'जाती'),
    ]
    
    for pattern, replacement in patterns:
        text = re.sub(pattern, replacement, text)
    
    return text

def post_process_hindi(text):
    """Complete Hindi post-processing"""
    if not text:
        return text
    
    # Apply dictionary corrections
    text = restore_matras(text)
    
    # Apply regex patterns
    text = fix_vowel_lengths(text)
    
    # Clean up
    text = text.replace("  ", " ")
    
    return text


if __name__ == "__main__":
    # Test
    tests = [
        "वह यतर जसक मधयम स भकप क गत तथ तरग मप जत ह कहलत ह?",
        "ससमगरफ",
        "महसगर और महदप क वतरण",
        "जवलमख क परमख परकर ह?",
        "अलफरड वगनर",
        "पथव क उतपत",
    ]
    
    for t in tests:
        fixed = post_process_hindi(t)
        print(f"OCR: {t}")
        print(f"Fixed: {fixed}")
        print()
