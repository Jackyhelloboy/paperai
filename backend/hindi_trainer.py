"""
Hindi Handwriting Training System
Processes all test images, extracts text, saves for improvement
"""
import cv2
import numpy as np
import easyocr
import pytesseract
import requests
import json
import os
import sys
import io
import time
from pathlib import Path
from difflib import SequenceMatcher

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Paths
HINDI_DIR = "D:/Paper Ai/test_data/Hindi"
TRAINING_DIR = "D:/Paper Ai/training_data/hindi"
PROCESSED_FILE = "D:/Paper Ai/training_data/hindi_progress.json"

os.makedirs(TRAINING_DIR, exist_ok=True)

class HindiTrainer:
    def __init__(self):
        print("Initializing Hindi OCR Training System...")
        
        # EasyOCR with Hindi
        print("Loading EasyOCR (en, hi)...")
        self.easyocr_reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
        
        # Tesseract Hindi
        self.tesseract_config = "--psm 6 --oem 3 -l hin+eng"
        
        print("Ready!")
    
    def extract_with_easyocr(self, image_path):
        """Extract using EasyOCR"""
        try:
            results = self.easyocr_reader.readtext(
                image_path,
                detail=1,
                paragraph=False,
                text_threshold=0.3,
                low_text=0.2,
                link_threshold=0.3,
                canvas_size=256,
                mag_ratio=2.0
            )
            
            texts = []
            for (bbox, text, conf) in results:
                if len(text.strip()) > 0:
                    texts.append(text)
            
            return {
                "text": " ".join(texts),
                "confidence": float(np.mean([c for _, _, c in results])) if results else 0,
                "line_count": len(texts)
            }
        except Exception as e:
            return {"text": "", "confidence": 0, "error": str(e)}
    
    def extract_with_tesseract(self, image_path):
        """Extract using Tesseract"""
        try:
            image = cv2.imread(image_path)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Try multiple PSM modes
            best_text = ""
            best_conf = 0
            
            for psm in [6, 3, 4, 11]:
                try:
                    config = f"--psm {psm} --oem 3 -l hin+eng"
                    data = pytesseract.image_to_data(gray, config=config, output_type=pytesseract.Output.DICT)
                    
                    texts = []
                    confs = []
                    for i, text in enumerate(data["text"]):
                        conf = int(data["conf"][i])
                        if conf > 0 and len(text.strip()) > 0:
                            texts.append(text)
                            confs.append(conf)
                    
                    if texts and np.mean(confs) > best_conf:
                        best_text = " ".join(texts)
                        best_conf = np.mean(confs) / 100.0
                except:
                    continue
            
            return {"text": best_text, "confidence": best_conf}
        except Exception as e:
            return {"text": "", "confidence": 0, "error": str(e)}
    
    def extract_with_ocrspace(self, image_path):
        """Extract using OCR.space API"""
        try:
            api_key = "K85588504388957"
            
            with open(image_path, "rb") as f:
                image_data = f.read()
            
            url = "https://api.ocr.space/parse/image"
            
            headers = {"apikey": api_key}
            data = {
                "language": "hin",  # Hindi
                "isOverlayRequired": "false",
                "OCREngine": "2",
                "scale": "true",
                "isTable": "true"
            }
            
            files = {"filename": (os.path.basename(image_path), image_data, "image/jpeg")}
            
            response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("ParsedResults"):
                    text = result["ParsedResults"][0].get("ParsedText", "")
                    return {"text": text.strip(), "confidence": 0.9}
            
            return {"text": "", "confidence": 0}
        except Exception as e:
            return {"text": "", "confidence": 0, "error": str(e)}
    
    def preprocess_image(self, image_path):
        """Enhance image for better OCR"""
        image = cv2.imread(image_path)
        if image is None:
            return None
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply CLAHE for contrast enhancement
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Denoise
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10)
        
        # Threshold
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Save enhanced image
        enhanced_path = image_path.replace(".jpg", "_enhanced.jpg").replace(".png", "_enhanced.jpg")
        cv2.imwrite(enhanced_path, thresh)
        
        return enhanced_path
    
    def vote_best(self, results):
        """Vote on best result from multiple engines"""
        valid = [r for r in results if r.get("text", "").strip()]
        
        if not valid:
            return {"text": "", "confidence": 0, "engine": "none"}
        
        if len(valid) == 1:
            return valid[0]
        
        # Group similar results
        groups = []
        for result in valid:
            text = result["text"]
            matched = False
            for group in groups:
                sim = SequenceMatcher(None, text, group[0]["text"]).ratio()
                if sim > 0.3:
                    group.append(result)
                    matched = True
                    break
            if not matched:
                groups.append([result])
        
        # Best group = most engines agree
        best_group = max(groups, key=len)
        
        # Best in group = highest confidence
        best = max(best_group, key=lambda r: r.get("confidence", 0))
        
        # Boost if multiple agree
        if len(best_group) > 1:
            best["confidence"] = min(1.0, best["confidence"] * 1.15)
        
        best["engines_agreed"] = len(best_group)
        return best
    
    def process_all_images(self):
        """Process all Hindi test images"""
        hindi_dir = Path(HINDI_DIR)
        image_files = list(hindi_dir.glob("*.jpg")) + list(hindi_dir.glob("*.png"))
        
        print(f"\nFound {len(image_files)} Hindi images to process")
        print("=" * 60)
        
        # Load progress
        progress = {}
        if os.path.exists(PROCESSED_FILE):
            with open(PROCESSED_FILE, "r", encoding="utf-8") as f:
                progress = json.load(f)
        
        results = []
        
        for i, img_path in enumerate(image_files):
            img_name = img_path.name
            
            # Skip if already processed
            if img_name in progress and progress[img_name].get("status") == "done":
                print(f"[{i+1}/{len(image_files)}] {img_name} - Already processed, skipping")
                continue
            
            print(f"\n[{i+1}/{len(image_files)}] Processing: {img_name}")
            
            # Get enhanced version
            enhanced_path = self.preprocess_image(str(img_path))
            
            # Run all engines
            all_results = []
            
            # EasyOCR
            r1 = self.extract_with_easyocr(str(img_path))
            r1["engine"] = "easyocr"
            all_results.append(r1)
            print(f"  EasyOCR: {r1['confidence']:.1%} - {r1['text'][:60]}...")
            
            # EasyOCR on enhanced
            if enhanced_path:
                r1e = self.extract_with_easyocr(enhanced_path)
                r1e["engine"] = "easyocr_enhanced"
                all_results.append(r1e)
            
            # Tesseract
            r2 = self.extract_with_tesseract(str(img_path))
            r2["engine"] = "tesseract"
            all_results.append(r2)
            print(f"  Tesseract: {r2['confidence']:.1%} - {r2['text'][:60]}...")
            
            # OCR.space
            r3 = self.extract_with_ocrspace(str(img_path))
            r3["engine"] = "ocrspace"
            all_results.append(r3)
            print(f"  OCR.space: {r3['confidence']:.1%} - {r3['text'][:60]}...")
            
            # Vote best
            best = self.vote_best(all_results)
            print(f"  BEST: {best['confidence']:.1%} ({best.get('engine', 'unknown')})")
            
            # Save sample for training
            sample = {
                "filename": img_name,
                "image_path": str(img_path),
                "extracted_text": best["text"],
                "confidence": best["confidence"],
                "engine_used": best.get("engine", "unknown"),
                "engines_agreed": best.get("engines_agreed", 1),
                "all_results": [{"engine": r["engine"], "text": r["text"], "confidence": r["confidence"]} for r in all_results if r.get("text")],
                "timestamp": time.time(),
                "needs_correction": True
            }
            
            # Save to training directory
            sample_path = os.path.join(TRAINING_DIR, f"{img_name.replace('.jpg', '').replace('.png', '')}.json")
            with open(sample_path, "w", encoding="utf-8") as f:
                json.dump(sample, f, ensure_ascii=False, indent=2)
            
            results.append(sample)
            
            # Update progress
            progress[img_name] = {
                "status": "done",
                "best_confidence": best["confidence"],
                "best_engine": best.get("engine", "unknown")
            }
            
            # Save progress
            with open(PROCESSED_FILE, "w", encoding="utf-8") as f:
                json.dump(progress, f, ensure_ascii=False, indent=2)
        
        # Summary
        print("\n" + "=" * 60)
        print("TRAINING SUMMARY")
        print("=" * 60)
        
        if results:
            avg_conf = np.mean([r["confidence"] for r in results])
            print(f"Total images processed: {len(results)}")
            print(f"Average confidence: {avg_conf:.1%}")
            print(f"Training samples saved: {TRAINING_DIR}")
            print(f"\nNext steps:")
            print(f"  1. Open samples in {TRAINING_DIR}")
            print(f"  2. Add 'corrected_text' field with correct text")
            print(f"  3. Set 'needs_correction' to false")
            print(f"  4. Run trainer again to use corrections")
        
        return results


if __name__ == "__main__":
    trainer = HindiTrainer()
    trainer.process_all_images()
