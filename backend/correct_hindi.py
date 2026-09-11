"""
Hindi OCR Correction Tool
Compare extracted text with original images and add corrections
"""
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

TRAINING_DIR = "D:/Paper Ai/training_data/hindi"

def list_samples():
    """List all training samples"""
    samples = []
    for f in os.listdir(TRAINING_DIR):
        if f.endswith('.json'):
            with open(os.path.join(TRAINING_DIR, f), 'r', encoding='utf-8') as fh:
                data = json.load(fh)
                samples.append(data)
    return samples

def show_sample(sample, index):
    """Show a sample with its extracted text"""
    print(f"\n{'='*60}")
    print(f"Sample {index}: {sample['filename']}")
    print(f"{'='*60}")
    print(f"Image: {sample['image_path']}")
    print(f"Confidence: {sample['confidence']:.1%}")
    print(f"Engine: {sample['engine_used']}")
    print(f"\nExtracted Text:")
    print("-" * 40)
    print(sample['extracted_text'])
    print("-" * 40)

def add_correction(sample_file, corrected_text):
    """Add correction to a sample"""
    filepath = os.path.join(TRAINING_DIR, sample_file)
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    data['corrected_text'] = corrected_text
    data['needs_correction'] = False
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Correction saved for {data['filename']}")

def batch_correct():
    """Interactive batch correction"""
    samples = list_samples()
    uncorrected = [s for s in samples if s.get('needs_correction', True)]
    
    print(f"\nTotal samples: {len(samples)}")
    print(f"Uncorrected: {len(uncorrected)}")
    
    if not uncorrected:
        print("All samples have been corrected!")
        return
    
    print("\nTo correct, open the image file and type the correct text.")
    print("Type 'skip' to skip, 'quit' to stop.\n")
    
    for i, sample in enumerate(uncorrected):
        show_sample(sample, i+1)
        
        # Show image path for reference
        print(f"\nOpen this image to see the original:")
        print(f"  {sample['image_path']}")
        
        corrected = input("\nEnter corrected text (or 'skip'): ").strip()
        
        if corrected.lower() == 'quit':
            break
        elif corrected.lower() == 'skip':
            print("Skipped.")
            continue
        elif corrected:
            add_correction(sample['filename'], corrected)
            print("Saved!")

def show_stats():
    """Show correction statistics"""
    samples = list_samples()
    corrected = [s for s in samples if not s.get('needs_correction', True)]
    uncorrected = [s for s in samples if s.get('needs_correction', True)]
    
    print(f"\nTraining Statistics:")
    print(f"  Total samples: {len(samples)}")
    print(f"  Corrected: {len(corrected)}")
    print(f"  Uncorrected: {len(uncorrected)}")
    
    if corrected:
        print(f"\nCorrected samples:")
        for s in corrected:
            print(f"  - {s['filename']}: {s['confidence']:.1%}")

if __name__ == "__main__":
    print("=" * 60)
    print("Hindi OCR Correction Tool")
    print("=" * 60)
    print("\nCommands:")
    print("  1. List all samples")
    print("  2. Batch correct")
    print("  3. Show statistics")
    print("  4. Exit")
    
    while True:
        choice = input("\nChoice: ").strip()
        
        if choice == '1':
            samples = list_samples()
            for i, s in enumerate(samples):
                status = "CORRECTED" if not s.get('needs_correction', True) else "NEEDS WORK"
                print(f"{i+1}. {s['filename']} - {s['confidence']:.1%} - {status}")
        
        elif choice == '2':
            batch_correct()
        
        elif choice == '3':
            show_stats()
        
        elif choice == '4':
            break
        
        else:
            print("Invalid choice")
