"""
Structured OCR Output Processor
Converts raw OCR text into properly formatted output with:
- Headings
- Bullet points
- Numbered lists
- Diagram labels
- Line breaks
- Math formatting
"""
import re
from typing import List, Dict, Tuple


class StructuredOutputProcessor:
    """
    Processes OCR output into structured, notebook-style formatted text
    """
    
    def __init__(self):
        # Hindi heading patterns
        self.hindi_headings = [
            r'^(परिभाषा)\s*:',
            r'^(ज्वालामुखी के प्रमुख भाग)\s*:',
            r'^(ज्वालामुखी के प्रकार)\s*:',
            r'^(महत्वपूर्ण तथ्य)\s*:',
            r'^(EXAM FACT)\s*:',
            r'^(नोट)\s*:',
            r'^(उदाहरण)\s*:',
            r'^(सारांश)\s*:',
            r'^(निष्कर्ष)\s*:',
            r'^(प्रश्न)\s*:',
            r'^(उत्तर)\s*:',
            r'^(विशेषताएँ)\s*:',
            r'^(विभाजन)\s*:',
            r'^(वर्गीकरण)\s*:',
            r'^(तुलना)\s*:',
            r'^(महत्व)\s*:',
            r'^(उपयोग)\s*:',
            r'^(प्रक्रिया)\s*:',
            r'^(चरण)\s*:',
            r'^(सिद्धांत)\s*:',
            r'^(नियम)\s*:',
            r'^(सूत्र)\s*:',
            r'^(गणना)\s*:',
            r'$(समस्या)\s*:',
        ]
        
        # English heading patterns
        self.english_headings = [
            r'^(Definition)\s*:',
            r'^(Types? of)\s+',
            r'^(Important Facts?)\s*:',
            r'^(Key Points?)\s*:',
            r'^(Summary)\s*:',
            r'^(Conclusion)\s*:',
            r'^(Example)\s*:',
            r'^(Note)\s*:',
            r'^(Properties?)\s*:',
            r'^(Formula)\s*:',
            r'^(Theorem)\s*:',
            r'^(Proof)\s*:',
            r'^(Solution)\s*:',
            r'^(Answer)\s*:',
            r'^(Question)\s*:',
            r'^(EXAM FACT)\s*:',
        ]
        
        # Numbered list patterns
        self.numbered_patterns = [
            r'^(\d+\.?\s+)',           # 1. or 1 )
            r'^(\d+\)\s+)',            # 1) 
            r'^(\([a-zA-Z]\)\s+)',     # a) b) c)
            r'^(\([0-9]+\)\s+)',       # (1) (2)
            r'^([ivxlc]+\.?\s+)',      # Roman numerals
            r'^([IVXLC]+\.?\s+)',      # Roman numerals uppercase
        ]
        
        # Bullet patterns
        self.bullet_patterns = [
            r'^([●•▸▹▪►‣⁃]\s+)',
            r'^(-\s+)',
            r'^(\*\s+)',
            r'^(→\s+)',
            r'^(⇒\s+)',
            r'^(•\s+)',
        ]
        
        # Diagram label patterns
        self.diagram_labels = [
            r'^(क्रेटर)\s*$',
            r'^(ज्वालामुखी शंकु)\s*$',
            r'^(ज्वालामुखी नली)\s*$',
            r'^(लावा)\s*$',
            r'^(मैग्मा कक्ष)\s*$',
            r'^(Crater)\s*$',
            r'^(Volcanic Cone)\s*$',
            r'^(Vent)\s*$',
            r'^(Lava)\s*$',
            r'^(Magma Chamber)\s*$',
        ]
    
    def process(self, text: str, preserve_structure: bool = True) -> str:
        """
        Process OCR text into structured format
        
        Args:
            text: Raw OCR text
            preserve_structure: Whether to preserve line breaks
            
        Returns:
            Formatted text
        """
        if not text:
            return text
        
        # Split into lines
        lines = text.split('\n')
        
        processed_lines = []
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            if not line:
                processed_lines.append('')
                i += 1
                continue
            
            # Check for headings
            if self._is_heading(line):
                processed_lines.append(self._format_heading(line))
                i += 1
                continue
            
            # Check for numbered lists
            if self._is_numbered_list(line):
                processed_lines.append(self._format_numbered_list(line))
                i += 1
                continue
            
            # Check for bullet points
            if self._is_bullet(line):
                processed_lines.append(self._format_bullet(line))
                i += 1
                continue
            
            # Check for diagram labels
            if self._is_diagram_label(line):
                processed_lines.append(self._format_diagram_label(line))
                i += 1
                continue
            
            # Check if next line is continuation (same content type)
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if self._is_continuation(line, next_line):
                    # Group related lines
                    group = [line]
                    i += 1
                    while i < len(lines) and self._is_continuation(group[-1], lines[i].strip()):
                        if lines[i].strip():
                            group.append(lines[i].strip())
                        i += 1
                    processed_lines.append(self._format_paragraph(' '.join(group)))
                    continue
            
            # Regular paragraph
            processed_lines.append(self._format_paragraph(line))
            i += 1
        
        # Join with proper spacing
        result = '\n'.join(processed_lines)
        
        # Clean up multiple blank lines
        result = re.sub(r'\n{3,}', '\n\n', result)
        
        return result
    
    def _is_heading(self, line: str) -> bool:
        """Check if line is a heading"""
        for pattern in self.hindi_headings + self.english_headings:
            if re.match(pattern, line, re.IGNORECASE):
                return True
        
        # Check if line ends with colon and is short
        if line.endswith(':') and len(line) < 60:
            return True
        
        return False
    
    def _is_numbered_list(self, line: str) -> bool:
        """Check if line is a numbered list item"""
        for pattern in self.numbered_patterns:
            if re.match(pattern, line):
                return True
        return False
    
    def _is_bullet(self, line: str) -> bool:
        """Check if line is a bullet point"""
        for pattern in self.bullet_patterns:
            if re.match(pattern, line):
                return True
        return False
    
    def _is_diagram_label(self, line: str) -> bool:
        """Check if line is a diagram label"""
        for pattern in self.diagram_labels:
            if re.match(pattern, line, re.IGNORECASE):
                return True
        return False
    
    def _is_continuation(self, current: str, next_line: str) -> bool:
        """Check if next line is continuation of current"""
        if not next_line:
            return False
        
        # Same type of content
        if self._is_heading(current) or self._is_heading(next_line):
            return False
        
        if self._is_numbered_list(current) and self._is_numbered_list(next_line):
            return False
        
        if self._is_bullet(current) and self._is_bullet(next_line):
            return False
        
        # Both are regular text
        if (not self._is_heading(current) and 
            not self._is_numbered_list(current) and 
            not self._is_bullet(current) and
            not self._is_heading(next_line) and 
            not self._is_numbered_list(next_line) and 
            not self._is_bullet(next_line)):
            return True
        
        return False
    
    def _format_heading(self, line: str) -> str:
        """Format a heading line"""
        return f'\n{line}\n'
    
    def _format_numbered_list(self, line: str) -> str:
        """Format a numbered list item"""
        return f'  {line}'
    
    def _format_bullet(self, line: str) -> str:
        """Format a bullet point"""
        return f'  {line}'
    
    def _format_diagram_label(self, line: str) -> str:
        """Format a diagram label"""
        return f'    [{line}]'
    
    def _format_paragraph(self, line: str) -> str:
        """Format a regular paragraph"""
        return line


