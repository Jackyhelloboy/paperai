"""
Google Cloud Vision API for Hindi Handwriting
FREE tier: 1000 requests/month
Best accuracy for handwritten Devanagari
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
import os
import base64
import requests
from pathlib import Path

# Google Vision API setup
# You need to create a service account and download credentials JSON
# Steps:
# 1. Go to https://console.cloud.google.com/
# 2. Create new project
# 3. Enable "Cloud Vision API"
# 4. Create Service Account
# 5. Download JSON key file
# 6. Set GOOGLE_APPLICATION_CREDENTIALS env var

class GoogleVisionOCR:
    def __init__(self, credentials_path=None):
        """
        Initialize Google Vision API
        
        credentials_path: Path to service account JSON file
        If not provided, uses GOOGLE_APPLICATION_CREDENTIALS env var
        """
        self.api_key = None
        self.credentials_path = credentials_path
        
        # Try API key first (simpler)
        # Get from: https://console.cloud.google.com/apis/credentials
        self.api_key = "AIzaSyAtY_Cd2AfP-4dl2tHozMCZWxpJxM6dHSI"
        
        print("Google Vision OCR initialized")
        print("NOTE: You need a Google Cloud API key for this to work")
        print("Free tier: 1000 requests/month")
    
    def extract_text(self, image_path):
        """Extract text using Google Vision API"""
        if self.api_key == "YOUR_API_KEY_HERE":
            return self._mock_extract(image_path)
        
        try:
            # Read image
            with open(image_path, "rb") as f:
                image_content = f.read()
            
            # Encode to base64
            image_b64 = base64.b64encode(image_content).decode("utf-8")
            
            # API request
            url = f"https://vision.googleapis.com/v1/images:annotate?key={self.api_key}"
            
            payload = {
                "requests": [{
                    "image": {
                        "content": image_b64
                    },
                    "features": [
                        {
                            "type": "TEXT_DETECTION",
                            "maxResults": 10
                        }
                    ],
                    "imageContext": {
                        "languageHints": ["hi", "en"]  # Hindi and English
                    }
                }]
            }
            
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get("responses"):
                    annotations = result["responses"][0].get("textAnnotations", [])
                    if annotations:
                        return annotations[0].get("description", "")
            
            return ""
        
        except Exception as e:
            print(f"Error: {e}")
            return ""
    
    def _mock_extract(self, image_path):
        """Mock extraction for demo - shows what Google Vision would return"""
        print("\n[DEMO MODE] Google Vision API not configured")
        print("To enable:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create project -> Enable Cloud Vision API")
        print("3. Create API key")
        print("4. Replace YOUR_API_KEY_HERE in this file")
        print()
        
        # Return sample text based on image name
        filename = os.path.basename(image_path)
        if filename == "hgjkku.jpg":
            return """भारत में प्रथम महिला सम्बंधी विशेष

केन्द्रीय महिला विकास
- प्रत्येक वर्ष 8 मार्च को
- प्रथम नागरिक घोषणा
- विश्व महिला दिवस शिक्षिका का
- विश्व
- सबसे पहले न्यूयॉर्क (1893)
- स्थापना: 8 मार्च 1912

राष्ट्रपति: प्रतिभा देवी पाटिल
- प्रधानमंत्री: इंदिरा गांधी
- स्पीकर: सुमित्रा महाजन
- मुख्यमंत्री: सुषमा स्वराज
- राज्यपाल: सरोजिनी नायडू
- शिक्षिका: राधाबाई
- IAS: अन्ना राजम
- IPS: किरण बेदी"""
        
        return "Sample text would appear here with Google Vision API configured"


def setup_guide():
    """Print setup guide"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║          GOOGLE CLOUD VISION API SETUP GUIDE                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Step 1: Create Google Cloud Account                         ║
║  - Go to https://cloud.google.com/                           ║
║  - Sign up (free tier available)                             ║
║                                                              ║
║  Step 2: Create Project                                      ║
║  - Console -> Select/Create Project                          ║
║  - Name: "PaperAI-OCR"                                       ║
║                                                              ║
║  Step 3: Enable Cloud Vision API                             ║
║  - APIs & Services -> Library                                ║
║  - Search "Cloud Vision API"                                 ║
║  - Click Enable                                              ║
║                                                              ║
║  Step 4: Create API Key                                      ║
║  - APIs & Services -> Credentials                            ║
║  - Create Credentials -> API Key                             ║
║  - Copy the key                                              ║
║                                                              ║
║  Step 5: Update This File                                    ║
║  - Replace YOUR_API_KEY_HERE with your key                   ║
║                                                              ║
║  FREE TIER: 1000 requests/month                              ║
║  Best for: Handwriting recognition (Hindi, English, etc.)    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "setup":
        setup_guide()
    else:
        ocr = GoogleVisionOCR()
        result = ocr.extract_text("D:/Paper Ai/test_data/Hindi/hgjkku.jpg")
        print("\nResult:")
        print("=" * 60)
        print(result)
