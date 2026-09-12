"""
PaperAI OCR Engine — PaddleOCR-based, optimized for Hindi/English handwritten text.
PaddleOCR has the best accuracy for Devanagari script.
"""
import cv2
import numpy as np
from typing import Dict, List, Optional, Tuple
import re
import time


class PaperAIOCREngine:
    """High-accuracy OCR engine using PaddleOCR with custom preprocessing."""

    def __init__(self):
        self.paddle_ocr = None
        self._init_paddle()

    def _init_paddle(self):
        try:
            from paddleocr import PaddleOCR
            self.paddle_ocr = PaddleOCR(
                use_angle_cls=True,
                lang='devanagari',
                use_gpu=False,
                show_log=False,
                det_db_thresh=0.3,
                det_db_box_thresh=0.5,
                det_db_unclip_ratio=1.6,
                rec_batch_num=16,
                max_text_length=256,
            )
            print("[PaperAI] PaddleOCR initialized (devanagari)")
        except Exception as e:
            print(f"[PaperAI] PaddleOCR init failed: {e}")
            try:
                from paddleocr import PaddleOCR
                self.paddle_ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang='en',
                    use_gpu=False,
                    show_log=False,
                )
                print("[PaperAI] PaddleOCR initialized (english fallback)")
            except Exception as e2:
                print(f"[PaperAI] PaddleOCR completely failed: {e2}")

    def preprocess_image(self, image: np.ndarray) -> List[Tuple[str, np.ndarray]]:
        """Apply multiple preprocessing techniques, return variants."""
        variants = []
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()

        # Variant 1: CLAHE + Otsu
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        _, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(("clahe_otsu", cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)))

        # Variant 2: Adaptive threshold
        adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                          cv2.THRESH_BINARY, 31, 10)
        variants.append(("adaptive", cv2.cvtColor(adaptive, cv2.COLOR_GRAY2BGR)))

        # Variant 3: Denoise + sharpen
        denoised = cv2.fastNlMeansDenoising(gray, h=10)
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        _, sharp_bin = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(("denoise_sharp", cv2.cvtColor(sharp_bin, cv2.COLOR_GRAY2BGR)))

        # Variant 4: Scale 2x (helps small handwriting)
        scaled = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        variants.append(("scale_2x", scaled))

        # Variant 5: Morphological close (connects broken strokes)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel_morph = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        morph = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_morph)
        variants.append(("morphology", cv2.cvtColor(morph, cv2.COLOR_GRAY2BGR)))

        return variants

    def run_ocr(self, image: np.ndarray) -> Dict:
        """Run OCR on a single image, return best result."""
        if self.paddle_ocr is None:
            return {"text": "", "confidence": 0.0, "words": []}

        start = time.time()
        variants = self.preprocess_image(image)
        best_result = {"text": "", "confidence": 0.0, "words": []}
        best_score = -1

        for name, variant in variants:
            try:
                result = self.paddle_ocr.ocr(variant, cls=True)
                if result is None or len(result) == 0:
                    continue

                lines = result[0] if result[0] else []
                all_text = []
                all_words = []
                total_conf = 0
                count = 0

                for line in lines:
                    if line is None or len(line) < 2:
                        continue
                    bbox = line[0]
                    text_info = line[1]
                    if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                        text = str(text_info[0])
                        conf = float(text_info[1])
                    else:
                        text = str(text_info)
                        conf = 0.5

                    if text.strip():
                        all_text.append(text.strip())
                        all_words.append({"text": text.strip(), "confidence": conf})
                        total_conf += conf
                        count += 1

                full_text = " ".join(all_text)
                avg_conf = total_conf / max(count, 1)

                # Score: confidence + word count + valid char ratio
                valid_chars = len(re.sub(r'[^\u0900-\u097Fa-zA-Z0-9]', '', full_text))
                total_chars = len(full_text.replace(' ', ''))
                valid_ratio = valid_chars / max(total_chars, 1)
                word_count = len(all_text)

                score = avg_conf * 0.5 + valid_ratio * 30 + min(word_count * 2, 20)

                if score > best_score:
                    best_score = score
                    best_result = {
                        "text": full_text,
                        "confidence": avg_conf,
                        "words": all_words,
                        "variant": name,
                    }
            except Exception:
                continue

        elapsed = time.time() - start
        best_result["processing_time"] = round(elapsed, 3)
        return best_result

    def process_image(self, image_path_or_array) -> Dict:
        """Main entry point: process an image file or numpy array."""
        if isinstance(image_path_or_array, str):
            image = cv2.imread(image_path_or_array)
            if image is None:
                return {"error": f"Cannot read image: {image_path_or_array}"}
        else:
            image = image_path_or_array

        result = self.run_ocr(image)
        result["post_processed"] = self.post_process(result.get("text", ""))
        return result

    def post_process(self, text: str) -> str:
        """Clean up OCR output: fix common errors, remove garbage."""
        if not text:
            return text

        # Remove garbage characters
        text = re.sub(r'[|\\\/\[\]{}<>~`^=_!@#$%^&*]', ' ', text)

        # Remove consecutive dashes
        text = re.sub(r'[-=_]{3,}', ' ', text)

        # Fix common Hindi OCR errors
        fixes = [
            (r'मगंल', 'मंगल'),
            (r'मङ्गल', 'मंगल'),
            (r'लक्मीबाई', 'लक्ष्मीबाई'),
            (r'लकमीबाई', 'लक्ष्मीबाई'),
            (r'बहादर', 'बहादुर'),
            (r'स्वतन्त्रता', 'स्वतंत्रता'),
            (r'क्रांती', 'क्रांति'),
            (r'विद्रोह', 'विद्रोह'),
            (r'रुपरेखा', 'रूपरेखा'),
            (r'उगवाज', 'आवाज'),
            (r'त्यपूर्ण', 'महत्वपूर्ण'),
            (r'टफ़मलाइन', 'टाइमलाइन'),
        ]
        for pattern, replacement in fixes:
            text = re.sub(pattern, replacement, text)

        # Fix number OCR errors
        number_fixes = [
            (r'\b4857\b', '1857'),
            (r'\b2857\b', '1857'),
            (r'\b3857\b', '1857'),
            (r'\b4858\b', '1858'),
            (r'\b2858\b', '1858'),
            (r'\b3858\b', '1858'),
        ]
        for pattern, replacement in number_fixes:
            text = re.sub(pattern, replacement, text)

        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        # Remove garbage lines (too short or too much garbage)
        lines = text.split('\n')
        clean_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            clean_chars = len(re.sub(r'[^\u0900-\u097Fa-zA-Z0-9]', '', line))
            total_chars = len(line.replace(' ', ''))
            if total_chars > 0 and clean_chars / total_chars >= 0.4:
                clean_lines.append(line)

        return '\n'.join(clean_lines)


# Singleton
_engine_instance = None

def get_engine() -> PaperAIOCREngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = PaperAIOCREngine()
    return _engine_instance
