"""
iNLTK Hindi Word Prediction Module
Uses iNLTK library for Hindi next-word prediction
Note: iNLTK requires fastai which may have compatibility issues on Windows
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

INLTK_AVAILABLE = False
try:
    from inltk.inltk import setup, predict_next_words
    INLTK_AVAILABLE = True
except ImportError as e:
    pass  # Silent fail - will check availability at runtime
except Exception as e:
    pass  # Handle other errors like fastai compatibility issues


class HindiPredictorINLTK:
    """Hindi word predictor using iNLTK library"""
    
    def __init__(self, language='hi'):
        """
        Initialize iNLTK Hindi predictor
        
        Args:
            language: Language code ('hi' for Hindi)
        """
        self.language = language
        self.initialized = False
        
        if INLTK_AVAILABLE:
            try:
                setup(language)
                self.initialized = True
            except Exception as e:
                print(f"Error initializing iNLTK: {e}")
    
    def predict_next(self, text, num_words=3, randomness=0.8):
        """
        Predict next words based on input text
        
        Args:
            text: Input Hindi text
            num_words: Number of words to predict
            randomness: Randomness factor (0.0-1.0)
            
        Returns:
            List of predicted words
        """
        if not self.initialized:
            return ["Error: iNLTK not initialized"]
        
        try:
            predictions = predict_next_words(text, num_words, self.language, randomness)
            return predictions
        except Exception as e:
            return [f"Error: {str(e)}"]
    
    def predict_sentence(self, text, num_words=5):
        """
        Predict a complete sentence continuation
        
        Args:
            text: Input Hindi text
            num_words: Number of words to predict
            
        Returns:
            Complete sentence with predictions
        """
        if not self.initialized:
            return text
        
        predictions = self.predict_next(text, num_words)
        if predictions and not predictions[0].startswith("Error"):
            return text + " " + " ".join(predictions)
        return text
    
    def get_suggestions(self, text, num_suggestions=3):
        """
        Get multiple sentence suggestions
        
        Args:
            text: Input Hindi text
            num_suggestions: Number of suggestions to return
            
        Returns:
            List of sentence suggestions
        """
        suggestions = []
        for i in range(num_suggestions):
            suggestion = self.predict_sentence(text, 5)
            suggestions.append(suggestion)
        return suggestions


def demo():
    """Demo function to test iNLTK predictor"""
    print("=" * 60)
    print("iNLTK Hindi Word Prediction Demo")
    print("=" * 60)
    
    predictor = HindiPredictorINLTK('hi')
    
    test_texts = [
        "भारत एक",
        "मैं आज",
        "विज्ञान ने",
        "दिल्ली में",
        "हिंदी भाषा",
    ]
    
    for text in test_texts:
        print(f"\nInput: {text}")
        predictions = predictor.predict_next(text, 3)
        print(f"Predictions: {predictions}")
        sentence = predictor.predict_sentence(text, 5)
        print(f"Sentence: {sentence}")
        print("-" * 40)


if __name__ == "__main__":
    demo()
