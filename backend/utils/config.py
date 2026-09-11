import os
from pathlib import Path

class Settings:
    PROJECT_NAME: str = "PaperAI"
    VERSION: str = "1.0.0"
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")
    EXPORT_DIR: str = str(BASE_DIR / "exports")
    TRAINING_DATA_DIR: str = str(BASE_DIR / "training_data")
    
    MAX_FILE_SIZE: int = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS: set = {".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
    
    SUPPORTED_LANGUAGES: dict = {
        "en": "English",
        "hi": "Hindi",
        "te": "Telugu",
        "math": "Mathematics"
    }
    
    PP_OCRV5_CONFIG: dict = {
        "use_angle_cls": True,
        "lang": "en",
        "use_gpu": False,
        "det_model_dir": None,
        "rec_model_dir": None,
        "cls_model_dir": None,
    }
    
    CONFIDENCE_THRESHOLDS: dict = {
        "high": 0.90,
        "medium": 0.75,
        "low": 0.60,
        "critical_token": 0.95
    }
    
    CRITICAL_TOKENS: set = {
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "+", "-", "×", "÷", "=", "≠", "<", ">",
        ".", ",", "(", ")", "[", "]", "{", "}",
        "²", "³", "√", "%", "₹",
        "cm", "mm", "kg", "mL", "gm",
        "H₂O", "CO₂", "H₂SO₄", "NaCl"
    }

settings = Settings()
