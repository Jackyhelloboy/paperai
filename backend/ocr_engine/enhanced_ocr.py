"""
Enhanced OCR Engine with Handwriting Support
Improved for detecting handwritten text and mixed content
"""
import cv2
import numpy as np
from typing import Dict, List, Optional, Tuple
import easyocr
from collections import Counter
from difflib import SequenceMatcher
import os
import re

class EnhancedOCREngine:
    def __init__(self):
        self.ocr_readers = {}
        self._init_models()
        self.confidence_threshold = 0.65
        self.handwriting_threshold = 0.55
    
    def _init_models(self):
        """Initialize OCR readers for different languages"""
        lang_configs = {
            "en": ["en"],
            "hi": ["hi", "en"],
            "te": ["te", "en"],
            "en_hi": ["hi", "en"],
            "en_te": ["te", "en"],
        }
        
        for lang_key, langs in lang_configs.items():
            try:
                self.ocr_readers[lang_key] = easyocr.Reader(
                    langs,
                    gpu=False,
                    verbose=False
                )
                print(f"Loaded OCR model: {lang_key}")
            except Exception as e:
                print(f"Warning: Could not load {lang_key}: {e}")
                self.ocr_readers[lang_key] = None
    
    def process_image(self, image_path: str) -> Dict:
        """Process entire image and return extracted text with confidence"""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        # Preprocess
        preprocessed = self._preprocess_for_handwriting(image)
        
        # Detect if handwriting
        is_handwriting = self._detect_handwriting(preprocessed)
        
        # Get regions
        regions = self._detect_regions(preprocessed)
        
        # Process each region
        results = []
        for region in regions:
            crop = self._extract_region(preprocessed, region)
            if crop is not None and crop.size > 0:
                result = self._process_region(crop, is_handwriting)
                result["bbox"] = region["bbox"]
                result["is_handwriting"] = is_handwriting
                results.append(result)
        
        # Combine all text
        all_text = " ".join([r.get("text", "") for r in results if r.get("text")])
        
        # Calculate overall confidence
        confidences = [r.get("confidence", 0) for r in results if r.get("text")]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        return {
            "image_path": image_path,
            "is_handwriting": is_handwriting,
            "regions": results,
            "full_text": all_text,
            "average_confidence": avg_confidence,
            "total_regions": len(results)
        }
    
    def _preprocess_for_handwriting(self, image: np.ndarray) -> np.ndarray:
        """Enhanced preprocessing for handwritten text"""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Increase contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Light denoise
        denoised = cv2.GaussianBlur(enhanced, (3, 3), 0)
        
        # Simple thresholding (better for synthetic text)
        _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Invert if needed (text should be dark on light background)
        if np.mean(binary) < 127:
            binary = cv2.bitwise_not(binary)
        
        # Convert back to BGR for OCR
        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    
    def _detect_handwriting(self, image: np.ndarray) -> bool:
        """Detect if the image contains handwritten text"""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        # Analyze stroke characteristics
        edges = cv2.Canny(gray, 50, 150)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return False
        
        # Analyze contour properties
        areas = [cv2.contourArea(c) for c in contours]
        perimeters = [cv2.arcLength(c, True) for c in contours]
        
        # Handwriting typically has:
        # 1. More irregular shapes
        # 2. Varying stroke widths
        # 3. More curved lines
        
        irregularity_scores = []
        for i, contour in enumerate(contours[:50]):  # Sample first 50
            if areas[i] > 10:
                # Calculate circularity
                circularity = 4 * np.pi * areas[i] / (perimeters[i] ** 2 + 0.001)
                irregularity_scores.append(1 - circularity)
        
        avg_irregularity = sum(irregularity_scores) / len(irregularity_scores) if irregularity_scores else 0
        
        # Handwriting tends to have higher irregularity
        return avg_irregularity > 0.6
    
    def _detect_regions(self, image: np.ndarray) -> List[Dict]:
        """Detect text regions in the image"""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Method 1: Use contour-based detection
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 8
        )
        
        # Dilate to connect text components
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 5))
        dilated = cv2.dilate(binary, kernel, iterations=1)
        
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        regions = []
        h, w = gray.shape
        
        for contour in contours:
            x, y, bw, bh = cv2.boundingRect(contour)
            
            # Filter by size
            if bw > 30 and bh > 10 and bw < w * 0.95:
                # Check if region has enough dark pixels (text)
                roi = gray[y:y+bh, x:x+bw]
                dark_pixels = np.sum(roi < 128)
                total_pixels = roi.size
                
                if total_pixels > 0 and dark_pixels / total_pixels > 0.05:
                    regions.append({
                        "bbox": [x, y, x + bw, y + bh],
                        "width": bw,
                        "height": bh
                    })
        
        # Merge overlapping regions
        regions = self._merge_regions(regions)
        
        # Sort by position (top to bottom, left to right)
        regions.sort(key=lambda r: (r["bbox"][1], r["bbox"][0]))
        
        # If no regions found, use the entire image
        if not regions:
            regions.append({
                "bbox": [0, 0, w, h],
                "width": w,
                "height": h
            })
        
        return regions
    
    def _merge_regions(self, regions: List[Dict], threshold: int = 10) -> List[Dict]:
        """Merge overlapping or close regions"""
        if not regions:
            return []
        
        merged = []
        used = set()
        
        for i, r1 in enumerate(regions):
            if i in used:
                continue
            
            current = r1.copy()
            
            for j, r2 in enumerate(regions):
                if j <= i or j in used:
                    continue
                
                # Check if regions overlap or are close
                x1, y1, x2, y2 = current["bbox"]
                x3, y3, x4, y4 = r2["bbox"]
                
                if (x1 - threshold <= x4 and x2 + threshold >= x3 and
                    y1 - threshold <= y4 and y2 + threshold >= y3):
                    # Merge
                    current["bbox"] = [
                        min(x1, x3), min(y1, y3),
                        max(x2, x4), max(y2, y4)
                    ]
                    used.add(j)
            
            merged.append(current)
        
        return merged
    
    def _extract_region(self, image: np.ndarray, region: Dict) -> Optional[np.ndarray]:
        """Extract a region from the image"""
        x1, y1, x2, y2 = region["bbox"]
        
        h, w = image.shape[:2]
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(w, x2)
        y2 = min(h, y2)
        
        if x2 <= x1 or y2 <= y1:
            return None
        
        return image[y1:y2, x1:x2]
    
    def _process_region(self, crop: np.ndarray, is_handwriting: bool) -> Dict:
        """Process a single region with OCR"""
        # Create multiple enhanced versions
        crops = self._create_enhanced_crops(crop, is_handwriting)
        
        all_results = []
        
        for crop_name, crop_img in crops:
            result = self._run_ocr(crop_img, is_handwriting)
            if result and result.get("text"):
                result["crop_name"] = crop_name
                all_results.append(result)
        
        if not all_results:
            return {"text": "", "confidence": 0.0}
        
        # Voting system
        return self._vote_results(all_results)
    
    def _create_enhanced_crops(self, crop: np.ndarray, is_handwriting: bool) -> List[Tuple[str, np.ndarray]]:
        """Create multiple enhanced versions of the crop"""
        crops = []
        
        # Original
        crops.append(("original", crop))
        
        # Upscaled versions
        if is_handwriting:
            # More aggressive upscaling for handwriting
            crops.append(("2x", cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)))
            crops.append(("3x", cv2.resize(crop, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)))
        else:
            crops.append(("1.5x", cv2.resize(crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)))
            crops.append(("2x", cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)))
        
        # Contrast enhanced
        if len(crop.shape) == 3:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = crop
        
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        crops.append(("contrast", cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)))
        
        # Sharpened
        kernel = np.array([[-1, -1, -1],
                          [-1,  9, -1],
                          [-1, -1, -1]])
        sharpened = cv2.filter2D(crop, -1, kernel)
        crops.append(("sharpened", sharpened))
        
        # Bilateral filter (good for handwriting)
        bilateral = cv2.bilateralFilter(crop, 9, 75, 75)
        crops.append(("bilateral", bilateral))
        
        return crops
    
    def _run_ocr(self, image: np.ndarray, is_handwriting: bool) -> Optional[Dict]:
        """Run OCR on an image"""
        # Choose appropriate reader
        reader = self._get_reader("en")  # Start with English
        
        if reader is None:
            return None
        
        try:
            if len(image.shape) == 2:
                image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
            
            h, w = image.shape[:2]
            if h < 5 or w < 5:
                return None
            
            # Run OCR with different settings for better results
            results = reader.readtext(
                image,
                detail=1,
                paragraph=False,
                contrast_ths=0.1,
                adjust_contrast=0.5,
                text_threshold=0.5,
                low_text=0.3,
                link_threshold=0.3,
                canvas_size=256,
                mag_ratio=1.5
            )
            
            if results:
                texts = []
                confidences = []
                
                for (bbox, text, confidence) in results:
                    # Filter out very short or low confidence results
                    if len(text.strip()) > 0 and confidence > 0.1:
                        texts.append(text)
                        confidences.append(confidence)
                
                if texts:
                    combined_text = " ".join(texts)
                    
                    # Weighted confidence
                    min_conf = min(confidences) if confidences else 0
                    avg_conf = np.mean(confidences) if confidences else 0
                    
                    # For handwriting, be more lenient with confidence
                    if is_handwriting:
                        confidence = avg_conf * 0.7 + min_conf * 0.3
                    else:
                        confidence = avg_conf * 0.6 + min_conf * 0.4
                    
                    return {
                        "text": combined_text,
                        "confidence": float(confidence),
                        "line_count": len(texts)
                    }
        except Exception as e:
            pass
        
        return None
    
    def _get_reader(self, language: str):
        """Get the appropriate OCR reader"""
        if language in self.ocr_readers and self.ocr_readers[language]:
            return self.ocr_readers[language]
        
        # Fallback to any available reader
        for reader in self.ocr_readers.values():
            if reader is not None:
                return reader
        
        return None
    
    def _vote_results(self, results: List[Dict]) -> Dict:
        """Vote on the best result from multiple OCR passes"""
        if not results:
            return {"text": "", "confidence": 0.0}
        
        # Sort by confidence and take the best results
        sorted_results = sorted(results, key=lambda r: r.get("confidence", 0), reverse=True)
        
        # Use the top result as primary
        best_result = sorted_results[0]
        
        # Group similar texts for consensus
        text_groups = {}
        for result in results:
            text = result["text"].strip()
            matched = False
            
            for group_text in list(text_groups.keys()):
                similarity = SequenceMatcher(None, text, group_text).ratio()
                if similarity > 0.5:
                    text_groups[group_text].append(result)
                    matched = True
                    break
            
            if not matched:
                text_groups[text] = [result]
        
        # Find best group by size and confidence
        best_group = None
        best_score = -1
        
        for group_text, group_results in text_groups.items():
            # Score based on group size and average confidence
            group_size = len(group_results)
            avg_conf = np.mean([r["confidence"] for r in group_results])
            
            # Larger groups with good confidence are better
            score = group_size * avg_conf
            
            if score > best_score:
                best_score = score
                best_group = (group_text, group_results)
        
        if best_group:
            text, group_results = best_group
            avg_conf = np.mean([r["confidence"] for r in group_results])
            
            return {
                "text": text,
                "confidence": float(avg_conf),
                "agreement": len(group_results) / len(results)
            }
        
        return {"text": best_result["text"], "confidence": best_result.get("confidence", 0.5)}


def test_enhanced_ocr():
    """Test the enhanced OCR engine"""
    import sys
    sys.path.insert(0, "D:/Paper Ai/backend")
    
    engine = EnhancedOCREngine()
    
    # Test images
    test_images = [
        "D:/Paper Ai/test_data/test_paper_english.jpg",
        "D:/Paper Ai/test_data/test_handwriting.jpg",
        "D:/Paper Ai/test_data/test_multilingual.jpg"
    ]
    
    print("=" * 70)
    print("ENHANCED OCR ENGINE TEST")
    print("=" * 70)
    
    for img_path in test_images:
        if os.path.exists(img_path):
            print(f"\nProcessing: {os.path.basename(img_path)}")
            print("-" * 50)
            
            result = engine.process_image(img_path)
            
            print(f"Handwriting detected: {result['is_handwriting']}")
            print(f"Total regions: {result['total_regions']}")
            print(f"Average confidence: {result['average_confidence']:.2%}")
            print(f"\nExtracted Text:")
            print(result['full_text'][:500] + "..." if len(result['full_text']) > 500 else result['full_text'])
        else:
            print(f"Image not found: {img_path}")


if __name__ == "__main__":
    test_enhanced_ocr()
