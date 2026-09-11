"""
Hindi Spell Checker - Conservative version
Only corrects obvious errors, never touches short/common words
"""
import re
import unicodedata

# ONLY words that are clearly wrong and need fixing
# Do NOT include short words like की, के, का, से, और, पर, को, है, था, etc.
SAFE_CORRECTIONS = {
    # Clearly wrong -> correct (only if OCR output matches)
    "भकप": "भूकंप",
    "महसगर": "महासागर",
    "महदप": "महाद्वीप",
    "जवलमख": "ज्वालामुखी",
    "ससमगरफ": "सिस्मोग्राफ",
    "वतरण": "वितरण",
    "पनथलस": "पैंथालासा",
    "अलफरड": "अल्फ्रेड",
    "वगनर": "वेगनर",
    "परभव": "प्रभाव",
    "परमख": "प्रमुख",
    "परकर": "प्रकार",
    "उतपत": "उत्पत्ति",
    "उतपति": "उत्पत्ति",
    "सधदत": "सिद्धांत",
    "वसथपन": "विस्थापन",
    "परतपदन": "प्रतिपादन",
    "यतर": "यंत्र",
    "मधयम": "माध्यम",
    "धनकष": "धूलकण",
    "हमसखलन": "हिमसखलन",
    "सकरय": "सक्रिय",
    "परसपत": "प्रसुप्त",
    "वलपत": "विलुप्त",
    "वदवन": "विद्वान",
    "बीनना": "हिलना",
    "बीनन": "हिलन",
    "धनकषा": "धूलकण",
    "महदीपो": "महाद्वीपों",
    "गतििि": "गति",
    "लगाना": "लगना",
}

# Words that should NEVER be changed
SAFE_WORDS = {
    "वह", "यह", "जो", "कि", "तो", "ही", "भी", "से", "को", "पर",
    "में", "ने", "का", "की", "के", "और", "या", "एक", "दो", "तीन",
    "है", "हैं", "था", "थे", "थी", "हो", "गया", "गए", "हुआ", "हुए",
    "कर", "करना", "किया", "किए", "होना", "होता", "होते",
    "आग", "वह", "इस", "उस", "यह", "वे", "ये",
    "पर", "ऊपर", "नीचे", "बाएं", "दाएं",
    "दो", "तीन", "चार", "पांच",
}

def safe_correct(text):
    """Only fix obvious OCR errors, never touch common words"""
    if not text:
        return text
    
    words = text.split()
    result = []
    
    for word in words:
        # Skip English/numbers
        if re.match(r'^[A-Za-z0-9.,;:!?()\-/]+$', word):
            result.append(word)
            continue
        
        # Skip date placeholders
        if word.startswith("__DATE"):
            result.append(word)
            continue
        
        # Skip if word is in safe list
        if word in SAFE_WORDS:
            result.append(word)
            continue
        
        # Skip short words (3 chars or less) - too risky to correct
        if len(word) <= 3:
            result.append(word)
            continue
        
        # Only apply safe corrections
        if word in SAFE_CORRECTIONS:
            result.append(SAFE_CORRECTIONS[word])
        else:
            result.append(word)
    
    return " ".join(result)


if __name__ == "__main__":
    # Test - these should NOT be changed
    tests = [
        "वह यंत्र जिसके माध्यम से भूकंप की गति",
        "भूकंप का प्रभाव है",
        "आग लगना",
        "महासागर और महाद्वीपों का वितरण",
    ]
    
    for t in tests:
        fixed = safe_correct(t)
        print(f"Input:  {t}")
        print(f"Output: {fixed}")
        print(f"Same:   {t == fixed}")
        print()
