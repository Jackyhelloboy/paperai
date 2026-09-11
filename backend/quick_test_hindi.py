"""
Quick Hindi OCR Test - Single Image
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import cv2
import numpy as np
import easyocr
import time

print("Loading EasyOCR...")
reader = easyocr.Reader(['en', 'hi'], gpu=False, verbose=False)

def quick_test(image_path):
    """Quick test with optimized settings"""
    print(f"\nTesting: {image_path}")
    start = time.time()
    
    # Read image
    image = cv2.imread(image_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Enhance contrast
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    
    # Scale up
    scaled = cv2.resize(enhanced, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    
    # EasyOCR with tuned settings
    results = reader.readtext(
        scaled,
        detail=1,
        paragraph=False,
        text_threshold=0.2,
        low_text=0.15,
        link_threshold=0.2,
        canvas_size=512,
        mag_ratio=2.0
    )
    
    texts = []
    for (bbox, text, conf) in results:
        if len(text.strip()) > 1:
            texts.append(text)
    
    elapsed = time.time() - start
    full_text = " ".join(texts)
    
    print(f"\nExtracted ({elapsed:.1f}s):")
    print("-" * 50)
    print(full_text)
    print("-" * 50)
    print(f"Characters: {len(full_text)}")
    print(f"Lines: {len(texts)}")
    
    return full_text

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        quick_test(sys.argv[1])
    else:
        # Test on the image you uploaded
        quick_test("D:/Paper Ai/test_data/Hindi/hgjkku.jpg")
