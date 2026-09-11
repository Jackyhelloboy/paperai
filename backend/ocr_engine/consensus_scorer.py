from typing import Dict, List, Tuple
from difflib import SequenceMatcher
import re
import unicodedata

class ConsensusScorer:
    def __init__(self):
        self.score_weights = {
            "text_confidence": 0.25,
            "voting_agreement": 0.20,
            "second_pass_agreement": 0.15,
            "script_validity": 0.10,
            "layout_agreement": 0.08,
            "critical_token_agreement": 0.10,
            "document_rules": 0.05,
            "unicode_validity": 0.04,
            "source_comparison": 0.03
        }
        
        self.confidence_thresholds = {
            "verified": 0.95,
            "high": 0.88,
            "medium": 0.75,
            "low": 0.0
        }
        
        self.critical_thresholds = {
            "verified": 0.98,
            "high": 0.93,
            "medium": 0.85,
            "low": 0.0
        }
    
    def score(self, pages: List[Dict]) -> List[Dict]:
        scored_pages = []
        
        for page in pages:
            scored_regions = self._score_regions(page.get("regions", []))
            
            page_confidence = self._calculate_page_confidence(scored_regions)
            structural_integrity = self._check_structural_integrity(scored_regions)
            
            scored_page = {
                **page,
                "regions": scored_regions,
                "page_confidence": page_confidence,
                "structural_integrity": structural_integrity
            }
            scored_pages.append(scored_page)
        
        return scored_pages
    
    def _score_regions(self, regions: List[Dict]) -> List[Dict]:
        scored = []
        
        for region in regions:
            scores = self._calculate_region_scores(region)
            overall_score = self._weighted_average(scores)
            confidence_level = self._get_confidence_level(overall_score, region)
            
            is_critical = region.get("has_critical_tokens", False)
            has_math = region.get("has_math", False)
            
            if is_critical or has_math:
                overall_score = self._apply_critical_penalty(overall_score, region)
                confidence_level = self._get_confidence_level(overall_score, region)
            
            scored_region = {
                **region,
                "scores": scores,
                "overall_score": overall_score,
                "confidence_level": confidence_level,
                "needs_review": overall_score < self.confidence_thresholds["medium"],
                "review_priority": self._calculate_review_priority(overall_score, region)
            }
            scored.append(scored_region)
        
        return scored
    
    def _calculate_region_scores(self, region: Dict) -> Dict[str, float]:
        scores = {}
        
        scores["text_confidence"] = region.get("confidence", 0.0)
        
        voting_result = region.get("voting_result", {})
        if voting_result:
            agreement_ratio = voting_result.get("agreement_ratio", 1.0)
            group_size = voting_result.get("group_size", 1)
            scores["voting_agreement"] = min(1.0, agreement_ratio * 0.7 + (group_size / 12) * 0.3)
        else:
            scores["voting_agreement"] = 1.0
        
        scores["second_pass_agreement"] = self._check_second_pass_agreement(region)
        
        scores["script_validity"] = self._check_script_validity(region)
        
        scores["layout_agreement"] = self._check_layout_agreement(region)
        
        scores["critical_token_agreement"] = self._check_critical_tokens(region)
        
        scores["document_rules"] = self._check_document_rules(region)
        
        scores["unicode_validity"] = self._check_unicode_validity(region)
        
        scores["source_comparison"] = self._check_source_comparison(region)
        
        return scores
    
    def _check_second_pass_agreement(self, region: Dict) -> float:
        alternatives = region.get("alternatives", [])
        text = region.get("text", "")
        
        if not alternatives or not text:
            return 1.0
        
        similarities = []
        for alt in alternatives[:3]:
            alt_text = alt.get("text", "")
            if alt_text:
                sim = SequenceMatcher(None, text, alt_text).ratio()
                similarities.append(sim)
        
        if not similarities:
            return 1.0
        
        avg_similarity = sum(similarities) / len(similarities)
        max_similarity = max(similarities)
        
        return avg_similarity * 0.6 + max_similarity * 0.4
    
    def _check_script_validity(self, region: Dict) -> float:
        text = region.get("text", "")
        language = region.get("detected_language", "en")
        
        if not text:
            return 1.0
        
        validity_score = 1.0
        
        if language == "hi":
            devanagari_chars = sum(1 for c in text if 0x0900 <= ord(c) <= 0x097F)
            total_alpha = sum(1 for c in text if c.isalpha())
            
            if total_alpha > 0:
                devanagari_ratio = devanagari_chars / total_alpha
                if devanagari_ratio > 0.5:
                    validity_score = 0.8 + devanagari_ratio * 0.2
                elif devanagari_ratio > 0.2:
                    validity_score = 0.6 + devanagari_ratio * 0.2
                else:
                    validity_score = 0.5
        
        elif language == "te":
            telugu_chars = sum(1 for c in text if 0x0C00 <= ord(c) <= 0x0C7F)
            total_alpha = sum(1 for c in text if c.isalpha())
            
            if total_alpha > 0:
                telugu_ratio = telugu_chars / total_alpha
                if telugu_ratio > 0.5:
                    validity_score = 0.8 + telugu_ratio * 0.2
                elif telugu_ratio > 0.2:
                    validity_score = 0.6 + telugu_ratio * 0.2
                else:
                    validity_score = 0.5
        
        elif language == "en":
            latin_chars = sum(1 for c in text if c.isalpha() and ord(c) < 128)
            total_alpha = sum(1 for c in text if c.isalpha())
            
            if total_alpha > 0:
                latin_ratio = latin_chars / total_alpha
                if latin_ratio > 0.7:
                    validity_score = 0.8 + latin_ratio * 0.2
                elif latin_ratio > 0.3:
                    validity_score = 0.6 + latin_ratio * 0.2
                else:
                    validity_score = 0.5
        
        return validity_score
    
    def _check_layout_agreement(self, region: Dict) -> float:
        bbox = region.get("bbox", [0, 0, 0, 0])
        region_type = region.get("region_type", "block")
        text = region.get("text", "")
        
        if not text:
            return 1.0
        
        x1, y1, x2, y2 = bbox
        width = x2 - x1
        height = y2 - y1
        
        if width <= 0 or height <= 0:
            return 0.5
        
        aspect_ratio = width / height
        
        score = 1.0
        
        if region_type == "heading":
            if aspect_ratio > 3:
                score *= 1.0
            elif aspect_ratio < 1.5:
                score *= 0.85
        
        elif region_type == "line":
            if aspect_ratio > 20:
                score *= 1.0
            elif aspect_ratio < 5:
                score *= 0.9
        
        elif region_type == "table":
            if aspect_ratio > 0.5:
                score *= 1.0
            else:
                score *= 0.8
        
        char_density = len(text) / (width * height) if width * height > 0 else 0
        if char_density > 0.01:
            score *= 0.95
        
        return score
    
    def _check_critical_tokens(self, region: Dict) -> float:
        critical_tokens = region.get("critical_tokens", [])
        text = region.get("text", "")
        confidence = region.get("confidence", 0.0)
        voting_result = region.get("voting_result", {})
        
        if not critical_tokens:
            return 1.0
        
        score = 1.0
        
        if confidence < 0.85:
            score *= 0.7
        
        if confidence < 0.7:
            score *= 0.5
        
        number_count = sum(1 for t in critical_tokens if t.get("type") == "number")
        if number_count > 0 and confidence < 0.9:
            score *= 0.8
        
        if voting_result and voting_result.get("group_size", 1) > 1:
            score *= 1.1
        
        return min(1.0, score)
    
    def _check_document_rules(self, region: Dict) -> float:
        text = region.get("text", "")
        
        if not text:
            return 1.0
        
        score = 1.0
        
        if text.count('(') != text.count(')'):
            score *= 0.85
        
        if text.count('[') != text.count(']'):
            score *= 0.85
        
        if text.count('{') != text.count('}'):
            score *= 0.85
        
        if len(text) > 1:
            if text[0].isdigit() and len(text) > 1 and text[1] not in ['.', ')', ']', ' ']:
                score *= 0.95
        
        consecutive_operators = re.findall(r'[+\-=×÷]{2,}', text)
        if consecutive_operators:
            score *= 0.9
        
        return score
    
    def _check_unicode_validity(self, region: Dict) -> float:
        text = region.get("text", "")
        language = region.get("detected_language", "en")
        
        if not text:
            return 1.0
        
        score = 1.0
        
        if language == "hi":
            for char in text:
                if char.isalpha():
                    if not (0x0900 <= ord(char) <= 0x097F) and ord(char) < 128:
                        continue
                    elif not (0x0900 <= ord(char) <= 0x097F):
                        score *= 0.95
        
        elif language == "te":
            for char in text:
                if char.isalpha():
                    if not (0x0C00 <= ord(char) <= 0x0C7F) and ord(char) < 128:
                        continue
                    elif not (0x0C00 <= ord(char) <= 0x0C7F):
                        score *= 0.95
        
        try:
            normalized = unicodedata.normalize('NFC', text)
        except:
            score *= 0.9
        
        return score
    
    def _check_source_comparison(self, region: Dict) -> float:
        source_comparison = region.get("source_comparison", {})
        
        if not source_comparison:
            return 1.0
        
        similarity = source_comparison.get("similarity", 1.0)
        
        return similarity
    
    def _apply_critical_penalty(self, score: float, region: Dict) -> float:
        confidence = region.get("confidence", 0.0)
        
        if confidence < 0.8:
            score *= 0.85
        
        if confidence < 0.7:
            score *= 0.75
        
        voting_result = region.get("voting_result", {})
        if voting_result and voting_result.get("group_size", 1) < 2:
            score *= 0.95
        
        return score
    
    def _calculate_review_priority(self, score: float, region: Dict) -> int:
        if score >= self.confidence_thresholds["verified"]:
            return 0
        elif score >= self.confidence_thresholds["high"]:
            return 1
        elif score >= self.confidence_thresholds["medium"]:
            return 2
        else:
            priority = 3
            
            if region.get("has_critical_tokens", False):
                priority += 2
            
            if region.get("has_math", False):
                priority += 1
            
            return priority
    
    def _weighted_average(self, scores: Dict[str, float]) -> float:
        total = 0.0
        weight_sum = 0.0
        
        for key, weight in self.score_weights.items():
            if key in scores:
                total += scores[key] * weight
                weight_sum += weight
        
        return total / weight_sum if weight_sum > 0 else 0.0
    
    def _get_confidence_level(self, score: float, region: Dict) -> str:
        is_critical = region.get("has_critical_tokens", False)
        has_math = region.get("has_math", False)
        
        if is_critical or has_math:
            thresholds = self.critical_thresholds
        else:
            thresholds = self.confidence_thresholds
        
        if score >= thresholds["verified"]:
            return "verified"
        elif score >= thresholds["high"]:
            return "high"
        elif score >= thresholds["medium"]:
            return "medium"
        else:
            return "low"
    
    def _calculate_page_confidence(self, regions: List[Dict]) -> float:
        if not regions:
            return 0.0
        
        scores = [r.get("overall_score", 0.0) for r in regions]
        
        if not scores:
            return 0.0
        
        weights = []
        for r in regions:
            w = 1.0
            if r.get("has_critical_tokens", False):
                w = 1.5
            if r.get("has_math", False):
                w = 1.3
            weights.append(w)
        
        total_weight = sum(weights)
        weighted_score = sum(s * w for s, w in zip(scores, weights)) / total_weight
        
        return weighted_score
    
    def _check_structural_integrity(self, regions: List[Dict]) -> Dict:
        question_numbers = []
        section_labels = []
        option_counts = []
        
        for region in regions:
            text = region.get("text", "")
            
            q_match = re.search(r'(?<!\d)(\d{1,2})\.\s', text)
            if q_match:
                question_numbers.append(int(q_match.group(1)))
            
            sec_match = re.search(r'SECTION\s*[-–—]\s*([A-Z])', text, re.IGNORECASE)
            if sec_match:
                section_labels.append(sec_match.group(1))
            
            opt_match = re.findall(r'\(?([A-Da-d])\)', text)
            if opt_match:
                option_counts.append(len(opt_match))
        
        issues = []
        
        if question_numbers:
            expected = list(range(1, max(question_numbers) + 1))
            missing = set(expected) - set(question_numbers)
            if missing:
                issues.append({
                    "type": "missing_questions",
                    "missing": sorted(missing),
                    "severity": "warning"
                })
        
        for i, count in enumerate(option_counts):
            if count < 4 and count > 0:
                issues.append({
                    "type": "incomplete_options",
                    "region_index": i,
                    "found": count,
                    "expected": 4,
                    "severity": "info"
                })
        
        return {
            "question_count": len(question_numbers),
            "section_count": len(section_labels),
            "issues": issues,
            "has_structure": len(question_numbers) > 0 or len(section_labels) > 0
        }
    
    def get_summary(self, pages: List[Dict]) -> Dict:
        total_regions = 0
        verified = 0
        high = 0
        medium = 0
        low = 0
        
        total_score = 0.0
        
        for page in pages:
            for region in page.get("regions", []):
                total_regions += 1
                level = region.get("confidence_level", "low")
                score = region.get("overall_score", 0.0)
                
                total_score += score
                
                if level == "verified":
                    verified += 1
                elif level == "high":
                    high += 1
                elif level == "medium":
                    medium += 1
                else:
                    low += 1
        
        return {
            "total_regions": total_regions,
            "verified": verified,
            "high_confidence": high,
            "medium_confidence": medium,
            "low_confidence": low,
            "verification_rate": verified / total_regions if total_regions > 0 else 0,
            "high_confidence_rate": (verified + high) / total_regions if total_regions > 0 else 0,
            "average_score": total_score / total_regions if total_regions > 0 else 0
        }
