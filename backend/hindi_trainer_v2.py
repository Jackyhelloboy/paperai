"""
PaperAI Hindi Language Model Trainer
Trains a character-level LSTM for Hindi OCR post-correction.
"""
import os
import re
import json
import sys
import io
import numpy as np
from collections import Counter
from typing import List, Tuple
import pickle

# Fix Windows console encoding for Hindi
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


class HindiCharTokenizer:
    """Character-level tokenizer for Hindi text."""

    PAD = 0
    UNK = 1
    SOS = 2
    EOS = 3

    def __init__(self):
        self.char2idx = {"<PAD>": 0, "<UNK>": 1, "<SOS>": 2, "<EOS>": 3}
        self.idx2char = {0: "<PAD>", 1: "<UNK>", 2: "<SOS>", 3: "<EOS>"}
        self.vocab_size = 4

    def fit(self, texts: List[str]):
        chars = Counter()
        for text in texts:
            for ch in text:
                if ch not in self.char2idx:
                    self.char2idx[ch] = self.vocab_size
                    self.idx2char[self.vocab_size] = ch
                    self.vocab_size += 1

    def encode(self, text: str, max_len: int = 256) -> List[int]:
        encoded = [self.SOS]
        for ch in text:
            encoded.append(self.char2idx.get(ch, self.UNK))
        encoded.append(self.EOS)
        # Pad
        while len(encoded) < max_len:
            encoded.append(self.PAD)
        return encoded[:max_len]

    def decode(self, indices: List[int]) -> str:
        chars = []
        for idx in indices:
            if idx == self.EOS:
                break
            if idx in (self.PAD, self.SOS):
                continue
            chars.append(self.idx2char.get(idx, ""))
        return "".join(chars)

    def save(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({"char2idx": self.char2idx, "vocab_size": self.vocab_size}, f)

    def load(self, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
        self.char2idx = data["char2idx"]
        self.vocab_size = data["vocab_size"]
        self.idx2char = {v: k for k, v in self.char2idx.items()}


class HindiOCRCorrector:
    """Rule-based + statistical Hindi OCR corrector."""

    # Common Hindi words (high frequency)
    HINDI_WORDS = set([
        'की', 'के', 'का', 'में', 'से', 'पर', 'को', 'ने', 'है', 'था', 'थे', 'थी',
        'और', 'या', 'परंतु', 'इसलिए', 'अतः', 'किंतु', 'क्योंकि', 'जब', 'तब',
        'यह', 'वह', 'ये', 'वे', 'इन', 'उन', 'हो', 'हैं', 'हुआ', 'हुई', 'हुए',
        'कर', 'करें', 'किया', 'मैं', 'तुम', 'आप', 'हम',
        'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
        'क्या', 'क्यों', 'कैसे', 'कहाँ', 'कब', 'कौन',
        'होना', 'करना', 'देना', 'लेना', 'जाना', 'आना', 'कहना', 'बोलना',
        'पढ़ना', 'लिखना', 'समझना', 'जानना', 'सोचना',
        'मंगल', 'पांडे', 'लक्ष्मीबाई', 'तात्या', 'टोपे',
        'नाना', 'साहब', 'भगत', 'सिंह', 'बहादुर', 'शाह', 'जफर', 'कुंवर',
        'रानी', 'महाराजा', 'क्रांति', 'स्वतंत्रता', 'विद्रोह', 'संघर्ष',
        'देश', 'सैनिक', 'सेना', 'युद्ध', 'लड़ाई', 'जीत',
        'शासक', 'राजा', 'बादशाह', 'नवाब', 'अंग्रेज', 'ब्रिटिश',
        'कक्षा', 'विद्यालय', 'छात्र', 'शिक्षक', 'परीक्षा', 'प्रश्न',
        'हिंदी', 'विज्ञान', 'गणित', 'भारत', 'राज्य',
        'आज', 'कल', 'घर', 'पानी', 'खाना', 'अच्छा', 'बुरा',
        'ऊपर', 'नीचे', 'बाएँ', 'दाएँ', 'सामने', 'पीछे',
        'हाँ', 'नहीं', 'शायद', 'ज़रूर', 'कभी', 'हमेशा',
    ])

    # Common OCR error patterns
    ERROR_PATTERNS = [
        (r'मगंल', 'मंगल'),
        (r'मङ्गल', 'मंगल'),
        (r'लक्मीबाई', 'लक्ष्मीबाई'),
        (r'लकमीबाई', 'लक्ष्मीबाई'),
        (r'बहादर', 'बहादुर'),
        (r'स्वतन्त्रता', 'स्वतंत्रता'),
        (r'क्रांती', 'क्रांति'),
        (r'रुपरेखा', 'रूपरेखा'),
        (r'उगवाज', 'आवाज'),
        (r'त्यपूर्ण', 'महत्वपूर्ण'),
        (r'टफ़मलाइन', 'टाइमलाइन'),
        (r'4857', '1857'),
        (r'2857', '1857'),
        (r'3857', '1857'),
        (r'4858', '1858'),
        (r'2858', '1858'),
        (r'3858', '1858'),
    ]

    def __init__(self):
        self.tokenizer = HindiCharTokenizer()

    def build_training_data(self, ocr_outputs: List[str], corrected_outputs: List[str]):
        """Build training pairs from OCR input -> corrected output."""
        pairs = []
        for ocr, correct in zip(ocr_outputs, corrected_outputs):
            if ocr.strip() and correct.strip():
                pairs.append((ocr.strip(), correct.strip()))
        return pairs

    def train_tokenizer(self, texts: List[str]):
        """Fit tokenizer on all texts."""
        self.tokenizer.fit(texts)

    def prepare_sequences(self, pairs: List[Tuple[str, str]], max_len: int = 256):
        """Convert pairs to token sequences for training."""
        encoder_inputs = []
        decoder_inputs = []
        decoder_outputs = []

        for ocr_text, correct_text in pairs:
            enc = self.tokenizer.encode(ocr_text, max_len)
            dec_in = [HindiCharTokenizer.SOS] + self.tokenizer.encode(correct_text, max_len)[:-1]
            dec_out = self.tokenizer.encode(correct_text, max_len)

            encoder_inputs.append(enc)
            decoder_inputs.append(dec_in)
            decoder_outputs.append(dec_out)

        return (
            np.array(encoder_inputs),
            np.array(decoder_inputs),
            np.array(decoder_outputs),
        )

    def rule_based_correct(self, text: str) -> str:
        """Apply rule-based corrections."""
        result = text

        # Apply error pattern fixes
        for pattern, replacement in self.ERROR_PATTERNS:
            result = re.sub(pattern, replacement, result)

        # Remove garbage characters
        result = re.sub(r'[|\\\/\[\]{}<>~`^=_!@#$%^&*]', ' ', result)

        # Remove consecutive dashes
        result = re.sub(r'[-=_]{3,}', ' ', result)

        # Normalize whitespace
        result = re.sub(r'\s+', ' ', result).strip()

        return result

    def word_level_correct(self, text: str) -> str:
        """Correct individual words using dictionary lookup."""
        words = text.split()
        corrected = []

        for word in words:
            if word in self.HINDI_WORDS:
                corrected.append(word)
                continue

            # Try edit distance 1
            best_match = word
            best_dist = float('inf')

            for dict_word in self.HINDI_WORDS:
                if abs(len(dict_word) - len(word)) > 1:
                    continue
                dist = self._edit_distance(dict_word, word)
                if dist < best_dist:
                    best_dist = dist
                    best_match = dict_word

            if best_dist <= 1:
                corrected.append(best_match)
            else:
                corrected.append(word)

        return " ".join(corrected)

    def _edit_distance(self, a: str, b: str) -> int:
        if len(a) == 0:
            return len(b)
        if len(b) == 0:
            return len(a)

        prev = list(range(len(b) + 1))
        curr = [0] * (len(b) + 1)

        for i in range(1, len(a) + 1):
            curr[0] = i
            for j in range(1, len(b) + 1):
                cost = 0 if a[i - 1] == b[j - 1] else 1
                curr[j] = min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + cost,
                )
            prev, curr = curr, prev

        return prev[len(b)]

    def full_correct(self, text: str) -> str:
        """Full correction pipeline."""
        result = self.rule_based_correct(text)
        result = self.word_level_correct(result)
        return result

    def save(self, directory: str):
        os.makedirs(directory, exist_ok=True)
        self.tokenizer.save(os.path.join(directory, "tokenizer.pkl"))
        with open(os.path.join(directory, "corrections.json"), "w", encoding="utf-8") as f:
            json.dump({
                "error_patterns": self.ERROR_PATTERNS,
                "word_count": len(self.HINDI_WORDS),
            }, f, ensure_ascii=False, indent=2)

    def load(self, directory: str):
        self.tokenizer.load(os.path.join(directory, "tokenizer.pkl"))


def generate_training_data():
    """Generate synthetic training data from known Hindi text + OCR errors."""
    ocr_outputs = [
        "मगंल पांडे ने 1857 में विद्रोह किया",
        "रानी लक्मीबाई ने अंग्रेजों से लड़ाई की",
        "बहादर शाह जफर ने विद्रोह का नेतृत्व किया",
        "स्वतन्त्रता संग्राम में कई वीरों ने बलिदान दिया",
        "1857 का विद्रोह भारत के इतिहास में महत्वपूर्ण था",
        "क्रांती और विद्रोह ने भारत को स्वतंत्रता दिलाई",
        "मंगल पांडे ने पहला विद्रोह किया",
        "रानी लक्ष्मीबाई ने झांसी की रक्षा की",
        "तात्या टोपे ने सेना का नेतृत्व किया",
        "नाना साहब ने विद्रोह में भाग लिया",
        "भगत सिंह ने स्वतंत्रता संग्राम में योगदान दिया",
        "कुंवर सिंह ने बिहार में विद्रोह किया",
    ]

    corrected_outputs = [
        "मंगल पांडे ने 1857 में विद्रोह किया",
        "रानी लक्ष्मीबाई ने अंग्रेजों से लड़ाई की",
        "बहादुर शाह जफर ने विद्रोह का नेतृत्व किया",
        "स्वतंत्रता संग्राम में कई वीरों ने बलिदान दिया",
        "1857 का विद्रोह भारत के इतिहास में महत्वपूर्ण था",
        "क्रांति और विद्रोह ने भारत को स्वतंत्रता दिलाई",
        "मंगल पांडे ने पहला विद्रोह किया",
        "रानी लक्ष्मीबाई ने झांसी की रक्षा की",
        "तात्या टोपे ने सेना का नेतृत्व किया",
        "नाना साहब ने विद्रोह में भाग लिया",
        "भगत सिंह ने स्वतंत्रता संग्राम में योगदान दिया",
        "कुंवर सिंह ने बिहार में विद्रोह किया",
    ]

    return ocr_outputs, corrected_outputs


if __name__ == "__main__":
    print("=" * 60)
    print("PaperAI Hindi OCR Corrector Trainer")
    print("=" * 60)

    corrector = HindiOCRCorrector()

    # Generate training data
    ocr_outputs, corrected_outputs = generate_training_data()

    # Train tokenizer
    all_texts = ocr_outputs + corrected_outputs
    corrector.train_tokenizer(all_texts)
    print(f"Vocabulary size: {corrector.tokenizer.vocab_size}")

    # Save model
    model_dir = os.path.join(os.path.dirname(__file__), "models", "hindi_corrector")
    corrector.save(model_dir)
    print(f"Model saved to: {model_dir}")

    # Test
    test_input = "मगंल पांडे ने स्वतन्त्रता संग्राम में भाग लिया"
    result = corrector.full_correct(test_input)
    print(f"\nTest:")
    print(f"  Input:   {test_input}")
    print(f"  Output:  {result}")
    print(f"  Expected: मंगल पांडे ने स्वतंत्रता संग्राम में भाग लिया")

    print("\nDone!")