class HindiStructureDetector:
    """
    Detects structure in Hindi text for proper formatting
    """
    
    def __init__(self):
        # Common Hindi structural elements
        self.structure_markers = {
            'definition': ['परिभाषा', 'अर्थ', 'मतलब', 'कहते हैं', 'कहलाता है'],
            'types': ['प्रकार', 'विभाजन', 'श्रेणी', 'वर्ग'],
            'parts': ['भाग', 'अंग', 'हिस्सा', 'उपभाग'],
            'facts': ['तथ्य', 'जानकारी', 'महत्व', 'विशेषता'],
            'examples': ['उदाहरण', 'जैसे', 'इसके अतिरिक्त'],
            'formulas': ['सूत्र', 'गणना', 'हल', 'हिसाब'],
            'notes': ['नोट', 'ध्यान दें', 'सावधान'],
            'questions': ['प्रश्न', 'प्रश्नोत्तर', 'अभ्यास'],
        }
        
        # Hindi numbering patterns
        self.numbering = {
            '1': 'एक',
            '2': 'दो',
            '3': 'तीन',
            '4': 'चार',
            '5': 'पांच',
            '6': 'छह',
            '7': 'सात',
            '8': 'आठ',
            '9': 'नौ',
            '10': 'दस',
        }
    
    def detect_structure(self, text: str) -> Dict:
        """
        Detect structure in Hindi text
        
        Returns:
            Dictionary with detected structure elements
        """
        result = {
            'has_heading': False,
            'has_list': False,
            'has_diagram_labels': False,
            'structure_type': None,
            'elements': []
        }
        
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for headings
            for category, markers in self.structure_markers.items():
                for marker in markers:
                    if marker in line:
                        result['has_heading'] = True
                        result['elements'].append({
                            'type': 'heading',
                            'category': category,
                            'text': line
                        })
                        break
            
            # Check for numbered lists
            if re.match(r'^\d+\.?\s', line):
                result['has_list'] = True
                result['elements'].append({
                    'type': 'numbered',
                    'text': line
                })
            
            # Check for bullet points
            if re.match(r'^[●•▸▹▪►‣⁃]\s', line):
                result['has_list'] = True
                result['elements'].append({
                    'type': 'bullet',
                    'text': line
                })
            
            # Check for diagram labels (short, standalone terms)
            if len(line) < 20 and not line.endswith('।') and not line.endswith('.'):
                result['has_diagram_labels'] = True
                result['elements'].append({
                    'type': 'diagram_label',
                    'text': line
                })
        
        # Determine primary structure type
        if result['has_heading']:
            result['structure_type'] = 'document'
        elif result['has_list']:
            result['structure_type'] = 'list'
        elif result['has_diagram_labels']:
            result['structure_type'] = 'diagram'
        else:
            result['structure_type'] = 'paragraph'
        
        return result


