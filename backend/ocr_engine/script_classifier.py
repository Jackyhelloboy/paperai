import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
from scipy import ndimage
import re

class ScriptClassifier:
    def __init__(self):
        self.script_ranges = {
            "devanagari": [
                (0x0900, 0x097F),
                (0xA8E0, 0xA8FF),
            ],
            "telugu": [
                (0x0C00, 0x0C7F),
            ],
            "latin": [
                (0x0041, 0x005A),
                (0x0061, 0x007A),
            ],
            "digits": [
                (0x0030, 0x0039),
            ],
            "mathematical": [
                (0x2200, 0x22FF),
                (0x2190, 0x21FF),
                (0x00B2, 0x00B3),
                (0x221A, 0x221A),
                (0x0025, 0x0025),
            ],
            "punctuation": [
                (0x0020, 0x002F),
                (0x003A, 0x0040),
                (0x005B, 0x0060),
                (0x007B, 0x007E),
            ]
        }
        
        self.devanagari_keywords = [
            "क", "ख", "ग", "घ", "च", "छ", "ज", "झ", "ट", "ठ", "ड", "ढ",
            "त", "थ", "द", "ध", "न", "प", "फ", "ब", "भ", "म", "य", "र", "ल",
            "व", "श", "ष", "स", "ह", "अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ",
            "ओ", "औ", "ं", "ः", "ँ", "ृ", "ू", "ी", "ा", "े", "ै", "ो", "ौ"
        ]
        
        self.telugu_keywords = [
            "క", "ఖ", "గ", "ఘ", "చ", "ఛ", "జ", "ఝ", "ట", "ఠ", "డ", "ఢ",
            "త", "థ", "ద", "ధ", "న", "ప", "ఫ", "బ", "భ", "మ", "య", "ర", "ల",
            "వ", "శ", "ష", "స", "హ", "అ", "ఆ", "ఇ", "ఈ", "ఉ", "ఊ", "ఏ", "ఐ",
            "ఓ", "ఔ", "ం", "ః", "ా", "ి", "ీ", "ు", "ూ", "ృ", "ౄ", "ె", "ే",
            "ై", "ొ", "ో", "ౌ"
        ]
    
    def classify_regions(self, regions: List[Dict]) -> List[Dict]:
        classified = []
        
        for region in regions:
            img_crop = region.get("image_crop")
            
            if img_crop is not None:
                script = self._classify_image_region(img_crop)
                confidence = self._get_classification_confidence(img_crop, script)
            else:
                script = "unknown"
                confidence = 0.0
            
            classified_region = region.copy()
            classified_region["detected_script"] = script
            classified_region["language"] = self._script_to_language(script)
            classified_region["script_confidence"] = confidence
            
            classified.append(classified_region)
        
        return classified
    
    def _classify_image_region(self, image: np.ndarray) -> str:
        if image is None or image.size == 0:
            return "unknown"
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        features = self._extract_comprehensive_features(gray)
        
        scores = {
            "devanagari": 0.0,
            "telugu": 0.0,
            "latin": 0.0,
            "mathematical": 0.0,
            "digits": 0.0
        }
        
        if features["has_top_line"] and features["has_curves"] and features["high_density"]:
            scores["devanagari"] += 0.45
        elif features["has_top_line"] and features["high_density"]:
            scores["devanagari"] += 0.3
        
        if features["has_restricted_top"] and features["has_curves"] and features["high_density"]:
            scores["telugu"] += 0.45
        elif features["has_restricted_top"] and features["high_density"]:
            scores["telugu"] += 0.3
        
        if features["has_straight_lines"] and features["has_tall_letters"] and features["medium_density"]:
            scores["latin"] += 0.4
        elif features["has_ascenders_descenders"]:
            scores["latin"] += 0.35
        
        if features["has_symbols"] and features["has_superscripts"]:
            scores["mathematical"] += 0.5
        elif features["has_math_operators"]:
            scores["mathematical"] += 0.4
        
        if features["has_small_chars"] and features["uniform_height"]:
            scores["digits"] += 0.35
        
        if features["horizontal_projection_peaks"] > 1:
            scores["devanagari"] += 0.15
            scores["telugu"] += 0.15
        
        if features["vertical_projection_variance"] > 0.3:
            scores["latin"] += 0.15
        
        if features["connected_components"] > 20:
            scores["devanagari"] += 0.1
            scores["telugu"] += 0.1
        
        if features["aspect_ratio_mean"] > 0.8:
            scores["devanagari"] += 0.1
            scores["telugu"] += 0.1
        
        if features["aspect_ratio_mean"] < 0.5:
            scores["latin"] += 0.1
        
        best_script = max(scores, key=scores.get)
        best_score = scores[best_script]
        
        if best_score < 0.15:
            if features["high_density"]:
                return "devanagari"
            elif features["medium_density"]:
                return "latin"
            return "unknown"
        
        return best_script
    
    def _extract_comprehensive_features(self, gray: np.ndarray) -> Dict:
        h, w = gray.shape
        
        if h == 0 or w == 0:
            return self._default_features()
        
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 4
        )
        
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
        
        total_area = np.sum(cleaned > 0)
        image_area = h * w
        density = total_area / image_area if image_area > 0 else 0
        
        high_density = density > 0.25
        medium_density = 0.1 < density <= 0.25
        low_density = density <= 0.1
        
        heights = []
        widths = []
        areas = []
        aspect_ratios = []
        vertical_positions = []
        
        for i in range(1, num_labels):
            x, y, bw, bh, area = stats[i]
            
            if area < 10:
                continue
            
            heights.append(bh)
            widths.append(bw)
            areas.append(area)
            aspect_ratios.append(bw / bh if bh > 0 else 0)
            vertical_positions.append(y / h)
        
        if not heights:
            return self._default_features()
        
        heights_arr = np.array(heights)
        widths_arr = np.array(widths)
        areas_arr = np.array(areas)
        aspect_arr = np.array(aspect_ratios)
        
        has_curves = self._detect_curves(cleaned)
        
        has_top_line = self._detect_top_line(binary, h)
        
        has_restricted_top = self._detect_restricted_top(binary, h)
        
        has_straight_lines = self._detect_straight_lines(cleaned)
        
        has_tall_letters = np.any(heights_arr > h * 0.6)
        has_ascenders_descenders = self._detect_ascenders_descenders(vertical_positions, heights_arr, h)
        
        has_symbols = self._detect_symbols(cleaned)
        has_superscripts = self._detect_superscripts(heights_arr, h)
        has_small_chars = np.any(heights_arr < h * 0.2)
        
        uniform_height = np.std(heights_arr) < np.mean(heights_arr) * 0.35 if len(heights_arr) > 1 else False
        
        horizontal_proj = np.sum(cleaned, axis=1)
        peak_count = self._count_projection_peaks(horizontal_proj)
        
        vertical_proj = np.sum(cleaned, axis=0)
        vert_variance = np.var(vertical_proj) / (np.mean(vertical_proj) ** 2 + 1e-6)
        
        has_math_operators = self._detect_math_operators(cleaned)
        
        return {
            "density": density,
            "high_density": high_density,
            "medium_density": medium_density,
            "low_density": low_density,
            "has_curves": has_curves,
            "has_top_line": has_top_line,
            "has_restricted_top": has_restricted_top,
            "has_straight_lines": has_straight_lines,
            "has_tall_letters": has_tall_letters,
            "has_ascenders_descenders": has_ascenders_descenders,
            "has_symbols": has_symbols,
            "has_superscripts": has_superscripts,
            "has_small_chars": has_small_chars,
            "uniform_height": uniform_height,
            "contour_count": num_labels - 1,
            "connected_components": num_labels - 1,
            "edge_density": density,
            "height_mean": float(np.mean(heights_arr)),
            "height_std": float(np.std(heights_arr)),
            "aspect_ratio_mean": float(np.mean(aspect_arr)) if len(aspect_arr) > 0 else 0,
            "horizontal_projection_peaks": peak_count,
            "vertical_projection_variance": vert_variance,
            "has_math_operators": has_math_operators
        }
    
    def _detect_curves(self, binary: np.ndarray) -> bool:
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        curve_count = 0
        for contour in contours:
            if cv2.contourArea(contour) < 20:
                continue
            
            perimeter = cv2.arcLength(contour, True)
            area = cv2.contourArea(contour)
            
            if perimeter > 0:
                circularity = 4 * np.pi * area / (perimeter * perimeter)
                if circularity > 0.25:
                    curve_count += 1
        
        return curve_count > 2
    
    def _detect_top_line(self, binary: np.ndarray, height: int) -> bool:
        top_region = binary[:int(height * 0.15), :]
        top_density = np.sum(top_region > 0) / top_region.size if top_region.size > 0 else 0
        
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
        horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
        
        top_lines = horizontal_lines[:int(height * 0.2), :]
        line_density = np.sum(top_lines > 0) / top_lines.size if top_lines.size > 0 else 0
        
        return top_density > 0.15 or line_density > 0.05
    
    def _detect_restricted_top(self, binary: np.ndarray, height: int) -> bool:
        top_quarter = binary[:int(height * 0.25), :]
        bottom_quarter = binary[int(height * 0.75):, :]
        
        top_density = np.sum(top_quarter > 0) / top_quarter.size if top_quarter.size > 0 else 0
        bottom_density = np.sum(bottom_quarter > 0) / bottom_quarter.size if bottom_quarter.size > 0 else 0
        
        return top_density < bottom_density * 0.5
    
    def _detect_straight_lines(self, binary: np.ndarray) -> bool:
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 1))
        horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
        
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 30))
        vertical_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
        
        h_density = np.sum(horizontal_lines > 0) / horizontal_lines.size if horizontal_lines.size > 0 else 0
        v_density = np.sum(vertical_lines > 0) / vertical_lines.size if vertical_lines.size > 0 else 0
        
        return (h_density > 0.02) or (v_density > 0.02)
    
    def _detect_ascenders_descenders(self, positions: List[float], heights: np.ndarray, 
                                      img_height: int) -> bool:
        if len(positions) < 3:
            return False
        
        positions_arr = np.array(positions)
        
        top_third = positions_arr < 0.33
        bottom_third = positions_arr > 0.67
        
        has_top = np.any(top_third)
        has_bottom = np.any(bottom_third)
        
        tall_chars = heights > img_height * 0.4
        has_tall = np.any(tall_chars)
        
        return has_top and has_bottom and has_tall
    
    def _detect_symbols(self, binary: np.ndarray) -> bool:
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        symbol_count = 0
        for contour in contours:
            area = cv2.contourArea(contour)
            if 10 < area < 200:
                x, y, w, h = cv2.boundingRect(contour)
                if 5 < w < 30 and 5 < h < 30:
                    symbol_count += 1
        
        return symbol_count > 3
    
    def _detect_superscripts(self, heights: np.ndarray, img_height: int) -> bool:
        if len(heights) < 2:
            return False
        
        small_chars = heights[heights < np.mean(heights) * 0.5]
        return len(small_chars) > len(heights) * 0.1
    
    def _detect_projection_peaks(self, projection: np.ndarray) -> int:
        if len(projection) == 0:
            return 0
        
        smoothed = ndimage.uniform_filter1d(projection.astype(float), size=5)
        
        peaks = []
        for i in range(1, len(smoothed) - 1):
            if smoothed[i] > smoothed[i-1] and smoothed[i] > smoothed[i+1]:
                if smoothed[i] > np.mean(smoothed) * 0.5:
                    peaks.append(i)
        
        return len(peaks)
    
    def _count_projection_peaks(self, projection: np.ndarray) -> int:
        if len(projection) == 0:
            return 0
        
        threshold = np.mean(projection) * 0.3
        above_threshold = projection > threshold
        
        peaks = 0
        in_peak = False
        for val in above_threshold:
            if val and not in_peak:
                peaks += 1
                in_peak = True
            elif not val:
                in_peak = False
        
        return peaks
    
    def _detect_math_operators(self, binary: np.ndarray) -> bool:
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        operator_like = 0
        for contour in contours:
            area = cv2.contourArea(contour)
            if 20 < area < 500:
                x, y, w, h = cv2.boundingRect(contour)
                aspect = w / h if h > 0 else 0
                
                if 0.8 < aspect < 1.2 and 10 < w < 50:
                    operator_like += 1
        
        return operator_like > 2
    
    def _get_classification_confidence(self, image: np.ndarray, script: str) -> float:
        if script == "unknown":
            return 0.0
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        features = self._extract_comprehensive_features(gray)
        
        confidence = 0.5
        
        if script == "devanagari":
            if features["has_top_line"]:
                confidence += 0.2
            if features["high_density"]:
                confidence += 0.15
            if features["has_curves"]:
                confidence += 0.1
        elif script == "telugu":
            if features["has_restricted_top"]:
                confidence += 0.2
            if features["high_density"]:
                confidence += 0.15
            if features["has_curves"]:
                confidence += 0.1
        elif script == "latin":
            if features["has_straight_lines"]:
                confidence += 0.2
            if features["has_ascenders_descenders"]:
                confidence += 0.15
            if features["medium_density"]:
                confidence += 0.1
        elif script == "mathematical":
            if features["has_symbols"]:
                confidence += 0.2
            if features["has_superscripts"]:
                confidence += 0.15
            if features["has_math_operators"]:
                confidence += 0.1
        
        return min(1.0, confidence)
    
    def _default_features(self) -> Dict:
        return {
            "density": 0,
            "high_density": False,
            "medium_density": False,
            "low_density": True,
            "has_curves": False,
            "has_top_line": False,
            "has_restricted_top": False,
            "has_straight_lines": False,
            "has_tall_letters": False,
            "has_ascenders_descenders": False,
            "has_symbols": False,
            "has_superscripts": False,
            "has_small_chars": False,
            "uniform_height": False,
            "contour_count": 0,
            "connected_components": 0,
            "edge_density": 0,
            "height_mean": 0,
            "height_std": 0,
            "aspect_ratio_mean": 0,
            "horizontal_projection_peaks": 0,
            "vertical_projection_variance": 0,
            "has_math_operators": False
        }
    
    def _script_to_language(self, script: str) -> str:
        mapping = {
            "devanagari": "hi",
            "telugu": "te",
            "latin": "en",
            "mathematical": "math",
            "digits": "math",
            "unknown": "en"
        }
        return mapping.get(script, "en")
    
    def classify_text(self, text: str) -> str:
        if not text:
            return "unknown"
        
        script_counts = {
            "devanagari": 0,
            "telugu": 0,
            "latin": 0,
            "mathematical": 0,
            "digits": 0,
            "punctuation": 0
        }
        
        for char in text:
            code = ord(char)
            detected = False
            
            for script_name, ranges in self.script_ranges.items():
                for start, end in ranges:
                    if start <= code <= end:
                        script_counts[script_name] += 1
                        detected = True
                        break
                if detected:
                    break
        
        total = sum(script_counts.values())
        if total == 0:
            return "unknown"
        
        dominant_script = max(script_counts, key=script_counts.get)
        dominance_ratio = script_counts[dominant_script] / total
        
        if dominance_ratio < 0.4:
            return "mixed"
        
        return dominant_script
    
    def classify_text_with_confidence(self, text: str) -> Tuple[str, float]:
        if not text:
            return "unknown", 0.0
        
        script_counts = {
            "devanagari": 0,
            "telugu": 0,
            "latin": 0,
            "mathematical": 0,
            "digits": 0,
            "punctuation": 0
        }
        
        for char in text:
            code = ord(char)
            for script_name, ranges in self.script_ranges.items():
                for start, end in ranges:
                    if start <= code <= end:
                        if script_name in script_counts:
                            script_counts[script_name] += 1
                        break
        
        total = sum(script_counts.values())
        if total == 0:
            return "unknown", 0.0
        
        dominant_script = max(script_counts, key=script_counts.get)
        confidence = script_counts[dominant_script] / total
        
        return dominant_script, confidence
