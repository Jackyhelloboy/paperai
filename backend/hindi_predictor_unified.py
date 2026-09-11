"""
Unified Hindi Word Prediction Interface
Combines iNLTK, NLP Toolkit, and Bi-LSTM approaches
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from typing import List, Dict, Optional
from enum import Enum


class PredictionMethod(Enum):
    """Available prediction methods"""
    INLTK = "inltk"
    NLP_TOOLKIT = "nlp_toolkit"
    LSTM = "lstm"
    ENSEMBLE = "ensemble"


class UnifiedHindiPredictor:
    """
    Unified interface for Hindi word prediction
    Combines multiple approaches for better results
    """
    
    def __init__(self):
        """Initialize all available predictors"""
        self.predictors = {}
        self._init_inltk()
        self._init_nlp_toolkit()
        self._init_lstm()
    
    def _init_inltk(self):
        """Initialize iNLTK predictor"""
        try:
            from hindi_predict_inltk import HindiPredictorINLTK
            self.predictors['inltk'] = HindiPredictorINLTK('hi')
            print("✓ iNLTK predictor loaded")
        except Exception as e:
            print(f"✗ iNLTK not available: {e}")
    
    def _init_nlp_toolkit(self):
        """Initialize NLP Toolkit"""
        try:
            from hindi_nlp_toolkit import HindiNLPToolkit
            self.predictors['nlp_toolkit'] = HindiNLPToolkit()
            print("✓ NLP Toolkit loaded")
        except Exception as e:
            print(f"✗ NLP Toolkit not available: {e}")
    
    def _init_lstm(self):
        """Initialize LSTM predictor"""
        try:
            from hindi_predict_lstm import HindiLSTMPredictor
            self.predictors['lstm'] = HindiLSTMPredictor()
            print("✓ LSTM predictor loaded")
        except Exception as e:
            print(f"✗ LSTM predictor not available: {e}")
    
    def get_available_methods(self) -> List[str]:
        """Get list of available prediction methods"""
        return list(self.predictors.keys())
    
    def predict_next_word(self, text: str, method: str = "ensemble", 
                         top_k: int = 5) -> List[Dict]:
        """
        Predict next word using specified method
        
        Args:
            text: Input Hindi text
            method: Prediction method ('inltk', 'nlp_toolkit', 'lstm', 'ensemble')
            top_k: Number of predictions
            
        Returns:
            List of predictions with word and probability
        """
        if method == "ensemble":
            return self._ensemble_predict(text, top_k)
        
        if method not in self.predictors:
            return [{"word": "Method not available", "probability": 0.0}]
        
        if method == "inltk":
            predictor = self.predictors['inltk']
            predictions = predictor.predict_next(text, top_k)
            return [{"word": p, "probability": 1.0/len(predictions)} 
                    for p in predictions if not p.startswith("Error")]
        
        elif method == "lstm":
            predictor = self.predictors['lstm']
            predictions = predictor.predict_next_word(text, top_k)
            return [{"word": word, "probability": prob} 
                    for word, prob in predictions]
        
        return []
    
    def _ensemble_predict(self, text: str, top_k: int) -> List[Dict]:
        """
        Ensemble prediction combining multiple methods
        
        Args:
            text: Input text
            top_k: Number of predictions
            
        Returns:
            Combined predictions
        """
        all_predictions = {}
        
        # Collect predictions from all methods
        if 'inltk' in self.predictors:
            try:
                preds = self.predictors['inltk'].predict_next(text, top_k * 2)
                for p in preds:
                    if not p.startswith("Error"):
                        all_predictions[p] = all_predictions.get(p, 0) + 1.0
            except Exception:
                pass
        
        if 'lstm' in self.predictors:
            try:
                preds = self.predictors['lstm'].predict_next_word(text, top_k * 2)
                for word, prob in preds:
                    all_predictions[word] = all_predictions.get(word, 0) + prob
            except Exception:
                pass
        
        # Sort by combined score
        sorted_preds = sorted(all_predictions.items(), key=lambda x: x[1], reverse=True)
        
        return [{"word": word, "probability": score/len(self.predictors)} 
                for word, score in sorted_preds[:top_k]]
    
    def predict_sentence(self, text: str, num_words: int = 5, 
                        method: str = "ensemble") -> str:
        """
        Predict complete sentence continuation
        
        Args:
            text: Input text
            num_words: Number of words to predict
            method: Prediction method
            
        Returns:
            Complete sentence
        """
        if method in self.predictors:
            if method == "inltk":
                return self.predictors['inltk'].predict_sentence(text, num_words)
            elif method == "lstm":
                return self.predictors['lstm'].predict_sentence(text, num_words)
        
        # Ensemble: use iNLTK if available, fallback to LSTM
        if 'inltk' in self.predictors:
            return self.predictors['inltk'].predict_sentence(text, num_words)
        elif 'lstm' in self.predictors:
            return self.predictors['lstm'].predict_sentence(text, num_words)
        
        return text
    
    def tokenize(self, text: str, language: str = "hindi") -> List[str]:
        """Tokenize text using NLP Toolkit"""
        if 'nlp_toolkit' in self.predictors:
            return self.predictors['nlp_toolkit'].tokenize(text, language)
        return text.split()
    
    def detect_language(self, text: str) -> str:
        """Detect language using NLP Toolkit"""
        if 'nlp_toolkit' in self.predictors:
            return self.predictors['nlp_toolkit'].detect_language(text)
        return "unknown"
    
    def sentiment_score(self, text: str) -> Dict:
        """Get sentiment score using NLP Toolkit"""
        if 'nlp_toolkit' in self.predictors:
            return self.predictors['nlp_toolkit'].sentiment_score(text)
        return {"positive": 0.0, "negative": 0.0, "neutral": 1.0}
    
    def extract_keywords(self, text: str, top_n: int = 10) -> List:
        """Extract keywords using NLP Toolkit"""
        if 'nlp_toolkit' in self.predictors:
            return self.predictors['nlp_toolkit'].extract_keywords(text, top_n=top_n)
        return []
    
    def text_summary(self, text: str) -> Dict:
        """Get text summary using NLP Toolkit"""
        if 'nlp_toolkit' in self.predictors:
            return self.predictors['nlp_toolkit'].text_summary(text)
        return {}
    
    def train_lstm(self, texts: List[str], epochs: int = 50):
        """Train LSTM model with custom data"""
        if 'lstm' in self.predictors:
            return self.predictors['lstm'].train(texts, epochs=epochs)
        return None


def demo():
    """Demo function for unified predictor"""
    print("=" * 60)
    print("Unified Hindi Word Prediction System")
    print("=" * 60)
    
    predictor = UnifiedHindiPredictor()
    
    print(f"\nAvailable methods: {predictor.get_available_methods()}")
    print("-" * 40)
    
    test_text = "भारत एक"
    
    print(f"\nInput: {test_text}")
    print("-" * 40)
    
    # Test each method
    for method in predictor.get_available_methods():
        print(f"\n{method.upper()} Prediction:")
        predictions = predictor.predict_next_word(test_text, method=method, top_k=3)
        for pred in predictions:
            print(f"  {pred['word']}: {pred['probability']:.4f}")
    
    # Ensemble prediction
    print(f"\nENSEMBLE Prediction:")
    predictions = predictor.predict_next_word(test_text, method="ensemble", top_k=3)
    for pred in predictions:
        print(f"  {pred['word']}: {pred['probability']:.4f}")
    
    # NLP features
    print("\n" + "=" * 40)
    print("NLP Features:")
    print("=" * 40)
    
    lang = predictor.detect_language(test_text)
    print(f"Language: {lang}")
    
    sentiment = predictor.sentiment_score(test_text)
    print(f"Sentiment: {sentiment}")
    
    keywords = predictor.extract_keywords(test_text, top_n=3)
    print(f"Keywords: {keywords}")


if __name__ == "__main__":
    demo()
