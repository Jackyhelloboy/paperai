import cv2
import numpy as np
from typing import Dict, List, Tuple
from difflib import SequenceMatcher

class SourceComparator:
    def __init__(self):
        self.similarity_threshold = 0.7
        self.critical_change_threshold = 0.3
    
    def compare_source_output(self, source_image: np.ndarray, 
                               ocr_results: List[Dict]) -> Dict:
        comparison = {
            "source_regions": [],
            "output_regions": [],
            "discrepancies": [],
            "missing_elements": [],
            "silent_changes": [],
            "overall_similarity": 0.0,
            "needs_review": False
        }
        
        source_regions = self._extract_source_regions(source_image)
        comparison["source_regions"] = source_regions
        
        comparison["output_regions"] = ocr_results
        
        region_comparisons = self._compare_regions(source_regions, ocr_results)
        
        comparison["discrepancies"] = region_comparisons.get("discrepancies", [])
        comparison["missing_elements"] = region_comparisons.get("missing", [])
        comparison["silent_changes"] = region_comparisons.get("changes", [])
        
        comparison["overall_similarity"] = self._calculate_overall_similarity(region_comparisons)
        
        comparison["needs_review"] = (
            len(comparison["missing_elements"]) > 0 or
            len(comparison["silent_changes"]) > 2 or
            comparison["overall_similarity"] < self.similarity_threshold
        )
        
        return comparison
    
    def _extract_source_regions(self, image: np.ndarray) -> List[Dict]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 4
        )
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 5))
        dilated = cv2.dilate(binary, kernel, iterations=1)
        
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        regions = []
        h, w = image.shape[:2]
        
        for contour in sorted(contours, key=lambda c: cv2.boundingRect(c)[1]):
            x, y, bw, bh = cv2.boundingRect(contour)
            
            if bw > 30 and bh > 10:
                crop = gray[y:y+bh, x:x+bw]
                
                pixel_density = np.sum(crop < 128) / crop.size if crop.size > 0 else 0
                
                regions.append({
                    "bbox": [x, y, x + bw, y + bh],
                    "width": bw,
                    "height": bh,
                    "pixel_density": float(pixel_density),
                    "text_hash": self._compute_region_hash(crop),
                    "area": bw * bh
                })
        
        return regions
    
    def _compute_region_hash(self, region_gray: np.ndarray) -> str:
        resized = cv2.resize(region_gray, (32, 32))
        normalized = resized.astype(float) / 255.0
        thresholded = (normalized > 0.5).astype(int)
        hash_str = "".join(map(str, thresholded.flatten()))
        return hash_str[:64]
    
    def _compare_regions(self, source_regions: List[Dict], 
                          ocr_results: List[Dict]) -> Dict:
        discrepancies = []
        missing = []
        changes = []
        
        source_used = set()
        output_used = set()
        
        for i, source in enumerate(source_regions):
            best_match = None
            best_score = -1
            
            for j, ocr in enumerate(ocr_results):
                if j in output_used:
                    continue
                
                score = self._calculate_region_similarity(source, ocr)
                
                if score > best_score:
                    best_score = score
                    best_match = j
            
            if best_match is not None and best_score > self.similarity_threshold:
                source_used.add(i)
                output_used.add(best_match)
                
                if best_score < 0.95:
                    change = self._detect_specific_changes(source, ocr_results[best_match])
                    if change:
                        changes.append({
                            "source_index": i,
                            "output_index": best_match,
                            "similarity": best_score,
                            "changes": change
                        })
            else:
                missing.append({
                    "source_index": i,
                    "source_bbox": source["bbox"],
                    "reason": "no_matching_output",
                    "best_score": best_score
                })
        
        for j, ocr in enumerate(ocr_results):
            if j not in output_used:
                discrepancies.append({
                    "output_index": j,
                    "output_text": ocr.get("text", ""),
                    "reason": "no_matching_source"
                })
        
        return {
            "discrepancies": discrepancies,
            "missing": missing,
            "changes": changes
        }
    
    def _calculate_region_similarity(self, source: Dict, ocr: Dict) -> float:
        source_bbox = source["bbox"]
        ocr_bbox = ocr.get("bbox", [0, 0, 0, 0])
        
        bbox_similarity = self._bbox_similarity(source_bbox, ocr_bbox)
        
        size_similarity = self._size_similarity(source, ocr)
        
        density_similarity = self._density_similarity(source, ocr)
        
        return (bbox_similarity * 0.4 + 
                size_similarity * 0.3 + 
                density_similarity * 0.3)
    
    def _bbox_similarity(self, bbox1: List[int], bbox2: List[int]) -> float:
        x1, y1, x2, y2 = bbox1
        x3, y3, x4, y4 = bbox2
        
        inter_x1 = max(x1, x3)
        inter_y1 = max(y1, y3)
        inter_x2 = min(x2, x4)
        inter_y2 = min(y2, y4)
        
        if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
            return 0.0
        
        intersection_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
        
        area1 = (x2 - x1) * (y2 - y1)
        area2 = (x4 - x3) * (y4 - y3)
        
        union_area = area1 + area2 - intersection_area
        
        if union_area == 0:
            return 0.0
        
        return intersection_area / union_area
    
    def _size_similarity(self, source: Dict, ocr: Dict) -> float:
        source_area = source.get("area", source["width"] * source["height"])
        ocr_area = ocr.get("width", 0) * ocr.get("height", 0)
        
        if source_area == 0 or ocr_area == 0:
            return 0.0
        
        ratio = min(source_area, ocr_area) / max(source_area, ocr_area)
        
        return ratio
    
    def _density_similarity(self, source: Dict, ocr: Dict) -> float:
        source_density = source.get("pixel_density", 0)
        
        ocr_text = ocr.get("text", "")
        if not ocr_text:
            return 0.5
        
        text_density = len(ocr_text) / max(source.get("area", 1), 1) * 100
        
        density_diff = abs(source_density - min(text_density, 1.0))
        
        return max(0, 1 - density_diff)
    
    def _detect_specific_changes(self, source: Dict, ocr: Dict) -> List[Dict]:
        changes = []
        
        source_density = source.get("pixel_density", 0)
        ocr_text = ocr.get("text", "")
        
        if source_density > 0.3 and len(ocr_text) < 5:
            changes.append({
                "type": "possible_missing_text",
                "description": "High pixel density but low text output",
                "severity": "high"
            })
        
        ocr_confidence = ocr.get("confidence", 0)
        if ocr_confidence < 0.7:
            changes.append({
                "type": "low_confidence",
                "description": f"OCR confidence is low ({ocr_confidence:.1%})",
                "severity": "medium"
            })
        
        source_area = source.get("area", 0)
        if source_area > 50000 and len(ocr_text) < 20:
            changes.append({
                "type": "possible_missing_content",
                "description": "Large region with minimal text output",
                "severity": "high"
            })
        
        return changes
    
    def _calculate_overall_similarity(self, comparison: Dict) -> float:
        missing_count = len(comparison.get("missing", []))
        changes_count = len(comparison.get("changes", []))
        discrepancies_count = len(comparison.get("discrepancies", []))
        
        total_issues = missing_count + changes_count + discrepancies_count
        total_regions = max(1, missing_count + changes_count + discrepancies_count + 10)
        
        issue_ratio = total_issues / total_regions
        
        similarity = max(0, 1 - issue_ratio)
        
        if missing_count > 3:
            similarity *= 0.8
        
        if changes_count > 5:
            similarity *= 0.9
        
        return similarity
    
    def verify_count_consistency(self, source_regions: List[Dict], 
                                  ocr_results: List[Dict]) -> Dict:
        source_count = len(source_regions)
        output_count = len(ocr_results)
        
        source_has_tables = sum(1 for r in source_regions if r.get("is_table", False))
        output_has_tables = sum(1 for r in ocr_results if r.get("type") == "table")
        
        source_text_regions = source_count - source_has_tables
        output_text_regions = output_count - output_has_tables
        
        return {
            "source_total": source_count,
            "output_total": output_count,
            "source_text_regions": source_text_regions,
            "output_text_regions": output_text_regions,
            "source_tables": source_has_tables,
            "output_tables": output_has_tables,
            "count_match": source_count == output_count,
            "text_region_match": source_text_regions == output_text_regions,
            "table_match": source_has_tables == output_has_tables,
            "discrepancy": abs(source_count - output_count)
        }
    
    def find_missing_regions(self, source_image: np.ndarray, 
                              ocr_results: List[Dict]) -> List[Dict]:
        source_regions = self._extract_source_regions(source_image)
        
        missing = []
        
        for i, source in enumerate(source_regions):
            found = False
            
            for ocr in ocr_results:
                similarity = self._calculate_region_similarity(source, ocr)
                if similarity > self.similarity_threshold:
                    found = True
                    break
            
            if not found:
                missing.append({
                    "source_index": i,
                    "bbox": source["bbox"],
                    "pixel_density": source["pixel_density"],
                    "area": source["area"],
                    "estimated_position": self._estimate_text_position(source)
                })
        
        return missing
    
    def _estimate_text_position(self, region: Dict) -> str:
        bbox = region["bbox"]
        y_center = (bbox[1] + bbox[3]) / 2
        
        if y_center < 100:
            return "header"
        elif y_center > 800:
            return "footer"
        else:
            return "body"
