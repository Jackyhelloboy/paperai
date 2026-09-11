"""
Exact Image Layout Matcher
Converts OCR output to match image format exactly with:
- Two-column layouts
- Boxed sections
- Proper headings
- Bullet points
- Diagram labels
- Map labels
- Trick/revision boxes
"""
import re
from typing import List, Dict, Tuple


class ExactImageMatcher:
    """
    Matches OCR output to exact image layout
    """
    
    def __init__(self):
        self.line_width = 60
        self.box_width = 55
    
    def match_image_layout(self, text: str, image_type: str = "geography") -> str:
        """
        Convert text to match image layout exactly
        
        Args:
            text: Raw OCR text
            image_type: Type of image (geography, science, math, etc.)
            
        Returns:
            Text formatted to match image layout
        """
        # Parse the text into components
        components = self._parse_components(text)
        
        # Format based on image type
        if image_type == "geography":
            return self._format_geography_notes(components)
        elif image_type == "science":
            return self._format_science_notes(components)
        elif image_type == "math":
            return self._format_math_notes(components)
        else:
            return self._format_generic_notes(components)
    
    def _parse_components(self, text: str) -> Dict:
        """Parse text into structured components"""
        lines = text.split('\n')
        
        components = {
            'main_title': '',
            'sections': [],
            'columns': {'left': [], 'right': []},
            'bullets': [],
            'numbered': [],
            'boxes': [],
            'tricks': [],
            'facts': [],
            'map_labels': [],
            'questions': []
        }
        
        current_section = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect main title (first significant text)
            if not components['main_title'] and len(line) < 30:
                components['main_title'] = line
                continue
            
            # Detect section headings
            if self._is_heading(line):
                current_section = {
                    'title': line,
                    'content': []
                }
                components['sections'].append(current_section)
                continue
            
            # Detect bullet points
            if line.startswith(('●', '•', '▸', '▪', '►', '-', '*')):
                components['bullets'].append(line)
                continue
            
            # Detect numbered items
            if re.match(r'^\d+\.?\s', line):
                components['numbered'].append(line)
                continue
            
            # Detect trick boxes
            if 'trick' in line.lower() or 'याद रखने' in line:
                components['tricks'].append(line)
                continue
            
            # Detect facts
            if 'तथ्य' in line or 'fact' in line.lower():
                components['facts'].append(line)
                continue
            
            # Detect map labels
            if any(word in line for word in ['सागर', 'खाड़ी', 'द्वीप', 'प्रदेश']):
                components['map_labels'].append(line)
                continue
            
            # Detect questions
            if 'PYQ' in line or 'प्रश्न' in line:
                components['questions'].append(line)
                continue
            
            # Default: add to current section
            if current_section:
                current_section['content'].append(line)
            else:
                components['bullets'].append(line)
        
        return components
    
    def _is_heading(self, line: str) -> bool:
        """Check if line is a heading"""
        # Hindi headings
        if any(h in line for h in ['परिभाषा', 'प्रकार', 'भाग', 'तथ्य', 'नोट', 'उदाहरण', 'सिद्धांत']):
            return True
        # English headings
        if any(h in line.lower() for h in ['definition', 'types', 'parts', 'facts', 'note', 'example']):
            return True
        # Short lines without punctuation
        if len(line) < 30 and not line.endswith(('।', '.', ',')):
            return True
        return False
    
    def _format_geography_notes(self, components: Dict) -> str:
        """Format as geography notes matching image"""
        output = []
        
        # Main title
        title = components['main_title']
        output.append(f"\n{'═' * 60}")
        output.append(f"{title.center(60)}")
        output.append(f"{'═' * 60}\n")
        
        # Two-column layout for sections
        if len(components['sections']) >= 2:
            left = components['sections'][0]
            right = components['sections'][1]
            
            output.append(self._format_two_columns(
                left['title'], left['content'],
                right['title'], right['content']
            ))
        elif components['sections']:
            for section in components['sections']:
                output.append(f"\n{section['title']}")
                output.append(f"{'─' * 40}")
                for item in section['content']:
                    output.append(f"  • {item}")
        
        # Facts section
        if components['facts']:
            output.append(f"\nमहत्वपूर्ण तथ्य")
            output.append(f"{'─' * 40}")
            for fact in components['facts']:
                output.append(f"  • {fact}")
        
        # Questions
        if components['questions']:
            output.append(f"\nPYQ")
            output.append(f"{'─' * 40}")
            for q in components['questions']:
                output.append(f"  {q}")
        
        # Tricks
        if components['tricks']:
            output.append(f"\n┌{'─' * 55}┐")
            output.append(f"│ याद रखने की Trick")
            output.append(f"├{'─' * 55}┤")
            for trick in components['tricks']:
                output.append(f"│   {trick}")
            output.append(f"└{'─' * 55}┘")
        
        return '\n'.join(output)
    
    def _format_two_columns(self, left_title: str, left_content: List[str],
                           right_title: str, right_content: List[str]) -> str:
        """Format two columns side by side"""
        lines = []
        
        # Column titles
        left_title_padded = left_title.ljust(35)
        lines.append(f"  {left_title_padded}{right_title}")
        lines.append(f"  {'─' * 30}        {'─' * 30}")
        
        # Column content
        max_lines = max(len(left_content), len(right_content))
        
        for i in range(max_lines):
            left = left_content[i] if i < len(left_content) else ""
            right = right_content[i] if i < len(right_content) else ""
            
            left_padded = f"    • {left}".ljust(35)
            lines.append(f"  {left_padded}• {right}")
        
        return '\n'.join(lines)
    
    def _format_science_notes(self, components: Dict) -> str:
        """Format as science notes"""
        output = []
        
        title = components['main_title']
        output.append(f"\n{'═' * 60}")
        output.append(f"{title.center(60)}")
        output.append(f"{'═' * 60}\n")
        
        for section in components['sections']:
            output.append(f"\n{section['title']}")
            output.append(f"{'─' * 40}")
            for item in section['content']:
                output.append(f"  • {item}")
        
        return '\n'.join(output)
    
    def _format_math_notes(self, components: Dict) -> str:
        """Format as math notes"""
        output = []
        
        title = components['main_title']
        output.append(f"\n{'═' * 60}")
        output.append(f"{title.center(60)}")
        output.append(f"{'═' * 60}\n")
        
        for section in components['sections']:
            output.append(f"\n{section['title']}")
            output.append(f"{'─' * 40}")
            for item in section['content']:
                if any(c in item for c in ['=', '+', '-', '×', '÷', '²', '³', '√', 'π']):
                    output.append(f"    {item}")
                else:
                    output.append(f"  • {item}")
        
        return '\n'.join(output)
    
    def _format_generic_notes(self, components: Dict) -> str:
        """Format as generic notes"""
        output = []
        
        title = components['main_title']
        output.append(f"\n{'═' * 60}")
        output.append(f"{title.center(60)}")
        output.append(f"{'═' * 60}\n")
        
        for section in components['sections']:
            output.append(f"\n{section['title']}")
            output.append(f"{'─' * 40}")
            for item in section['content']:
                output.append(f"  • {item}")
        
        # Bullets
        if components['bullets']:
            output.append(f"\n要点:")
            for b in components['bullets']:
                output.append(f"  • {b}")
        
        return '\n'.join(output)


