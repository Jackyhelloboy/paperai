"""
Hindi NLP Toolkit - Zero Dependency
Tokenization, sentiment analysis, language detection, word frequency
"""
import re
import unicodedata
from collections import Counter
from typing import List, Dict, Tuple


# Hindi stopwords list
HINDI_STOPWORDS = {
    "और", "के", "की", "का", "इस", "में", "को", "पर", "से", "एक",
    "तो", "है", "हैं", "था", "थे", "थी", "हो", "गया", "गए", "हुआ",
    "हुए", "कर", "करना", "किया", "किए", "होना", "होता", "होते",
    "वह", "यह", "जो", "कि", "ही", "भी", "ने", "वे", "ये",
    "आग", "इस", "उस", "ऊपर", "नीचे", "बाएं", "दाएं",
    "दो", "तीन", "चार", "पांच", "ना", "नहीं", "क्या", "कैसे",
    "कब", "कहाँ", "क्यों", "अब", "तब", "फिर", "क्योंकि", "इसलिए",
    "लेकिन", "परंतु", "मगर", "अगर", "यदि", "तो", "ताकि", "जब",
    "तब", "अभी", "अभी", "अभी", "अभी", "अभी", "अभी", "अभी",
}

# Marathi stopwords
MARATHI_STOPWORDS = {
    "आणि", "चा", "ची", "चे", "या", "ते", "हा", "ही", "हे", "तो",
    "ती", "ते", "एक", "दोन", "तीन", "चार", "पाच", "आहे", "आहेत",
    "होता", "होते", "होती", "झाला", "झाले", "झाली", "करणे", "करतो",
}

# Bengali stopwords
BENGALI_STOPWORDS = {
    "এবং", "এর", "একে", "এই", "এটি", "এটা", "এবং", "বা", "অথবা",
    "যদি", "তবে", "কিন্তু", "তাই", "যে", "যা", "যার", "যাকে",
    "তার", "তাকে", "সে", "সেটি", "সেটা", "একটি", "একটা", "দুটি",
}


