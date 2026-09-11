"""
Hindi Post-Processing & Correction System
Fixes common OCR errors and improves accuracy
"""

# Common Hindi OCR error corrections
CORRECTIONS = {
    # Common word corrections
    "राप्य": "राज्य",
    "निपुरा": "त्रिपुरा",
    "यमन": "यनम",
    "अखणाचल": "अरुणाचल",
    "डुराज्य": "तीन राज्य",
    "इखंड": "डूरंड",
    "पक्सितान": "पाकिस्तान",
    "गुजर": "गुजरात",
    "मिजोर": "मिजोरम",
    "निकोपा": "नागालैंड",
    "पुडुचेरी": "पुडुचेरी",
    "आाध": "आन्ध्र",
    
    # Geography terms
    "क्षेत्रफल": "क्षेत्रफल",
    "समुद्र": "समुद्र",
    "तटीय": "तटीय",
    "लम्बाई": "लंबाई",
    "द्वीप": "द्वीप",
    "प्रदेश": "प्रदेश",
    
    # Numbers and measurements
    "sq km": "sq km",
    "Sqkm": "sq km",
    "km": "km",
    
    # Common place names
    "नारकोडम": "नारकोंडम",
    "अंडमान": "अंडमान",
    "निकोबार": "निकोबार",
    "लक्षद्वीप": "लक्षद्वीप",
    "दमन": "दमन",
    "दीव": "दीव",
}

# Hindi word dictionary for validation
HINDI_WORDS = {
    "राज्य", "भारत", "प्रदेश", "जिला", "तहसील", "तालुका",
    "नदी", "पहाड़", "पर्वत", "सागर", "महासागर", "द्वीप",
    "सीमा", "सीमांत", "तट", "तटरेखा", "उत्तर", "दक्षिण",
    "पूर्व", "पश्चिम", "मध्य", "क्षेत्रफल", "जनसंख्या",
    "राजधानी", "शहर", "गांव", "कस्बा", "पट्टन", "नगर",
    "किला", "मंदिर", "मस्जिद", "गिरजाघर", "विहार",
    "नाला", "नहर", "बांध", "झील", "तालाब", "कुआं",
    "सड़क", "मार्ग", "पुल", "रेल", "हवाई अड्डा",
}

def post_process(text):
    """Post-process OCR output to fix common errors"""
    if not text:
        return text
    
    # Apply corrections
    for wrong, right in CORRECTIONS.items():
        text = text.replace(wrong, right)
    
    # Fix spacing issues
    text = text.replace("  ", " ")
    
    # Fix common punctuation
    text = text.replace("।", "।")
    
    return text

def validate_hindi(text):
    """Check if text contains valid Hindi"""
    words = text.split()
    hindi_count = sum(1 for w in words if any('\u0900' <= c <= '\u097F' for c in w))
    return hindi_count / max(len(words), 1)

def clean_ocr_output(text):
    """Clean OCR output - PRESERVES Hindi matras, fractions, and degree symbols"""
    import re
    import unicodedata
    
    # NFC normalization first
    text = unicodedata.normalize("NFC", text)
    
    # Safe regex: preserve Devanagari, Latin, digits, fractions, degree, common symbols
    # Added: ½ ¼ ¾ ° and block elements for table borders
    text = re.sub(
        r'[^\u0900-\u097F\u0A00-\u0A7F\u0980-\u09FFA-Za-z0-9\s.,;:!?()\-½¼¾°±×÷=<>≤≥≠≈₹$%#@&*+/\\|{}[\]\'"~`^]',
        '', text
    )
    
    # Fix multiple spaces
    text = re.sub(r'\s+', ' ', text)
    
    return text.strip()


if __name__ == "__main__":
    # Test
    test = "भारत में 28 राप्य, 8 के. स. राप्य हैं। कुल क्षेत्रफल 3287263 Sqkm है।"
    print("Original:", test)
    print("Fixed:", post_process(test))