def demo():
    """Demo function to test structured output processor"""
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    print("=" * 70)
    print("Structured Output Processor Demo")
    print("=" * 70)
    
    processor = StructuredOutputProcessor()
    
    # Sample OCR output (unstructured)
    sample_text = """ज्वालामुखी परिभाषा: पृथ्वी के अंदर स्थित गर्म मैग्मा, गैस एवं राख जब किसी दरार या छिद्र के माध्यम से पृथ्वी की सतह पर बाहर निकलते हैं, तो इस घटना को ज्वालामुखी उद्गार कहते हैं। ज्वालामुखी के प्रमुख भाग: 1. मैग्मा कक्ष 2. ज्वालामुखी नली 3. ज्वालामुखी शंकु 4. क्रेटर 5. लावा क्रेटर ज्वालामुखी शंकु ज्वालामुखी नली लावा मैग्मा कक्ष ज्वालामुखी के प्रकार: 1. सक्रिय ज्वालामुखी — जिनमें समय-समय पर उद्गार होता रहता हैं। 2. प्रसुप्त ज्वालामुखी — जो वर्तमान में शांत हैं, लेकिन भविष्य में उद्गार हो सकता हैं। 3. मृत ज्वालामुखी — जिनमें दोबारा उद्गार की संभावना बहुत कम मानी जाती हैं। महत्वपूर्ण तथ्य: • ज्वालामुखी से निकलने वाले पिघले हुए पदार्थ को लावा कहते हैं। • पृथ्वी के अंदर मौजूद पिघली हुई चट्टान को मैग्मा कहते हैं। • अधिकांश ज्वालामुखी प्लेट सीमाओं के आसपास पाए जाते हैं। • प्रशांत महासागर के चारों ओर स्थित क्षेत्र को Ring of Fire कहा जाता हैं। EXAM FACT: भारत का एकमात्र सक्रिय ज्वालामुखी — बैरन द्वीप (अंडमान एवं निकोबार द्वीप समूह)"""
    
    print("\nORIGINAL (Unstructured):")
    print("-" * 50)
    print(sample_text)
    
    # Process the text
    structured = processor.process(sample_text)
    
    print("\n\nSTRUCTURED OUTPUT:")
    print("-" * 50)
    print(structured)
    
    # Detect structure
    detector = HindiStructureDetector()
    structure = detector.detect_structure(sample_text)
    
    print("\n\nDETECTED STRUCTURE:")
    print("-" * 50)
    print(f"Has Heading: {structure['has_heading']}")
    print(f"Has List: {structure['has_list']}")
    print(f"Has Diagram Labels: {structure['has_diagram_labels']}")
    print(f"Structure Type: {structure['structure_type']}")
    print(f"Elements Count: {len(structure['elements'])}")
    
    for elem in structure['elements'][:10]:
        print(f"  {elem['type']}: {elem['text'][:50]}...")


if __name__ == "__main__":
    demo()
