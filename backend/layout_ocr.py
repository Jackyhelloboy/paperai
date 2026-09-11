"""
Layout-Aware OCR - Preserves exact image structure
Detects text regions, OCRs each, maintains layout
"""
import cv2
import numpy as np
import easyocr
import requests
import json
import os
import re
import unicodedata
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

class LayoutOCR:
    def __init__(self):
        print("Loading OCR engines...")
        self.easyocr = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)
        self.api_key = "K85588504388957"
        print("Ready!")
    
    def detect_text_regions(self, image_path):
        """Detect text regions using contour analysis"""
        img = cv2.imread(image_path)
        if img is None:
            return []
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply CLAHE for better contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Binary threshold
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # Dilate to connect text into lines
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 3))
        dilated = cv2.dilate(binary, kernel_h, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Get bounding boxes
        regions = []
        img_h, img_w = img.shape[:2]
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Filter small regions
            if w < 30 or h < 10:
                continue
            
            # Filter regions that are too large (likely entire page)
            if w > img_w * 0.95 and h > img_h * 0.95:
                continue
            
            # Add padding
            padding = 5
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(img_w - x, w + 2 * padding)
            h = min(img_h - y, h + 2 * padding)
            
            regions.append({
                'bbox': (x, y, w, h),
                'y_center': y + h // 2,
                'x_center': x + w // 2
            })
        
        # Sort by vertical position, then horizontal
        regions.sort(key=lambda r: (r['y_center'] // 20, r['x_center']))
        
        return regions
    
    def ocr_region(self, image, bbox):
        """OCR a single region"""
        x, y, w, h = bbox
        roi = image[y:y+h, x:x+w]
        
        # Save temp image
        temp_path = "D:/Paper Ai/temp_region.jpg"
        cv2.imwrite(temp_path, roi)
        
        # Try Engine 3 first
        try:
            with open(temp_path, "rb") as f:
                image_data = f.read()
            
            url = "https://api.ocr.space/parse/image"
            headers = {"apikey": self.api_key}
            data = {
                "language": "auto",
                "isOverlayRequired": "false",
                "OCREngine": "3",
                "scale": "true"
            }
            files = {"filename": ("region.jpg", image_data, "image/jpeg")}
            
            response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
            result = response.json()
            
            if result.get("ParsedResults"):
                text = result["ParsedResults"][0].get("ParsedText", "")
                if text.strip():
                    return text.strip()
        except:
            pass
        
        # Fallback: EasyOCR
        try:
            results = self.easyocr.readtext(roi, detail=1, paragraph=True)
            texts = [text for _, text, conf in results if len(text.strip()) > 0]
            if texts:
                return " ".join(texts)
        except:
            pass
        
        return ""
    
    def extract_with_layout(self, image_path):
        """Extract text preserving layout"""
        img = cv2.imread(image_path)
        if img is None:
            return ""
        
        # Detect regions
        regions = self.detect_text_regions(image_path)
        
        if not regions:
            # Fallback: OCR entire image
            return self.ocr_region(img, (0, 0, img.shape[1], img.shape[0]))
        
        # OCR each region
        lines = []
        for region in regions:
            text = self.ocr_region(img, region['bbox'])
            if text:
                # Store with position info
                lines.append({
                    'text': text,
                    'y': region['bbox'][1],
                    'x': region['bbox'][0],
                    'w': region['bbox'][2]
                })
        
        # Group by vertical position (same line)
        grouped = []
        current_line = []
        current_y = -100
        
        for line in lines:
            if abs(line['y'] - current_y) < 20:
                current_line.append(line)
            else:
                if current_line:
                    # Sort by x position
                    current_line.sort(key=lambda l: l['x'])
                    grouped.append(current_line)
                current_line = [line]
                current_y = line['y']
        
        if current_line:
            current_line.sort(key=lambda l: l['x'])
            grouped.append(current_line)
        
        # Build output
        output_lines = []
        for line_group in grouped:
            # Join items on same line with tabs
            line_text = "\t".join([item['text'] for item in line_group])
            output_lines.append(line_text)
        
        return "\n".join(output_lines)
    
    def extract_page_numbered(self, image_path):
        """Extract with question numbers preserved"""
        img = cv2.imread(image_path)
        if img is None:
            return ""
        
        # Detect regions
        regions = self.detect_text_regions(image_path)
        
        # OCR each region
        items = []
        for region in regions:
            text = self.ocr_region(img, region['bbox'])
            if text:
                items.append({
                    'text': text,
                    'y': region['bbox'][1],
                    'x': region['bbox'][0],
                    'w': region['bbox'][2],
                    'h': region['bbox'][3]
                })
        
        # Group into logical sections
        sections = []
        current_section = []
        current_y = -100
        
        for item in items:
            if abs(item['y'] - current_y) > 50:
                if current_section:
                    sections.append(current_section)
                current_section = [item]
                current_y = item['y']
            else:
                current_section.append(item)
        
        if current_section:
            sections.append(current_section)
        
        # Format output
        output = []
        for section in sections:
            section.sort(key=lambda i: i['x'])
            for item in section:
                output.append(item['text'])
        
        return "\n".join(output)


if __name__ == "__main__":
    ocr = LayoutOCR()
    
    # Test on Hindi images
    hindi_dir = "D:/Paper Ai/test_data/Hindi"
    images = [f for f in os.listdir(hindi_dir) if f.endswith('.jpg') or f.endswith('.png')]
    
    # Test first 3 images
    for img_name in images[:3]:
        img_path = os.path.join(hindi_dir, img_name)
        print(f"\n{'='*60}")
        print(f"Image: {img_name}")
        print(f"{'='*60}")
        
        result = ocr.extract_with_layout(img_path)
        print(result)
