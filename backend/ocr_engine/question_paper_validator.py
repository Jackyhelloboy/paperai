import re
from typing import Dict, List, Tuple
from difflib import SequenceMatcher

class QuestionPaperValidator:
    def __init__(self):
        self.question_patterns = [
            r'(?<!\d)(\d{1,2})\.\s',
            r'(?<!\d)(\d{1,2})\)\s',
            r'(?<!\d)(\d{1,2})\]\s',
            r'(?<!\d)(\d{1,2})\s',
        ]
        
        self.section_patterns = [
            r'SECTION\s*[-–—]\s*([A-Z])',
            r'Section\s*[-–—]\s*([A-Z])',
            r'భాగము\s*[-–—]\s*([A-Z])',
            r'भाग\s*[-–—]\s*([A-Z])',
            r'భాగం\s*[-–—]\s*([A-Z])',
        ]
        
        self.option_patterns = [
            r'\(?([Aa])\)',
            r'\(?([Bb])\)',
            r'\(?([Cc])\)',
            r'\(?([Dd])\)',
            r'\(?([Aa])\)\s',
            r'\(?([Bb])\)\s',
            r'\(?([Cc])\)\s',
            r'\(?([Dd])\)\s',
        ]
        
        self.marks_patterns = [
            r'\[(\d+)\s*Marks?\]',
            r'\((\d+)\s*Marks?\)',
            r'(\d+)\s*Marks?',
            r'(\d+)\s*మార్కులు',
            r'(\d+)\s*अंक',
        ]
        
        self.critical_number_patterns = [
            r'(?<!\d)(\d{1,3})\s*[×x÷+\-=]',
            r'[×x÷+\-=]\s*(\d{1,3})',
            r'(?<!\d)(\d{1,3})\s*(marks|Marks|MARKS)',
            r'(?<!\d)(\d+\.\d+)',
        ]
    
    def validate(self, ocr_results: List[Dict], image: 'np.ndarray') -> List[Dict]:
        validated_pages = []
        
        page_groups = self._group_by_page(ocr_results)
        
        for page_num, page_results in page_groups.items():
            validated = self._validate_page(page_results, image)
            validated_pages.append({
                "page_number": page_num,
                "regions": validated,
                "validation_report": self._generate_validation_report(validated)
            })
        
        return validated_pages
    
    def _group_by_page(self, results: List[Dict]) -> Dict[int, List[Dict]]:
        pages = {}
        
        for result in results:
            page_num = result.get("page", 1)
            if page_num not in pages:
                pages[page_num] = []
            pages[page_num].append(result)
        
        return pages
    
    def _validate_page(self, regions: List[Dict], image: 'np.ndarray') -> List[Dict]:
        all_text = " ".join(r.get("text", "") for r in regions)
        
        questions = self._extract_questions(all_text)
        sections = self._extract_sections(all_text)
        options = self._extract_options(all_text)
        marks = self._extract_marks(all_text)
        critical_numbers = self._extract_critical_numbers(all_text)
        
        validation_issues = []
        
        validation_issues.extend(self._check_question_sequence(questions))
        
        validation_issues.extend(self._check_options_completeness(options, questions, regions))
        
        validation_issues.extend(self._check_marks_consistency(marks, questions))
        
        validation_issues.extend(self._check_critical_numbers(critical_numbers, regions))
        
        validation_issues.extend(self._check_low_confidence_regions(regions))
        
        validation_issues.extend(self._check_critical_low_confidence(regions))
        
        validation_issues.extend(self._check_text_quality(regions))
        
        validation_issues.extend(self._check_duplicate_content(regions))
        
        for region in regions:
            region["validation_issues"] = [
                issue for issue in validation_issues 
                if issue.get("region_index") == region.get("region_index")
            ]
        
        return regions
    
    def _extract_questions(self, text: str) -> List[Dict]:
        questions = []
        
        for pattern in self.question_patterns:
            for match in re.finditer(pattern, text):
                num_str = re.search(r'\d+', match.group())
                if num_str:
                    num = int(num_str.group())
                    questions.append({
                        "number": num,
                        "position": match.start(),
                        "text": match.group().strip()
                    })
        
        seen = set()
        unique_questions = []
        for q in questions:
            if q["number"] not in seen:
                seen.add(q["number"])
                unique_questions.append(q)
        
        return sorted(unique_questions, key=lambda x: x["position"])
    
    def _extract_sections(self, text: str) -> List[Dict]:
        sections = []
        
        for pattern in self.section_patterns:
            for match in re.finditer(pattern, text):
                label = match.group().strip()
                sections.append({
                    "label": label,
                    "position": match.start()
                })
        
        return sorted(sections, key=lambda x: x["position"])
    
    def _extract_options(self, text: str) -> List[Dict]:
        options = []
        
        for pattern in self.option_patterns:
            for match in re.finditer(pattern, text):
                label_match = re.search(r'[A-Da-d]', match.group())
                if label_match:
                    options.append({
                        "label": label_match.group().upper(),
                        "position": match.start(),
                        "text": match.group().strip()
                    })
        
        return options
    
    def _extract_marks(self, text: str) -> List[Dict]:
        marks = []
        
        for pattern in self.marks_patterns:
            for match in re.finditer(pattern, text):
                num_match = re.search(r'\d+', match.group())
                if num_match:
                    marks.append({
                        "marks": int(num_match.group()),
                        "position": match.start(),
                        "text": match.group().strip()
                    })
        
        return marks
    
    def _extract_critical_numbers(self, text: str) -> List[Dict]:
        critical_numbers = []
        
        for pattern in self.critical_number_patterns:
            for match in re.finditer(pattern, text):
                critical_numbers.append({
                    "text": match.group(),
                    "position": match.start(),
                    "is_critical": True
                })
        
        return critical_numbers
    
    def _check_question_sequence(self, questions: List[Dict]) -> List[Dict]:
        issues = []
        
        if not questions:
            return issues
        
        question_numbers = [q["number"] for q in questions]
        expected = list(range(1, max(question_numbers) + 1))
        missing = set(expected) - set(question_numbers)
        
        if missing:
            issues.append({
                "type": "missing_questions",
                "message": f"Possible missing questions: {sorted(missing)}",
                "severity": "warning",
                "missing_numbers": sorted(missing)
            })
        
        duplicates = [n for n in question_numbers if question_numbers.count(n) > 1]
        if duplicates:
            issues.append({
                "type": "duplicate_questions",
                "message": f"Duplicate question numbers: {sorted(set(duplicates))}",
                "severity": "error",
                "duplicate_numbers": sorted(set(duplicates))
            })
        
        if len(question_numbers) > 1:
            for i in range(1, len(question_numbers)):
                gap = question_numbers[i] - question_numbers[i-1]
                if gap > 3:
                    issues.append({
                        "type": "large_gap",
                        "message": f"Large gap between questions {question_numbers[i-1]} and {question_numbers[i]}",
                        "severity": "info",
                        "gap": gap
                    })
        
        return issues
    
    def _check_options_completeness(self, options: List[Dict], 
                                     questions: List[Dict], regions: List[Dict]) -> List[Dict]:
        issues = []
        
        if not options:
            return issues
        
        option_groups = {}
        for opt in options:
            if opt["label"] not in option_groups:
                option_groups[opt["label"]] = []
            option_groups[opt["label"]].append(opt)
        
        expected_options = {"A", "B", "C", "D"}
        found_options = set(option_groups.keys())
        missing_options = expected_options - found_options
        
        if missing_options and found_options:
            issues.append({
                "type": "missing_option_types",
                "message": f"Missing option types: {sorted(missing_options)}",
                "severity": "warning",
                "missing": sorted(missing_options)
            })
        
        return issues
    
    def _check_marks_consistency(self, marks: List[Dict], 
                                  questions: List[Dict]) -> List[Dict]:
        issues = []
        
        if not marks:
            return issues
        
        marks_values = [m["marks"] for m in marks]
        
        if marks_values:
            total_marks = sum(marks_values)
            
            common_totals = [50, 80, 100, 150, 200]
            if total_marks not in common_totals and total_marks > 0:
                issues.append({
                    "type": "unusual_total_marks",
                    "message": f"Total marks ({total_marks}) is not a common total",
                    "severity": "info",
                    "total_marks": total_marks
                })
        
        return issues
    
    def _check_critical_numbers(self, critical_numbers: List[Dict], 
                                 regions: List[Dict]) -> List[Dict]:
        issues = []
        
        for cn in critical_numbers:
            issues.append({
                "type": "critical_number",
                "message": f"Critical number detected: {cn['text']}",
                "severity": "info",
                "position": cn["position"]
            })
        
        return issues
    
    def _check_low_confidence_regions(self, regions: List[Dict]) -> List[Dict]:
        issues = []
        
        for region in regions:
            text = region.get("text", "")
            confidence = region.get("confidence", 0.0)
            
            if confidence < 0.6 and len(text) > 5:
                issues.append({
                    "type": "low_confidence",
                    "message": f"Low confidence region: '{text[:50]}...' ({confidence:.1%})",
                    "severity": "critical",
                    "region_index": region.get("region_index")
                })
        
        return issues
    
    def _check_critical_low_confidence(self, regions: List[Dict]) -> List[Dict]:
        issues = []
        
        for region in regions:
            text = region.get("text", "")
            confidence = region.get("confidence", 0.0)
            has_critical = region.get("has_critical_tokens", False)
            
            if has_critical and confidence < 0.85:
                issues.append({
                    "type": "critical_low_confidence",
                    "message": f"Critical content with low confidence: '{text[:50]}...'",
                    "severity": "critical",
                    "region_index": region.get("region_index")
                })
        
        return issues
    
    def _check_text_quality(self, regions: List[Dict]) -> List[Dict]:
        issues = []
        
        for region in regions:
            text = region.get("text", "")
            
            if not text:
                continue
            
            garbled_chars = sum(1 for c in text if not c.isprintable() and c not in ['\n', '\t'])
            if garbled_chars > len(text) * 0.1:
                issues.append({
                    "type": "garbled_text",
                    "message": f"Possible garbled text detected",
                    "severity": "warning",
                    "region_index": region.get("region_index")
                })
            
            repeated_chars = re.findall(r'(.)\1{3,}', text)
            if repeated_chars:
                issues.append({
                    "type": "repeated_characters",
                    "message": f"Repeated characters detected: {''.join(repeated_chars[:3])}",
                    "severity": "info",
                    "region_index": region.get("region_index")
                })
        
        return issues
    
    def _check_duplicate_content(self, regions: List[Dict]) -> List[Dict]:
        issues = []
        
        text_contents = [r.get("text", "") for r in regions if r.get("text")]
        
        for i in range(len(text_contents)):
            for j in range(i + 1, len(text_contents)):
                similarity = SequenceMatcher(None, text_contents[i], text_contents[j]).ratio()
                
                if similarity > 0.9:
                    issues.append({
                        "type": "duplicate_content",
                        "message": f"Near-duplicate content detected",
                        "severity": "warning",
                        "similarity": similarity
                    })
        
        return issues
    
    def _generate_validation_report(self, regions: List[Dict]) -> Dict:
        total_regions = len(regions)
        low_confidence = sum(1 for r in regions if r.get("confidence", 1.0) < 0.75)
        has_math = sum(1 for r in regions if r.get("has_math", False))
        has_critical = sum(1 for r in regions if r.get("has_critical_tokens", False))
        
        all_issues = []
        for r in regions:
            all_issues.extend(r.get("validation_issues", []))
        
        issues_by_type = {}
        for issue in all_issues:
            issue_type = issue.get("type", "unknown")
            if issue_type not in issues_by_type:
                issues_by_type[issue_type] = 0
            issues_by_type[issue_type] += 1
        
        return {
            "total_regions": total_regions,
            "low_confidence_regions": low_confidence,
            "regions_with_math": has_math,
            "regions_with_critical_tokens": has_critical,
            "overall_confidence": (
                sum(r.get("confidence", 0) for r in regions) / total_regions
                if total_regions > 0 else 0
            ),
            "total_issues": len(all_issues),
            "issues_by_type": issues_by_type,
            "has_critical_issues": any(i.get("severity") == "critical" for i in all_issues)
        }