class HindiNLPToolkit:
    """Zero-dependency NLP toolkit for Hindi, Marathi, and Bengali"""
    
    def __init__(self):
        self.hindi_stopwords = HINDI_STOPWORDS
        self.marathi_stopwords = MARATHI_STOPWORDS
        self.bengali_stopwords = BENGALI_STOPWORDS
    
    def tokenize(self, text: str, language: str = "hindi") -> List[str]:
        """
        Split text into word tokens
        
        Args:
            text: Input text
            language: Language code ('hindi', 'marathi', 'bengali')
            
        Returns:
            List of word tokens
        """
        if not text:
            return []
        
        # Handle Devanagari punctuation
        text = re.sub(r'[।॥]', ' ', text)
        
        # Split on whitespace and punctuation
        tokens = re.findall(r'[\w\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]+', text)
        
        return tokens
    
    def remove_stopwords(self, tokens: List[str], language: str = "hindi") -> List[str]:
        """
        Remove stopwords from token list
        
        Args:
            tokens: List of tokens
            language: Language code
            
        Returns:
            Filtered tokens
        """
        if language == "hindi":
            stopwords = self.hindi_stopwords
        elif language == "marathi":
            stopwords = self.marathi_stopwords
        elif language == "bengali":
            stopwords = self.bengali_stopwords
        else:
            stopwords = self.hindi_stopwords
        
        return [token for token in tokens if token not in stopwords]
    
    def sentiment_score(self, text: str) -> Dict:
        """
        Calculate sentiment score for Hindi text
        
        Args:
            text: Input text
            
        Returns:
            Dictionary with sentiment scores
        """
        # Simple rule-based sentiment analysis
        positive_words = {
            "अच्छा", "बढ़िया", "शानदार", "प्रशंसा", "खुशी", "प्रसन्न",
            "सफल", "जीत", "विजय", "सम्मान", "प्रेम", "स्नेह", "दया",
            "करुणा", "सुंदर", "मधुर", "मीठा", "प्यारा", "हर्ष", "आनंद",
            "सकारात्मक", "उत्साह", "प्रेरणा", "सफलता", "समृद्धि",
        }
        
        negative_words = {
            "बुरा", "खराब", "दुख", "कष्ट", "पीड़ा", "रोना", "विलाप",
            "असफल", "हार", "पराजय", "अपमान", "घृणा", "द्वेष", "क्रोध",
            "कुपित", "बिगड़ा", "विनाश", "विपत्ति", "आपदा", "संकट",
            "नकारात्मक", "निराश", "हताश", "कठिन", "मुश्किल",
        }
        
        tokens = self.tokenize(text)
        
        pos_count = sum(1 for token in tokens if token in positive_words)
        neg_count = sum(1 for token in tokens if token in negative_words)
        total = len(tokens)
        
        if total == 0:
            return {"positive": 0.0, "negative": 0.0, "neutral": 1.0}
        
        pos_score = pos_count / total
        neg_score = neg_count / total
        neutral_score = 1.0 - pos_score - neg_score
        
        return {
            "positive": round(pos_score, 3),
            "negative": round(neg_score, 3),
            "neutral": round(max(0, neutral_score), 3),
            "label": "positive" if pos_score > neg_score else "negative" if neg_score > pos_score else "neutral"
        }
    
    def detect_language(self, text: str) -> str:
        """
        Detect the language of input text
        
        Args:
            text: Input text
            
        Returns:
            Detected language
        """
        if not text:
            return "unknown"
        
        # Count character ranges
        devanagari = 0
        bengali = 0
        latin = 0
        
        for char in text:
            code = ord(char)
            if 0x0900 <= code <= 0x097F:
                devanagari += 1
            elif 0x0980 <= code <= 0x09FF:
                bengali += 1
            elif 0x0041 <= code <= 0x005A or 0x0061 <= code <= 0x007A:
                latin += 1
        
        total = devanagari + bengali + latin
        
        if total == 0:
            return "unknown"
        
        # Check for mixed Hinglish
        if devanagari > 0 and latin > 0:
            if devanagari / total > 0.3 and latin / total > 0.3:
                return "mixed_hinglish"
        
        if devanagari / total > 0.5:
            return "hindi_devanagari"
        elif bengali / total > 0.5:
            return "bengali"
        elif latin / total > 0.5:
            return "latin"
        
        return "mixed"
    
    def word_frequency(self, text: str, language: str = "hindi", 
                       include_stopwords: bool = False) -> Dict[str, int]:
        """
        Get word frequency distribution
        
        Args:
            text: Input text
            language: Language code
            include_stopwords: Whether to include stopwords
            
        Returns:
            Dictionary of word frequencies
        """
        tokens = self.tokenize(text, language)
        
        if not include_stopwords:
            tokens = self.remove_stopwords(tokens, language)
        
        return dict(Counter(tokens))
    
    def extract_keywords(self, text: str, language: str = "hindi", 
                        top_n: int = 10) -> List[Tuple[str, int]]:
        """
        Extract top keywords from text
        
        Args:
            text: Input text
            language: Language code
            top_n: Number of keywords to extract
            
        Returns:
            List of (keyword, frequency) tuples
        """
        freq = self.word_frequency(text, language, include_stopwords=False)
        sorted_freq = sorted(freq.items(), key=lambda x: x[1], reverse=True)
        return sorted_freq[:top_n]
    
    def split_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences
        
        Args:
            text: Input text
            
        Returns:
            List of sentences
        """
        # Split on Devanagari danda and standard punctuation
        sentences = re.split(r'[।॥.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def normalize(self, text: str) -> str:
        """
        Normalize Hindi text
        
        Args:
            text: Input text
            
        Returns:
            Normalized text
        """
        if not text:
            return text
        
        # Unicode normalization
        text = unicodedata.normalize("NFC", text)
        
        # Remove zero-width characters
        text = re.sub(r'[\u200B\u200C\u200D\uFEFF]', '', text)
        
        # Fix repeated punctuation
        text = re.sub(r'([।॥.!?])\1+', r'\1', text)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def transliterate_to_devanagari(self, text: str) -> str:
        """
        Basic Hinglish (Roman) to Devanagari conversion
        
        Args:
            text: Romanized Hindi text
            
        Returns:
            Devanagari text
        """
        # Basic phonetic mapping
        mapping = {
            'a': 'अ', 'aa': 'आ', 'i': 'इ', 'ee': 'ई', 'u': 'उ', 'oo': 'ऊ',
            'e': 'ए', 'ai': 'ऐ', 'o': 'ओ', 'au': 'औ',
            'ka': 'क', 'kha': 'ख', 'ga': 'ग', 'gha': 'घ', 'nga': 'ङ',
            'cha': 'च', 'chha': 'छ', 'ja': 'ज', 'jha': 'झ', 'nya': 'ञ',
            'ta': 'त', 'tha': 'थ', 'da': 'द', 'dha': 'ध', 'na': 'न',
            'pa': 'प', 'pha': 'फ', 'ba': 'ब', 'bha': 'भ', 'ma': 'म',
            'ya': 'य', 'ra': 'र', 'la': 'ल', 'va': 'व', 'sha': 'श',
            'sa': 'स', 'ha': 'ह', 'ksha': 'क्ष', 'tra': 'त्र', 'gya': 'ज्ञ',
        }
        
        result = text.lower()
        for roman, devanagari in sorted(mapping.items(), key=lambda x: -len(x[0])):
            result = result.replace(roman, devanagari)
        
        return result
    
    def text_summary(self, text: str, language: str = "hindi") -> Dict:
        """
        Generate a complete text analysis summary
        
        Args:
            text: Input text
            language: Language code
            
        Returns:
            Dictionary with full analysis
        """
        tokens = self.tokenize(text, language)
        sentences = self.split_sentences(text)
        keywords = self.extract_keywords(text, language, 5)
        sentiment = self.sentiment_score(text)
        lang_detected = self.detect_language(text)
        
        # Calculate average words per sentence
        avg_words = len(tokens) / len(sentences) if sentences else 0
        
        return {
            "word_count": len(tokens),
            "sentence_count": len(sentences),
            "unique_words": len(set(tokens)),
            "top_keywords": keywords,
            "sentiment": sentiment,
            "detected_language": lang_detected,
            "avg_words_per_sentence": round(avg_words, 2),
        }


def demo():
    """Demo function to test Hindi NLP Toolkit"""
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    print("=" * 60)
    print("Hindi NLP Toolkit Demo (Zero Dependencies)")
    print("=" * 60)
    
    toolkit = HindiNLPToolkit()
    
    test_text = "भारत एक महान देश है। यहाँ की संस्कृति बहुत प्राचीन है।"
    
    print(f"\nInput Text: {test_text}")
    print("-" * 40)
    
    # Tokenization
    tokens = toolkit.tokenize(test_text)
    print(f"Tokens: {tokens}")
    
    # Language detection
    lang = toolkit.detect_language(test_text)
    print(f"Detected Language: {lang}")
    
    # Sentiment
    sentiment = toolkit.sentiment_score(test_text)
    print(f"Sentiment: {sentiment}")
    
    # Keywords
    keywords = toolkit.extract_keywords(test_text, top_n=5)
    print(f"Keywords: {keywords}")
    
    # Summary
    summary = toolkit.text_summary(test_text)
    print(f"\nSummary:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    
    print("-" * 40)


if __name__ == "__main__":
    demo()
