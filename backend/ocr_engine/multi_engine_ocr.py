"""
Multi-Engine OCR System with Self-Improvement
Uses EasyOCR + Tesseract + OCR.space API for maximum accuracy
"""
import cv2
import numpy as np
import easyocr
import pytesseract
import requests
import json
import os
import re
import time
import sys
import io
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher
from pathlib import Path
import hashlib

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

class MultiEngineOCR:
    def __init__(self):
        self.easyocr_reader = None
        self.ocr_space_api_key = "K85588504388957"  # Free API key
        self.error_log_path = "D:/Paper Ai/training_data/error_log.json"
        self.training_data_path = "D:/Paper Ai/training_data/samples"
        self._init_engines()
    
    def _init_engines(self):
        """Initialize all OCR engines"""
        print("Initializing OCR engines...")
        
        # EasyOCR - English + Hindi
        try:
            self.easyocr_reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
            print("[OK] EasyOCR initialized (en, hi)")
        except Exception as e:
            print(f"[FAIL] EasyOCR failed: {e}")
        
        # Create training data directory
        os.makedirs(self.training_data_path, exist_ok=True)
        os.makedirs(os.path.dirname(self.error_log_path), exist_ok=True)
    
    def extract_text(self, image_path: str, use_api: bool = True) -> Dict:
        """
        Extract text using multiple engines and return the best result
        No corrections, no suggestions - pure extraction
        """
        start_time = time.time()
        
        # Read image
        image = cv2.imread(image_path)
        if image is None:
            return {"error": "Could not read image", "text": ""}
        
        results = []
        
        # Engine 1: EasyOCR (Local, fast)
        easyocr_result = self._run_easyocr(image)
        if easyocr_result:
            results.append({"engine": "easyocr", **easyocr_result})
        
        # Engine 2: Tesseract (Local, good for printed)
        tesseract_result = self._run_tesseract(image)
        if tesseract_result:
            results.append({"engine": "tesseract", **tesseract_result})
        
        # Engine 3: OCR.space API (Cloud, best for handwriting)
        if use_api:
            api_result = self._run_ocr_space_api(image_path)
            if api_result:
                results.append({"engine": "ocr_space", **api_result})
        
        # Vote on best result
        final_result = self._vote_best_result(results)
        
        processing_time = time.time() - start_time
        
        return {
            "text": final_result["text"],
            "confidence": final_result["confidence"],
            "engine_used": final_result.get("engine", "unknown"),
            "all_results": results,
            "processing_time": round(processing_time, 2),
            "image_path": image_path
        }
    
    def _run_easyocr(self, image: np.ndarray) -> Optional[Dict]:
        """Run EasyOCR engine"""
        if self.easyocr_reader is None:
            return None
        
        try:
            results = self.easyocr_reader.readtext(
                image,
                detail=1,
                paragraph=False,
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
                    if len(text.strip()) > 0:
                        texts.append(text)
                        confidences.append(confidence)
                
                if texts:
                    return {
                        "text": " ".join(texts),
                        "confidence": float(np.mean(confidences)),
                        "line_count": len(texts)
                    }
        except Exception as e:
            pass
        
        return None
    
    def _run_tesseract(self, image: np.ndarray) -> Optional[Dict]:
        """Run Tesseract OCR engine"""
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Try different PSM modes for better accuracy
            configs = [
                "--psm 6 --oem 3",  # Single block
                "--psm 3 --oem 3",  # Fully automatic
                "--psm 4 --oem 3",  # Single column
            ]
            
            best_text = ""
            best_confidence = 0
            
            for config in configs:
                try:
                    # Get detailed output
                    data = pytesseract.image_to_data(gray, config=config, output_type=pytesseract.Output.DICT)
                    
                    texts = []
                    confidences = []
                    
                    for i, text in enumerate(data["text"]):
                        conf = int(data["conf"][i])
                        if conf > 0 and len(text.strip()) > 0:
                            texts.append(text)
                            confidences.append(conf / 100.0)
                    
                    if texts and np.mean(confidences) > best_confidence:
                        best_text = " ".join(texts)
                        best_confidence = np.mean(confidences)
                except:
                    continue
            
            if best_text:
                return {
                    "text": best_text,
                    "confidence": float(best_confidence),
                    "engine": "tesseract"
                }
        except Exception as e:
            pass
        
        return None
    
    def _run_ocr_space_api(self, image_path: str) -> Optional[Dict]:
        """Run OCR.space API (free tier, good for handwriting)"""
        try:
            with open(image_path, "rb") as f:
                image_data = f.read()
            
            # OCR.space API endpoint
            url = "https://api.ocr.space/parse/image"
            
            headers = {
                "apikey": self.ocr_space_api_key
            }
            
            data = {
                "language": "eng",  # English
                "isOverlayRequired": "false",
                "OCREngine": "3",  # Engine 3 - best for handwriting
                "scale": "true",
                "isTable": "true"
            }
            
            files = {
                "filename": (os.path.basename(image_path), image_data, "image/jpeg")
            }
            
            response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get("ParsedResults"):
                    text = result["ParsedResults"][0].get("ParsedText", "")
                    confidence = result["ParsedResults"][0].get("FileParseExitCode", 0)
                    
                    # Convert exit code to confidence
                    conf_map = {1: 0.95, 2: 0.80, 3: 0.60, 4: 0.40}
                    confidence = conf_map.get(confidence, 0.5)
                    
                    if text.strip():
                        return {
                            "text": text.strip(),
                            "confidence": float(confidence),
                            "engine": "ocr_space"
                        }
        except Exception as e:
            pass
        
        return None
    
    def _vote_best_result(self, results: List[Dict]) -> Dict:
        """Vote on the best result from multiple engines"""
        if not results:
            return {"text": "", "confidence": 0.0, "engine": "none"}
        
        if len(results) == 1:
            return results[0]
        
        # Group similar results
        groups = []
        for result in results:
            text = result["text"]
            matched = False
            
            for group in groups:
                similarity = SequenceMatcher(None, text, group[0]["text"]).ratio()
                if similarity > 0.5:
                    group.append(result)
                    matched = True
                    break
            
            if not matched:
                groups.append([result])
        
        # Find best group
        best_group = max(groups, key=lambda g: len(g))
        
        # From best group, pick highest confidence
        best = max(best_group, key=lambda r: r.get("confidence", 0))
        
        # Boost confidence if multiple engines agree
        if len(best_group) > 1:
            best["confidence"] = min(1.0, best["confidence"] * 1.1)
        
        return best
    
    def save_for_training(self, image_path: str, extracted_text: str, 
                          corrections: str = None) -> str:
        """Save extracted text for future training/improvement"""
        # Create unique filename based on image hash
        with open(image_path, "rb") as f:
            image_hash = hashlib.md5(f.read()).hexdigest()[:12]
        
        sample = {
            "image_path": image_path,
            "image_hash": image_hash,
            "extracted_text": extracted_text,
            "corrections": corrections,
            "timestamp": time.time()
        }
        
        # Save sample
        sample_path = os.path.join(self.training_data_path, f"{image_hash}.json")
        with open(sample_path, "w", encoding="utf-8") as f:
            json.dump(sample, f, ensure_ascii=False, indent=2)
        
        return sample_path
    
    def log_error(self, image_path: str, expected: str, extracted: str, 
                  engine: str, error_type: str):
        """Log errors for self-improvement"""
        error_entry = {
            "image_path": image_path,
            "expected": expected,
            "extracted": extracted,
            "engine": engine,
            "error_type": error_type,
            "timestamp": time.time()
        }
        
        # Load existing log
        errors = []
        if os.path.exists(self.error_log_path):
            try:
                with open(self.error_log_path, "r", encoding="utf-8") as f:
                    errors = json.load(f)
            except:
                errors = []
        
        errors.append(error_entry)
        
        # Save updated log
        with open(self.error_log_path, "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)
    
    def calculate_accuracy(self, original: str, extracted: str) -> Dict:
        """Calculate accuracy between original and extracted text"""
        orig_norm = original.lower().strip()
        ext_norm = extracted.lower().strip()
        
        # Character accuracy
        char_matcher = SequenceMatcher(None, orig_norm, ext_norm)
        char_accuracy = sum(b.size for b in char_matcher.get_matching_blocks()) / max(len(orig_norm), 1)
        
        # Word accuracy
        orig_words = set(orig_norm.split())
        ext_words = set(ext_norm.split())
        word_accuracy = len(orig_words.intersection(ext_words)) / max(len(orig_words), 1)
        
        # Sequence similarity
        seq_similarity = SequenceMatcher(None, orig_norm, ext_norm).ratio()
        
        # Overall
        overall = (char_accuracy * 0.3 + word_accuracy * 0.3 + seq_similarity * 0.4)
        
        return {
            "char_accuracy": round(char_accuracy * 100, 2),
            "word_accuracy": round(word_accuracy * 100, 2),
            "sequence_similarity": round(seq_similarity * 100, 2),
            "overall_accuracy": round(overall * 100, 2)
        }


class SelfImprovingOCR(MultiEngineOCR):
    """OCR system that improves itself over time"""
    
    def __init__(self):
        super().__init__()
        self.performance_history = self._load_performance_history()
    
    def _load_performance_history(self) -> Dict:
        """Load historical performance data"""
        history_path = "D:/Paper Ai/training_data/performance_history.json"
        if os.path.exists(history_path):
            try:
                with open(history_path, "r") as f:
                    return json.load(f)
            except:
                pass
        return {"tests": [], "improvements": []}
    
    def _save_performance_history(self):
        """Save performance history"""
        history_path = "D:/Paper Ai/training_data/performance_history.json"
        with open(history_path, "w") as f:
            json.dump(self.performance_history, f, indent=2)
    
    def process_and_learn(self, image_path: str, original_text: str = None) -> Dict:
        """
        Process image and learn from corrections if provided
        This is the main self-improvement loop
        """
        # Extract text
        result = self.extract_text(image_path)
        
        # If original text provided, calculate accuracy and learn
        if original_text:
            accuracy = self.calculate_accuracy(original_text, result["text"])
            result["accuracy"] = accuracy
            
            # Log if accuracy is low
            if accuracy["overall_accuracy"] < 80:
                self.log_error(
                    image_path, 
                    original_text, 
                    result["text"],
                    result.get("engine_used", "unknown"),
                    "low_accuracy"
                )
            
            # Save for training
            self.save_for_training(image_path, result["text"], original_text)
            
            # Update performance history
            self.performance_history["tests"].append({
                "image": image_path,
                "accuracy": accuracy,
                "engine": result.get("engine_used"),
                "timestamp": time.time()
            })
            self._save_performance_history()
        
        return result
    
    def get_improvement_suggestions(self) -> List[str]:
        """Analyze errors and suggest improvements"""
        suggestions = []
        
        if not os.path.exists(self.error_log_path):
            return ["No error data yet. Process more images to get suggestions."]
        
        try:
            with open(self.error_log_path, "r") as f:
                errors = json.load(f)
        except:
            return ["Could not load error log."]
        
        # Analyze error patterns
        engine_errors = {}
        for error in errors:
            engine = error.get("engine", "unknown")
            if engine not in engine_errors:
                engine_errors[engine] = 0
            engine_errors[engine] += 1
        
        # Generate suggestions
        if engine_errors:
            worst_engine = max(engine_errors, key=engine_errors.get)
            suggestions.append(f"Engine '{worst_engine}' has most errors ({engine_errors[worst_engine]}). Consider using alternatives.")
        
        if len(errors) > 10:
            suggestions.append("Consider training with more diverse samples.")
        
        return suggestions if suggestions else ["System performing well. Continue processing."]
    
    def get_performance_report(self) -> Dict:
        """Get performance report"""
        tests = self.performance_history.get("tests", [])
        
        if not tests:
            return {"message": "No tests performed yet."}
        
        accuracies = [t["accuracy"]["overall_accuracy"] for t in tests]
        
        return {
            "total_tests": len(tests),
            "average_accuracy": round(np.mean(accuracies), 2),
            "best_accuracy": round(max(accuracies), 2),
            "worst_accuracy": round(min(accuracies), 2),
            "recent_trend": "improving" if len(accuracies) > 1 and accuracies[-1] > accuracies[0] else "stable"
        }


def run_demo():
    """Run demonstration of the multi-engine OCR system"""
    print("=" * 70)
    print("MULTI-ENGINE OCR SYSTEM WITH SELF-IMPROVEMENT")
    print("=" * 70)
    
    # Initialize
    ocr = SelfImprovingOCR()
    
    # Create test image
    test_image_path = "D:/Paper Ai/test_data/clean_test.jpg"
    
    if os.path.exists(test_image_path):
        print(f"\nProcessing: {test_image_path}")
        print("-" * 50)
        
        result = ocr.process_and_learn(test_image_path)
        
        print(f"\nResult:")
        print(f"Text: {result['text'][:200]}...")
        print(f"Confidence: {result['confidence']:.2%}")
        print(f"Engine: {result.get('engine_used', 'N/A')}")
        print(f"Time: {result['processing_time']}s")
        
        # Show all engine results
        if result.get("all_results"):
            print(f"\nAll Engine Results:")
            for r in result["all_results"]:
                print(f"  - {r.get('engine', 'N/A')}: {r['text'][:50]}... ({r['confidence']:.2%})")
    
    # Show performance report
    print("\n" + "=" * 70)
    print("PERFORMANCE REPORT")
    print("=" * 70)
    report = ocr.get_performance_report()
    for key, value in report.items():
        print(f"  {key}: {value}")
    
    # Show improvement suggestions
    print("\n" + "=" * 70)
    print("IMPROVEMENT SUGGESTIONS")
    print("=" * 70)
    suggestions = ocr.get_improvement_suggestions()
    for s in suggestions:
        print(f"  • {s}")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    run_demo()