class BoxedSectionFormatter:
    """
    Creates boxed sections like in the image
    """
    
    @staticmethod
    def create_box(title: str, content: List[str], width: int = 55) -> str:
        """Create a boxed section"""
        lines = []
        lines.append(f"┌{'─' * width}┐")
        lines.append(f"│ {title.center(width - 2)} │")
        lines.append(f"├{'─' * width}┤")
        
        for item in content:
            # Wrap long lines
            if len(item) > width - 4:
                words = item.split()
                current_line = ""
                for word in words:
                    if len(current_line) + len(word) + 1 < width - 4:
                        current_line += " " + word if current_line else word
                    else:
                        lines.append(f"│   {current_line.ljust(width - 4)} │")
                        current_line = word
                if current_line:
                    lines.append(f"│   {current_line.ljust(width - 4)} │")
            else:
                lines.append(f"│   {item.ljust(width - 4)} │")
        
        lines.append(f"└{'─' * width}┘")
        return '\n'.join(lines)
    
    @staticmethod
    def create_trick_box(trick: str, content: List[str], width: int = 55) -> str:
        """Create a trick/revision box"""
        lines = []
        lines.append(f"┌{'─' * width}┐")
        lines.append(f"│ {'याद रखने की Trick'.center(width - 2)} │")
        lines.append(f"├{'─' * width}┤")
        lines.append(f"│   {trick.ljust(width - 4)} │")
        lines.append(f"├{'─' * width}┤")
        
        for item in content:
            lines.append(f"│   {item.ljust(width - 4)} │")
        
        lines.append(f"└{'─' * width}┘")
        return '\n'.join(lines)


def format_geography_notes(text: str) -> str:
    """
    Main function to format geography notes to match image
    
    Args:
        text: Raw OCR text
        
    Returns:
        Formatted text matching image layout
    """
    matcher = ExactImageMatcher()
    return matcher.match_image_layout(text, "geography")


def demo():
    """Demo function"""
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    print("=" * 70)
    print("EXACT IMAGE LAYOUT MATCHER")
    print("=" * 70)
    
    # Sample raw OCR text
    raw_text = """भारत की प्रमुख नदियाँ हिमालयी नदियाँ गंगा यमुना ब्रह्मपुत्र सिंधु प्रायद्वीपीय नदियाँ गोदावरी कृष्णा नर्मदा तापी महानदी कावेरी नदियों के प्रवाह की दिशा महत्वपूर्ण तथ्य सबसे लंबी नदी गंगा सबसे लंबी प्रायद्वीपीय नदी गोदावरी पश्चिम की ओर बहने वाली नदियाँ नर्मदा तापी दक्षिण की गंगा गोदावरी PYQ नदियों को जोड़ने वाली परियोजनाएँ गंगा कावेरी लिंक परियोजना केन बेतवा लिंक परियोजना दमन गंगा पिंजल लिंक परियोजना याद रखने की Trick हि य ब्र सिं Quick Revision"""
    
    print("\nRAW OCR TEXT:")
    print("-" * 50)
    print(raw_text[:200] + "...")
    
    # Format to match image
    formatted = format_geography_notes(raw_text)
    
    print("\n\nFORMATTED OUTPUT (Matching Image Layout):")
    print("-" * 50)
    print(formatted)
    
    # Show boxed section example
    print("\n\nBOXED SECTION EXAMPLE:")
    print("-" * 50)
    
    boxed = BoxedSectionFormatter.create_trick_box(
        "हि - य - ब्र - सिं",
        ["हिमालयी नदियाँ: गंगा, यमुना, ब्रह्मपुत्र, सिंधु"]
    )
    print(boxed)


if __name__ == "__main__":
    demo()
