"""
Enhanced Hindi OCR with Advanced Preprocessing
Uses multiple techniques to improve handwriting recognition
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

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

class EnhancedHindiOCR:
    def __init__(self):
        print("Initializing Enhanced Hindi OCR...")
        self.easyocr_reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
        print("Ready!")
    
    def advanced_preprocess(self, image_path):
        """Multiple preprocessing techniques for Hindi handwriting"""
        image = cv2.imread(image_path)
        if image is None:
            return []
        
        results = []
        
        # Technique 1: Original + CLAHE
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        _, thresh1 = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        results.append(("clahe_otsu", thresh1))
        
        # Technique 2: Adaptive threshold
        adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        results.append(("adaptive", adaptive))
        
        # Technique 3: Denoise + Sharpen
        denoised = cv2.fastNlMeansDenoising(gray, h=15)
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        _, thresh3 = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        results.append(("denoise_sharp", thresh3))
        
        # Technique 4: Morphological operations
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel_morph = np.ones((2,2), np.uint8)
        morph = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_morph)
        results.append(("morphology", morph))
        
        # Technique 5: Scale up (helps with small handwriting)
        scale = 2.0
        scaled = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        gray_scaled = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY)
        _, thresh_scaled = cv2.threshold(gray_scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        results.append(("scaled_2x", thresh_scaled))
        
        # Technique 6: Invert (sometimes helps)
        inverted = cv2.bitwise_not(thresh1)
        results.append(("inverted", inverted))
        
        return results
    
    def extract_easyocr(self, image):
        """Extract using EasyOCR with optimized settings"""
        try:
            results = self.easyocr_reader.readtext(
                image,
                detail=1,
                paragraph=False,
                text_threshold=0.2,
                low_text=0.15,
                link_threshold=0.2,
                canvas_size=512,
                mag_ratio=2.5,
                contrast_ths=0.1,
                adjust_contrast=0.5
            )
            
            texts = []
            for (bbox, text, conf) in results:
                if len(text.strip()) > 1:
                    texts.append(text)
            
            return " ".join(texts)
        except:
            return ""
    
    def extract_tesseract(self, image):
        """Extract using Tesseract with Hindi"""
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            best_text = ""
            
            # Try different PSM modes
            for psm in [6, 3, 4, 11, 13]:
                try:
                    config = f"--psm {psm} --oem 3 -l hin+eng"
                    text = pytesseract.image_to_string(gray, config=config)
                    if len(text.strip()) > len(best_text):
                        best_text = text.strip()
                except:
                    continue
            
            return best_text
        except:
            return ""
    
    def extract_ocrspace(self, image_path):
        """Extract using OCR.space API"""
        try:
            api_key = "K85588504388957"
            
            with open(image_path, "rb") as f:
                image_data = f.read()
            
            url = "https://api.ocr.space/parse/image"
            headers = {"apikey": api_key}
            data = {
                "language": "hin",
                "isOverlayRequired": "false",
                "OCREngine": "2",
                "scale": "true"
            }
            files = {"filename": (os.path.basename(image_path), image_data, "image/jpeg")}
            
            response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("ParsedResults"):
                    return result["ParsedResults"][0].get("ParsedText", "")
            
            return ""
        except:
            return ""
    
    def process_image(self, image_path):
        """Process image with all techniques and return best result"""
        print(f"\nProcessing: {os.path.basename(image_path)}")
        
        # Get all preprocessing versions
        preprocessed = self.advanced_preprocess(image_path)
        
        all_texts = []
        
        # Extract from each preprocessed version
        for name, img in preprocessed:
            # EasyOCR
            text = self.extract_easyocr(img)
            if text and len(text) > 10:
                all_texts.append({"engine": f"easyocr_{name}", "text": text})
            
            # Tesseract
            text = self.extract_tesseract(img)
            if text and len(text) > 10:
                all_texts.append({"engine": f"tesseract_{name}", "text": text})
        
        # OCR.space (on original)
        text = self.extract_ocrspace(image_path)
        if text and len(text) > 10:
            all_texts.append({"engine": "ocrspace", "text": text})
        
        # Find best result (longest text usually = most accurate for Hindi)
        if all_texts:
            best = max(all_texts, key=lambda x: len(x["text"]))
            print(f"  Best: {best['engine']} ({len(best['text'])} chars)")
            return best["text"]
        
        return ""
    
    def batch_process(self, hindi_dir, output_file):
        """Process all Hindi images and save results"""
        hindi_path = Path(hindi_dir)
        images = list(hindi_path.glob("*.jpg")) + list(hindi_path.glob("*.png"))
        
        print(f"\nFound {len(images)} images to process")
        print("=" * 60)
        
        results = []
        
        for i, img_path in enumerate(images):
            text = self.process_image(str(img_path))
            
            results.append({
                "filename": img_path.name,
                "image_path": str(img_path),
                "extracted_text": text,
                "char_count": len(text),
                "needs_correction": True
            })
            
            # Save progress
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            
            print(f"  [{i+1}/{len(images)}] Saved: {len(text)} chars")
        
        # Summary
        print("\n" + "=" * 60)
        print("COMPLETE")
        print("=" * 60)
        print(f"Processed: {len(results)} images")
        print(f"Output: {output_file}")
        
        return results


if __name__ == "__main__":
    ocr = EnhancedHindiOCR()
    ocr.batch_process(
        "D:/Paper Ai/test_data/Hindi",
        "D:/Paper Ai/training_data/hindi_enhanced.json"
    )
