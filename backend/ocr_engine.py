import cv2
import numpy as np
import re
import time
from typing import Dict, List, Optional, Tuple


class PaperAIOCR:
    def __init__(self):
        self.paddle = None
        self.easyocr_readers = {}
        self._init_paddle()
        self._init_easyocr()

    def _init_paddle(self):
        try:
            from paddleocr import PaddleOCR
            for lang in ["en", "hi", "te"]:
                paddle_lang = {
                    "en": "en",
                    "hi": "devanagari",
                    "te": "te"
                }.get(lang, "en")
                try:
                    self.paddle = PaddleOCR(
                        use_angle_cls=True,
                        lang=paddle_lang,
                        use_gpu=False,
                        show_log=False,
                        det_db_thresh=0.3,
                        det_db_box_thresh=0.5,
                        det_db_unclip_ratio=1.6,
                        rec_batch_num=16,
                        max_text_length=256,
                    )
                    print(f"[PaddleOCR] Loaded: {paddle_lang}")
                    break
                except Exception as e:
                    print(f"[PaddleOCR] Failed for {paddle_lang}: {e}")
        except ImportError:
            print("[PaddleOCR] Not available")

    def _init_easyocr(self):
        try:
            import easyocr
            for lang, langs in {"en": ["en"], "hi": ["hi", "en"], "te": ["te", "en"]}.items():
                try:
                    self.easyocr_readers[lang] = easyocr.Reader(langs, gpu=False, verbose=False)
                    print(f"[EasyOCR] Loaded: {lang}")
                except Exception as e:
                    print(f"[EasyOCR] Failed for {lang}: {e}")
        except ImportError:
            print("[EasyOCR] Not available")

    def get_engine_info(self) -> dict:
        return {
            "paddle": self.paddle is not None,
            "easyocr": list(self.easyocr_readers.keys()),
            "primary": "paddle" if self.paddle else "easyocr" if self.easyocr_readers else "none"
        }

    def recognize(self, image: np.ndarray, language: str = "en", engine: str = "auto") -> dict:
        variants = self._create_variants(image)
        all_results = []

        for name, variant in variants:
            result = self._run_engines(variant, language, engine)
            if result and result.get("text", "").strip():
                result["variant"] = name
                all_results.append(result)

        if not all_results:
            return {"text": "", "confidence": 0.0, "lines": [], "engine_used": "none"}

        best = self._select_best(all_results)
        best["text"] = self._post_process(best["text"])
        return best

    def _create_variants(self, image: np.ndarray) -> List[Tuple[str, np.ndarray]]:
        variants = []
        variants.append(("original", image))

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        _, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(("clahe_otsu", cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)))

        adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)
        variants.append(("adaptive", cv2.cvtColor(adaptive, cv2.COLOR_GRAY2BGR)))

        h, w = image.shape[:2]
        if max(h, w) < 2000:
            scaled = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            variants.append(("2x", scaled))

        denoised = cv2.fastNlMeansDenoising(gray, h=10)
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        variants.append(("sharpen", cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)))

        return variants

    def _run_engines(self, image: np.ndarray, language: str, engine: str) -> Optional[dict]:
        results = []

        if engine in ("auto", "paddle") and self.paddle:
            r = self._run_paddle(image)
            if r:
                results.append(r)

        if engine in ("auto", "easyocr") and language in self.easyocr_readers:
            r = self._run_easyocr(image, language)
            if r:
                results.append(r)

        if not results:
            return None

        if len(results) == 1:
            return results[0]

        return self._merge_results(results)

    def _run_paddle(self, image: np.ndarray) -> Optional[dict]:
        try:
            start = time.time()
            result = self.paddle.ocr(image, cls=True)
            elapsed = time.time() - start

            if not result or not result[0]:
                return None

            lines = []
            total_conf = 0
            count = 0

            for line in result[0]:
                if not line or len(line) < 2:
                    continue
                text_info = line[1]
                if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                    text = str(text_info[0])
                    conf = float(text_info[1])
                else:
                    text = str(text_info)
                    conf = 0.5

                if text.strip():
                    lines.append({"text": text.strip(), "confidence": conf})
                    total_conf += conf
                    count += 1

            full_text = "\n".join(l["text"] for l in lines)
            avg_conf = total_conf / max(count, 1)

            return {
                "text": full_text,
                "confidence": avg_conf,
                "lines": lines,
                "engine_used": "paddleocr",
                "time": elapsed
            }
        except Exception as e:
            print(f"[PaddleOCR] Error: {e}")
            return None

    def _run_easyocr(self, image: np.ndarray, language: str) -> Optional[dict]:
        try:
            reader = self.easyocr_readers.get(language)
            if not reader:
                return None

            start = time.time()
            results = reader.readtext(image, detail=1, paragraph=False)
            elapsed = time.time() - start

            if not results:
                return None

            lines = []
            total_conf = 0

            for (bbox, text, conf) in results:
                if text.strip():
                    lines.append({"text": text.strip(), "confidence": float(conf)})
                    total_conf += conf

            full_text = "\n".join(l["text"] for l in lines)
            avg_conf = total_conf / max(len(lines), 1)

            return {
                "text": full_text,
                "confidence": avg_conf,
                "lines": lines,
                "engine_used": "easyocr",
                "time": elapsed
            }
        except Exception as e:
            print(f"[EasyOCR] Error: {e}")
            return None

    def _merge_results(self, results: List[dict]) -> dict:
        best = max(results, key=lambda r: r["confidence"])

        from difflib import SequenceMatcher
        agreements = 0
        for r in results:
            if r is not best:
                sim = SequenceMatcher(None, best["text"], r["text"]).ratio()
                if sim > 0.6:
                    agreements += 1

        if agreements > 0:
            best["confidence"] = min(1.0, best["confidence"] + agreements * 0.03)

        return best

    def _select_best(self, results: List[dict]) -> dict:
        for r in results:
            valid_chars = len(re.sub(r'[^\u0900-\u097Fa-zA-Z0-9]', '', r["text"]))
            total_chars = len(r["text"].replace(' ', '').replace('\n', ''))
            r["valid_ratio"] = valid_chars / max(total_chars, 1)

        return max(results, key=lambda r: r["confidence"] * 0.5 + r["valid_ratio"] * 30 + min(len(r["lines"]) * 2, 20))

    def _post_process(self, text: str) -> str:
        if not text:
            return text

        text = re.sub(r'[|\\\/\[\]{}<>~`^=_!@#$%^&*]', ' ', text)
        text = re.sub(r'[-=_]{3,}', ' ', text)

        fixes = [
            (r'मगंल', 'मंगल'),
            (r'लक्मीबाई', 'लक्ष्मीबाई'),
            (r'बहादर', 'बहादुर'),
            (r'स्वतन्त्रता', 'स्वतंत्रता'),
            (r'क्रांती', 'क्रांति'),
        ]
        for pattern, replacement in fixes:
            text = re.sub(pattern, replacement, text)

        text = re.sub(r'\s+', ' ', text).strip()
        text = text.replace(' ', '\n')

        lines = text.split('\n')
        clean_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            clean_chars = len(re.sub(r'[^\u0900-\u097Fa-zA-Z0-9]', '', line))
            total_chars = len(line.replace(' ', ''))
            if total_chars > 0 and clean_chars / total_chars >= 0.3:
                clean_lines.append(line)

        return '\n'.join(clean_lines)
