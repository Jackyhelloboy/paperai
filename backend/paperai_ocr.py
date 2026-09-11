"""
PaperAI OCR - Final Working System
Uses OCR.space Engine 3 (free, supports Hindi handwriting)
"""
import cv2
import numpy as np
import easyocr
import requests
import json
import os
import sys
import io
import time
from difflib import SequenceMatcher

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

class PaperAI_OCR:
    def __init__(self):
        print("Initializing PaperAI OCR...")
        self.api_key = "K85588504388957"
        self.easyocr_reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
        print("Ready!")
    
    def extract_with_engine3(self, image_path):
        """OCR.space Engine 3 - Best for Hindi handwriting"""
        try:
            with open(image_path, "rb") as f:
                image_data = f.read()
            
            url = "https://api.ocr.space/parse/image"
            headers = {"apikey": self.api_key}
            data = {
                "language": "auto",
                "isOverlayRequired": "false",
                "OCREngine": "3",
                "scale": "true",
                "isTable": "true",
                "detectOrientation": "true"
            }
            files = {"filename": (os.path.basename(image_path), image_data, "image/jpeg")}
            
            response = requests.post(url, headers=headers, data=data, files=files, timeout=60)
            result = response.json()
            
            if result.get("ParsedResults"):
                text = result["ParsedResults"][0].get("ParsedText", "")
                return {"text": text.strip(), "confidence": 0.95, "engine": "ocrspace_engine3"}
            
            return {"text": "", "confidence": 0, "engine": "none"}
        except Exception as e:
            return {"text": "", "confidence": 0, "error": str(e)}
    
    def extract_with_easyocr(self, image_path):
        """EasyOCR local"""
        try:
            results = self.easyocr_reader.readtext(
                image_path,
                detail=1,
                paragraph=False,
                text_threshold=0.3,
                low_text=0.2,
                canvas_size=256,
                mag_ratio=2.0
            )
            
            texts = []
            for (bbox, text, conf) in results:
                if len(text.strip()) > 1:
                    texts.append(text)
            
            return {"text": " ".join(texts), "confidence": 0.7, "engine": "easyocr"}
        except:
            return {"text": "", "confidence": 0, "engine": "none"}
    
    def preprocess(self, image_path):
        """Enhance image"""
        image = cv2.imread(image_path)
        if image is None:
            return image_path
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        enhanced_path = image_path.replace(".jpg", "_enhanced.jpg").replace(".png", "_enhanced.jpg")
        cv2.imwrite(enhanced_path, enhanced)
        return enhanced_path
    
    def extract(self, image_path):
        """Extract text using best method"""
        start = time.time()
        
        # Get enhanced version
        enhanced = self.preprocess(image_path)
        
        # Try Engine 3 (best for Hindi)
        result = self.extract_with_engine3(image_path)
        
        # If Engine 3 fails, try EasyOCR
        if not result["text"]:
            result = self.extract_with_easyocr(image_path)
        
        # If still nothing, try enhanced image with EasyOCR
        if not result["text"] and enhanced != image_path:
            result = self.extract_with_easyocr(enhanced)
        
        elapsed = time.time() - start
        
        return {
            "text": result["text"],
            "confidence": result["confidence"],
            "engine": result.get("engine", "unknown"),
            "processing_time": round(elapsed, 2)
        }


def demo():
    """Demo the system"""
    ocr = PaperAI_OCR()
    
    # Test on the Hindi image
    test_images = [
        "D:/Paper Ai/test_data/Hindi/hgjkku.jpg",
        "D:/Paper Ai/test_data/Hindi/fdgd.jpg",
        "D:/Paper Ai/test_data/Hindi/cdfjhghm.jpg"
    ]
    
    print("\n" + "="*60)
    print("PAPERAI OCR - HINDI HANDWRITING TEST")
    print("="*60)
    
    for img in test_images:
        if os.path.exists(img):
            print(f"\nFile: {os.path.basename(img)}")
            print("-"*40)
            
            result = ocr.extract(img)
            
            print(f"Engine: {result['engine']}")
            print(f"Confidence: {result['confidence']:.1%}")
            print(f"Time: {result['processing_time']}s")
            print(f"Text ({len(result['text'])} chars):")
            print(result['text'][:500])
            print()


if __name__ == "__main__":
    demo()
