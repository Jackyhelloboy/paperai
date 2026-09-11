"""
Bi-LSTM Hindi Next-Word Predictor
TensorFlow-based deep learning model for Hindi word prediction
"""
import os
import json
import re
import numpy as np
from collections import Counter
from typing import List, Dict, Tuple, Optional

try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import Embedding, LSTM, Bidirectional, Dense, Dropout
    from tensorflow.keras.preprocessing.text import Tokenizer
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not installed. Install with: pip install tensorflow")


class HindiLSTMPredictor:
    """Bi-LSTM based Hindi next-word predictor"""
    
    def __init__(self, model_dir: str = None):
        """
        Initialize the LSTM predictor
        
        Args:
            model_dir: Directory to save/load models
        """
        if model_dir is None:
            model_dir = os.path.join(os.path.dirname(__file__), "models", "hindi_lstm")
        
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)
        
        self.model = None
        self.tokenizer = Tokenizer(oov_token='<OOV>')
        self.max_sequence_len = 50
        self.vocab_size = 0
        
        # Hindi word collections
        self.hindi_words = set()
        
        # Load existing model if available
        self._load_model()
    
    def _load_model(self):
        """Load saved model and tokenizer"""
        model_path = os.path.join(self.model_dir, "hindi_lstm_model.h5")
        tokenizer_path = os.path.join(self.model_dir, "tokenizer.json")
        config_path = os.path.join(self.model_dir, "config.json")
        
        if os.path.exists(model_path) and TF_AVAILABLE:
            try:
                self.model = load_model(model_path)
                print(f"Loaded model from {model_path}")
            except Exception as e:
                print(f"Error loading model: {e}")
        
        if os.path.exists(tokenizer_path):
            try:
                with open(tokenizer_path, 'r', encoding='utf-8') as f:
                    tokenizer_json = json.load(f)
                self.tokenizer = Tokenizer.from_json(tokenizer_json)
                print(f"Loaded tokenizer from {tokenizer_path}")
            except Exception as e:
                print(f"Error loading tokenizer: {e}")
        
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                self.max_sequence_len = config.get('max_sequence_len', 50)
                self.vocab_size = config.get('vocab_size', 0)
            except Exception as e:
                print(f"Error loading config: {e}")
    
    def _save_model(self):
        """Save model and tokenizer"""
        if not TF_AVAILABLE or self.model is None:
            return
        
        model_path = os.path.join(self.model_dir, "hindi_lstm_model.h5")
        tokenizer_path = os.path.join(self.model_dir, "tokenizer.json")
        config_path = os.path.join(self.model_dir, "config.json")
        
        try:
            self.model.save(model_path)
            print(f"Saved model to {model_path}")
        except Exception as e:
            print(f"Error saving model: {e}")
        
        try:
            tokenizer_json = self.tokenizer.to_json()
            with open(tokenizer_path, 'w', encoding='utf-8') as f:
                f.write(tokenizer_json)
            print(f"Saved tokenizer to {tokenizer_path}")
        except Exception as e:
            print(f"Error saving tokenizer: {e}")
        
        try:
            config = {
                'max_sequence_len': self.max_sequence_len,
                'vocab_size': self.vocab_size,
            }
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2)
            print(f"Saved config to {config_path}")
        except Exception as e:
            print(f"Error saving config: {e}")
    
    def prepare_data(self, texts: List[str], sequence_length: int = 50):
        """
        Prepare training data from text corpus
        
        Args:
            texts: List of Hindi text sentences
            sequence_length: Input sequence length
            
        Returns:
            X, y arrays for training
        """
        # Fit tokenizer
        self.tokenizer.fit_on_texts(texts)
        self.vocab_size = len(self.tokenizer.word_index) + 1
        
        # Create sequences
        sequences = []
        for text in texts:
            token_list = self.tokenizer.texts_to_sequences([text])[0]
            for i in range(sequence_length, len(token_list)):
                n_gram = token_list[i-sequence_length:i+1]
                sequences.append(n_gram)
        
        if not sequences:
            return None, None
        
        sequences = np.array(sequences)
        X = sequences[:, :-1]
        y = sequences[:, -1]
        
        # Convert y to categorical
        y = tf.keras.utils.to_categorical(y, num_classes=self.vocab_size)
        
        self.max_sequence_len = sequence_length
        
        return X, y
    
    def build_model(self, embedding_dim: int = 128, lstm_units: int = 256):
        """
        Build Bi-LSTM model
        
        Args:
            embedding_dim: Embedding dimension
            lstm_units: Number of LSTM units
            
        Returns:
            Compiled model
        """
        if not TF_AVAILABLE:
            print("TensorFlow not available")
            return None
        
        self.model = Sequential([
            Embedding(self.vocab_size, embedding_dim, input_length=self.max_sequence_len),
            Bidirectional(LSTM(lstm_units, return_sequences=True)),
            Dropout(0.2),
            Bidirectional(LSTM(lstm_units // 2)),
            Dropout(0.2),
            Dense(self.vocab_size, activation='softmax')
        ])
        
        self.model.compile(
            loss='categorical_crossentropy',
            optimizer='adam',
            metrics=['accuracy']
        )
        
        self.model.summary()
        return self.model
    
    def train(self, texts: List[str], epochs: int = 50, batch_size: int = 64,
              validation_split: float = 0.2):
        """
        Train the model
        
        Args:
            texts: Training texts
            epochs: Number of epochs
            batch_size: Batch size
            validation_split: Validation split ratio
            
        Returns:
            Training history
        """
        if not TF_AVAILABLE:
            print("TensorFlow not available")
            return None
        
        print("Preparing data...")
        X, y = self.prepare_data(texts)
        
        if X is None:
            print("No training data available")
            return None
        
        print(f"Data shape: X={X.shape}, y={y.shape}")
        print(f"Vocabulary size: {self.vocab_size}")
        
        # Build model
        self.build_model()
        
        # Callbacks
        callbacks = [
            EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True),
            ModelCheckpoint(
                os.path.join(self.model_dir, 'best_model.h5'),
                monitor='val_loss',
                save_best_only=True
            )
        ]
        
        # Train
        history = self.model.fit(
            X, y,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            callbacks=callbacks,
            verbose=1
        )
        
        # Save model
        self._save_model()
        
        return history
    
    def predict_next_word(self, text: str, top_k: int = 5) -> List[Tuple[str, float]]:
        """
        Predict next word(s) for given text
        
        Args:
            text: Input Hindi text
            top_k: Number of predictions to return
            
        Returns:
            List of (word, probability) tuples
        """
        if self.model is None:
            return [("Model not trained", 0.0)]
        
        # Tokenize input
        token_list = self.tokenizer.texts_to_sequences([text])[0]
        
        # Pad sequence
        token_list = pad_sequences([token_list], maxlen=self.max_sequence_len, padding='pre')
        
        # Predict
        predictions = self.model.predict(token_list, verbose=0)[0]
        
        # Get top-k predictions
        top_indices = predictions.argsort()[-top_k:][::-1]
        
        results = []
        for idx in top_indices:
            word = self.tokenizer.index_word.get(idx, '<unknown>')
            prob = float(predictions[idx])
            results.append((word, prob))
        
        return results
    
    def predict_sentence(self, text: str, num_words: int = 5) -> str:
        """
        Predict a complete sentence continuation
        
        Args:
            text: Input text
            num_words: Number of words to predict
            
        Returns:
            Complete sentence
        """
        current_text = text
        
        for _ in range(num_words):
            predictions = self.predict_next_word(current_text, top_k=1)
            if predictions and predictions[0][1] > 0.1:
                next_word = predictions[0][0]
                current_text += " " + next_word
            else:
                break
        
        return current_text
    
    def generate_training_data_from_file(self, filepath: str) -> List[str]:
        """
        Generate training data from a text file
        
        Args:
            filepath: Path to text file
            
        Returns:
            List of processed sentences
        """
        if not os.path.exists(filepath):
            print(f"File not found: {filepath}")
            return []
        
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
        
        # Split into sentences
        sentences = re.split(r'[।॥.!?\n]+', text)
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10]
        
        return sentences


