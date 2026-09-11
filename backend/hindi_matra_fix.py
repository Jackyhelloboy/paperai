"""
Hindi Matra Restoration System
Restores dropped matras based on common word patterns
"""

# Common Hindi words with correct matras
WORD_CORRECTIONS = {
    # Geography terms
    "महसगर": "महासागर",
    "महदप": "महाद्वीप",
    "महदवपय": "महाद्वीपीय",
    "जवलमख": "ज्वालामुखी",
    "जवलमखय": "ज्वालामुखीय",
    "वदवन": "विद्वान",
    "सधदत": "सिद्धांत",
    "वसथपन": "विस्थापन",
    "परतपदन": "प्रतिपादन",
    "महसगरो": "महासागरों",
    "महदपो": "महाद्वीपों",
    "वतरण": "वितरण",
    "पनथलस": "पैंथालासा",
    "अलफरड": "अल्फ्रेड",
    "वगनर": "वेगनर",
    "कहलत": "कहलाता",
    "ससमगरफ": "सिस्मोग्राफ",
    "भकप": "भूकंप",
    "तरग": "तरंगे",
    
    # Common words
    "यतर": "यंत्र",
    "मधयम": "माध्यम",
    "लव": "लावा",
    "पड": "पिंड",
    "रख": "राख",
    "धनकष": "धूलकण",
    "भम": "भूमि",
    "बनन": "हिलना",
    "हमसखलन": "हिमस्खलन",
    "सकरय": "सक्रिय",
    "परसपत": "प्रसुप्त",
    "वलपत": "विलुप्त",
    
    # Education terms
    "करक": "कक्षा",
    "वदय": "विद्या",
    "परभा": "प्राथमिक",
    "मदय": "माध्यमिक",
    "उचच": "उच्च",
    "शक्ष": "शिक्षा",
    "वशव": "विश्वविद्यालय",
    
    # Science terms
    "वगयन": "विज्ञान",
    "भतगत": "भौतिक",
    "रसयन": "रसायन",
    "जव": "जीव",
    "वनसपत": "वनस्पति",
    "परकृत": "प्रकृति",
    
    # Common words with long vowels
    "कर": "कार",
    "घर": "घाट",
    "पर": "पार",
    "तर": "तार",
    "बर": "बार",
    "सर": "सार",
}

# Matra patterns - characters that often drop matras
MATRA_PATTERNS = {
    "ा": ["ा", "ा"],  # aa matra
    "ि": ["ि", "ि"],  # i matra
    "ी": ["ी", "ी"],  # ii matra
    "ु": ["ु", "ु"],  # u matra
    "ू": ["ू", "ू"],  # uu matra
    "े": ["े", "े"],  # e matra
    "ै": ["ै", "ै"],  # ai matra
    "ो": ["ो", "ो"],  # o matra
    "ौ": ["ौ", "ौ"],  # au matra
}

# Hindi consonants without matras
CONSONANTS = "कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह"

def restore_matras(text):
    """Restore dropped matras in Hindi text"""
    # Apply word corrections first
    for wrong, right in WORD_CORRECTIONS.items():
        text = text.replace(wrong, right)
    
    # Try to fix common patterns
    # Pattern: consonant + consonant (missing matra between)
    import re
    
    # Fix patterns like "महसगर" -> "महासागर"
    # Look for repeated consonant clusters that should have matras
    
    return text

def fix_compound_chars(text):
    """Fix compound character issues"""
    # Common compound char fixes
    fixes = {
        "क्ष": "क्ष",
        "त्र": "त्र",
        "ज्ञ": "ज्ञ",
        "श्र": "श्र",
    }
    
    for wrong, right in fixes.items():
        text = text.replace(wrong, right)
    
    return text

def post_process_hindi(text):
    """Complete post-processing for Hindi"""
    if not text:
        return text
    
    # Apply all corrections
    text = restore_matras(text)
    text = fix_compound_chars(text)
    
    # Clean up
    text = text.replace("  ", " ")
    
    return text


if __name__ == "__main__":
    # Test
    tests = [
        "महसगर और महदप क वतरण",
        "ससमगरफ",
        "वदवन थ",
        "जवलमख",
        "अलफरड वगनर",
    ]
    
    for t in tests:
        fixed = post_process_hindi(t)
        print(f"{t} -> {fixed}")
