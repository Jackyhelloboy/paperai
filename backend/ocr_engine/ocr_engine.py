import cv2
import numpy as np
from typing import Dict, List, Optional, Tuple
from collections import Counter
from difflib import SequenceMatcher
import os
import re

class OCREngine:
    def __init__(self):
        self.ocr_readers = {}
        self.use_tesseract = False
        self._init_models()
        self.confidence_threshold = 0.75
        self.critical_threshold = 0.90
        self.min_agreement_ratio = 0.6
    
    def _init_models(self):
        try:
            import easyocr
            lang_configs = {
                "en": ["en"],
                "hi": ["hi", "en"],
                "te": ["te", "en"],
            }
            for lang_key, langs in lang_configs.items():
                try:
                    self.ocr_readers[lang_key] = easyocr.Reader(langs, gpu=False, verbose=False)
                    print(f"Loaded EasyOCR model: {lang_key}")
                except Exception as e:
                    print(f"Warning: Could not load EasyOCR model for {lang_key}: {e}")
                    self.ocr_readers[lang_key] = None
            if not any(self.ocr_readers.values()):
                raise RuntimeError("No EasyOCR models loaded")
            print("Using EasyOCR engine")
        except Exception as e:
            print(f"EasyOCR not available ({e}), falling back to Tesseract")
            self.use_tesseract = True
            try:
                import pytesseract
                self.pytesseract = pytesseract
                print("Using Tesseract OCR engine")
            except ImportError:
                raise RuntimeError("Neither EasyOCR nor Tesseract available")
    
    def process_regions(self, image: np.ndarray, regions: List[Dict], 
                        quality_report: Dict) -> List[Dict]:
        results = []
        for i, region in enumerate(regions):
            bbox = region.get("bbox", [0, 0, image.shape[1], image.shape[0]])
            x1, y1, x2, y2 = [int(b) for b in bbox]
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(image.shape[1], x2)
            y2 = min(image.shape[0], y2)
            crop = image[y1:y2, x1:x2]
            if crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
                continue
            language = region.get("language", "en")
            region_type = region.get("type", "block")
            if self.use_tesseract:
                ocr_result = self._tesseract_ocr(crop, language)
            else:
                ocr_result = self._ocr_with_voting(crop, language, region_type, quality_report)
            ocr_result["region_index"] = i
            ocr_result["bbox"] = bbox
            ocr_result["detected_language"] = language
            ocr_result["region_type"] = region_type
            ocr_result["has_critical_tokens"] = self._has_critical_content(ocr_result.get("text", ""))
            ocr_result["has_math"] = self._detect_math_content(ocr_result.get("text", ""))
            results.append(ocr_result)
        return results
    
    def _tesseract_ocr(self, crop: np.ndarray, language: str) -> Dict:
        lang_map = {"hi": "hin", "te": "tel", "en": "eng", "math": "eng"}
        tess_lang = lang_map.get(language, "eng")
        try:
            if len(crop.shape) == 2:
                crop_bgr = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)
            else:
                crop_bgr = crop
            custom_config = r'--oem 3 --psm 6'
            text = self.pytesseract.image_to_string(crop_bgr, lang=tess_lang, config=custom_config)
            text = text.strip()
            data = self.pytesseract.image_to_data(crop_bgr, lang=tess_lang, config=custom_config, output_type=self.pytesseract.Output.DICT)
            confs = [int(c) for c in data['conf'] if int(c) > 0]
            avg_conf = sum(confs) / len(confs) / 100.0 if confs else 0.5
            return {
                "text": text,
                "confidence": float(avg_conf),
                "alternatives": [],
                "needs_review": avg_conf < self.confidence_threshold,
                "resolution_used": "tesseract",
                "voting_result": None,
                "all_results_count": 1
            }
        except Exception as e:
            return {
                "text": "",
                "confidence": 0.0,
                "alternatives": [],
                "needs_review": True,
                "error": str(e),
                "voting_result": None,
                "all_results_count": 0
            }
    
    def _ocr_with_voting(self, crop, language, region_type, quality_report):
        crops = self._create_multi_resolution_crops(crop, language)
        all_results = []
        for crop_name, crop_image in crops:
            result = self._run_ocr(crop_image, language)
            if result and result.get("text") and len(result["text"].strip()) > 0:
                result["crop_name"] = crop_name
                all_results.append(result)
        if not all_results:
            return {"text": "", "confidence": 0.0, "alternatives": [], "needs_review": True, "error": "No text recognized", "voting_result": None}
        voting_result = self._apply_voting_system(all_results)
        if voting_result["confidence"] < self.confidence_threshold:
            enhanced_results = self._enhanced_reprocessing(crop, language, voting_result)
            if enhanced_results:
                all_results.extend(enhanced_results)
                voting_result = self._apply_voting_system(all_results)
        alternatives = self._get_alternatives(all_results, voting_result["text"])
        return {"text": voting_result["text"], "confidence": voting_result["confidence"], "alternatives": alternatives[:5], "needs_review": voting_result["confidence"] < self.confidence_threshold, "resolution_used": voting_result.get("best_crop", "unknown"), "voting_result": voting_result, "all_results_count": len(all_results)}
    
    def _create_multi_resolution_crops(self, crop, language):
        crops = [("1x_normal", crop)]
        crops.append(("1.5x_normal", cv2.resize(crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)))
        crops.append(("2x_normal", cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)))
        if len(crop.shape) == 3:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = crop
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        crops.append(("1x_contrast", cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)))
        gaussian = cv2.GaussianBlur(crop, (0, 0), 3)
        crops.append(("1x_sharpened", cv2.addWeighted(crop, 1.5, gaussian, -0.5, 0)))
        return crops
    
    def _apply_voting_system(self, results):
        if not results:
            return {"text": "", "confidence": 0.0}
        text_groups = {}
        for result in results:
            text = result["text"].strip()
            matched = False
            for group_text in list(text_groups.keys()):
                if SequenceMatcher(None, text, group_text).ratio() > 0.7:
                    text_groups[group_text].append(result)
                    matched = True
                    break
            if not matched:
                text_groups[text] = [result]
        best_group = None
        best_score = -1
        for group_text, group_results in text_groups.items():
            group_confidence = np.mean([r["confidence"] for r in group_results])
            agreement_ratio = len(group_results) / len(results)
            has_high_conf = any(r["confidence"] > 0.9 for r in group_results)
            score = group_confidence * 0.4 + agreement_ratio * 0.3 + (0.3 if has_high_conf else 0) + (0.1 if len(group_results) > 1 else 0)
            if score > best_score:
                best_score = score
                best_group = (group_text, group_results)
        if best_group is None:
            return {"text": results[0]["text"], "confidence": results[0]["confidence"]}
        group_text, group_results = best_group
        best_result = max(group_results, key=lambda r: r["confidence"])
        weights = [r["confidence"] * (1.1 if r.get("crop_name", "").startswith("2x") else 1.05 if r.get("crop_name", "").startswith("1.5x") else 1.0) for r in group_results]
        total_weight = sum(weights)
        weighted_conf = sum(w * r["confidence"] for w, r in zip(weights, group_results)) / total_weight if total_weight > 0 else 0.0
        return {"text": group_text, "confidence": min(1.0, weighted_conf + min(0.1, (len(group_results) - 1) * 0.02)), "agreement_ratio": len(group_results) / len(results), "group_size": len(group_results), "best_crop": best_result.get("crop_name", "unknown"), "all_texts": [r["text"] for r in results]}
    
    def _enhanced_reprocessing(self, crop, language, current_result):
        enhanced_results = []
        if len(crop.shape) == 3:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = crop
        for block_size in [11, 15, 21]:
            for c_val in [2, 5, 10]:
                binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, c_val)
                result = self._run_ocr(cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR), language)
                if result and result.get("text") and len(result["text"].strip()) > 0:
                    result["crop_name"] = f"enhanced_b{block_size}_c{c_val}"
                    enhanced_results.append(result)
        _, thresholded = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        result = self._run_ocr(cv2.cvtColor(thresholded, cv2.COLOR_GRAY2BGR), language)
        if result and result.get("text") and len(result["text"].strip()) > 0:
            result["crop_name"] = "otsu"
            enhanced_results.append(result)
        return enhanced_results
    
    def _get_alternatives(self, all_results, best_text):
        alternatives = []
        seen_texts = {best_text}
        for result in all_results:
            text = result["text"]
            if text not in seen_texts and len(text.strip()) > 0:
                seen_texts.add(text)
                alternatives.append({"text": text, "confidence": result["confidence"], "resolution": result.get("crop_name", "unknown")})
        alternatives.sort(key=lambda x: x["confidence"], reverse=True)
        return alternatives
    
    def _run_ocr(self, image, language):
        reader = self._get_reader(language)
        if reader is None:
            return None
        try:
            if len(image.shape) == 2:
                image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
            h, w = image.shape[:2]
            if h < 10 or w < 10:
                return None
            results = reader.readtext(image)
            if results:
                texts = [t for _, t, _ in results]
                confidences = [c for _, _, c in results]
                combined_text = " ".join(texts)
                min_conf = min(confidences)
                avg_conf = np.mean(confidences)
                max_conf = max(confidences)
                confidence = avg_conf * 0.6 + min_conf * 0.3 + max_conf * 0.1
                return {"text": combined_text, "confidence": float(confidence), "details": [{"text": t, "confidence": c} for t, c in zip(texts, confidences)], "line_count": len(texts)}
        except Exception:
            return None
        return None
    
    def _get_reader(self, language):
        if language in self.ocr_readers and self.ocr_readers[language]:
            return self.ocr_readers[language]
        for reader in self.ocr_readers.values():
            if reader is not None:
                return reader
        return None
    
    def _has_critical_content(self, text):
        if not text:
            return False
        for pattern in [r'\d+\s*[×x÷+\-=]', r'[×x÷+\-=]\s*\d+', r'\d+\s*(marks|Marks|MARKS)', r'\d+\.\d+', r'[A-Z]\)', r'\(\d+\)', r'\[\d+\]', r'\d+\s*(cm|mm|kg|mL|gm)']:
            if re.search(pattern, text):
                return True
        digit_count = sum(c.isdigit() for c in text)
        return len(text) > 0 and digit_count / len(text) > 0.3
    
    def _detect_math_content(self, text):
        if not text:
            return False
        for pattern in [r'[=≠<>≤≥]', r'[+\-×÷]', r'[²³√]', r'\d+\s*[+\-×÷=]\s*\d+', r'[a-zA-Z]\s*[=<>]\s*\d+', r'\d+\s*(cm|mm|kg|mL|°C|°F)', r'[A-Z][a-z]*\d*[A-Z][a-z]*', r'→|↔|⇌', r'Δ|Σ|π|θ|α|β|γ|ω']:
            if re.search(pattern, text):
                return True
        return False
    
    def run_ocr_direct(self, image, language="en"):
        if self.use_tesseract:
            return self._tesseract_ocr(image, language)
        return self._ocr_with_voting(image, language, "block", {})