def demo():
    """Demo function to test Bi-LSTM predictor"""
    print("=" * 60)
    print("Bi-LSTM Hindi Next-Word Predictor Demo")
    print("=" * 60)
    
    if not TF_AVAILABLE:
        print("\nTensorFlow is not installed.")
        print("Install with: pip install tensorflow")
        print("\nShowing demo with sample data...")
        
        # Create sample data
        sample_texts = [
            "भारत एक महान देश है जहाँ विविध संस्कृतियां पाई जाती हैं",
            "विज्ञान ने मानव जीवन को बहुत आसान बना दिया है",
            "दिल्ली भारत की राजधानी है और यह बहुत प्राचीन शहर है",
            "हिंदी भारत की राजभाषा है और इसे बहुत लोग बोलते हैं",
            "आज का मौसम बहुत अच्छा है और धूप खिली हुई है",
        ]
        
        predictor = HindiLSTMPredictor()
        
        print("\nSample texts:")
        for text in sample_texts:
            print(f"  - {text}")
        
        print("\nNote: Train the model with actual Hindi corpus for real predictions.")
        return
    
    # Initialize predictor
    predictor = HindiLSTMPredictor()
    
    # Sample training data (in real use, use large Hindi corpus)
    sample_texts = [
        "भारत एक महान देश है जहाँ विविध संस्कृतियां पाई जाती हैं",
        "विज्ञान ने मानव जीवन को बहुत आसान बना दिया है",
        "दिल्ली भारत की राजधानी है और यह बहुत प्राचीन शहर है",
        "हिंदी भारत की राजभाषा है और इसे बहुत लोग बोलते हैं",
        "आज का मौसम बहुत अच्छा है और धूप खिली हुई है",
        "प्रकृति हमें बहुत सुंदर उपहार देती है जिनकी हमें रक्षा करनी चाहिए",
        "शिक्षा मनुष्य के जीवन में बहुत महत्वपूर्ण भूमिका निभाती है",
        "भारतीय संस्कृति बहुत प्राचीन और समृद्ध है",
    ]
    
    print("\nTraining model with sample data...")
    print("(Note: Use large Hindi corpus for production)")
    
    # Train
    history = predictor.train(sample_texts, epochs=10, batch_size=2)
    
    # Test predictions
    test_texts = [
        "भारत एक",
        "विज्ञान ने",
        "दिल्ली में",
    ]
    
    print("\n" + "=" * 40)
    print("Predictions:")
    print("=" * 40)
    
    for text in test_texts:
        print(f"\nInput: {text}")
        predictions = predictor.predict_next_word(text, top_k=3)
        for word, prob in predictions:
            print(f"  {word}: {prob:.4f}")
        sentence = predictor.predict_sentence(text, 3)
        print(f"  Full sentence: {sentence}")


if __name__ == "__main__":
    demo()
