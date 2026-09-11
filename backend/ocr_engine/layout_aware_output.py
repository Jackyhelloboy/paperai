"""
Layout-Aware OCR Output System
Preserves exact visual layout: columns, boxes, headings, bullets, spacing
"""
import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class RegionType(Enum):
    HEADING = "heading"
    SUBHEADING = "subheading"
    BOX_TITLE = "box_title"
    BOX_CONTENT = "box_content"
    BULLET = "bullet"
    NUMBERED = "numbered"
    DIAGRAM_LABEL = "diagram_label"
    TWO_COLUMN_LEFT = "two_column_left"
    TWO_COLUMN_RIGHT = "two_column_right"
    TRICK_BOX = "trick_box"
    REVISION_BOX = "revision_box"
    MAP_LABEL = "map_label"
    SEPARATOR = "separator"
    BODY = "body"


@dataclass
class LayoutRegion:
    """Represents a detected region in the document"""
    bbox: List[int]  # [x1, y1, x2, y2]
    region_type: RegionType
    text: str = ""
    column: int = 0  # 0=single, 1=left, 2=right
    box_id: int = 0
    confidence: float = 0.0
    is_bold: bool = False
    font_size: int = 0


class LayoutDetector:
    """
    Advanced layout detection for educational documents
    Detects: columns, boxes, headings, bullets, diagrams
    """
    
    def __init__(self):
        self.min_region_width = 50
        self.min_region_height = 15
        self.column_gap_threshold = 100
        self.box_border_threshold = 10
    
    def detect_layout(self, image: np.ndarray) -> List[LayoutRegion]:
        """
        Detect all regions in the document image
        
        Args:
            image: Input image (BGR or grayscale)
            
        Returns:
            List of LayoutRegion objects
        """
        if len(image.shape) == 2:
            gray = image
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 15, 4
            )
        else:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 15, 4
            )
        
        # Detect different elements
        boxes = self._detect_boxes(image, binary)
        columns = self._detect_columns(binary)
        headings = self._detect_headings(image, binary)
        bullets = self._detect_bullets(binary)
        separators = self._detect_separators(binary)
        
        # Create regions from all detections
        regions = []
        
        # Add boxes as regions
        for i, box in enumerate(boxes):
            regions.append(LayoutRegion(
                bbox=box['bbox'],
                region_type=RegionType.BOX_CONTENT,
                box_id=i,
                confidence=box['confidence']
            ))
        
        # Add headings
        for heading in headings:
            regions.append(LayoutRegion(
                bbox=heading['bbox'],
                region_type=RegionType.HEADING,
                is_bold=heading.get('is_bold', False),
                font_size=heading.get('font_size', 0),
                confidence=heading['confidence']
            ))
        
        # Add bullets
        for bullet in bullets:
            regions.append(LayoutRegion(
                bbox=bullet['bbox'],
                region_type=RegionType.BULLET,
                confidence=bullet['confidence']
            ))
        
        # Add separators
        for sep in separators:
            regions.append(LayoutRegion(
                bbox=sep['bbox'],
                region_type=RegionType.SEPARATOR,
                confidence=sep['confidence']
            ))
        
        # Assign columns
        regions = self._assign_columns(regions, image.shape[1])
        
        # Sort by reading order
        regions = self._sort_reading_order(regions)
        
        return regions
    
    def _detect_boxes(self, image: np.ndarray, binary: np.ndarray) -> List[Dict]:
        """Detect boxed/bordered regions"""
        boxes = []
        
        # Detect horizontal lines
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
        h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
        
        # Detect vertical lines
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 20))
        v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
        
        # Combine to find boxes
        box_mask = cv2.add(h_lines, v_lines)
        
        # Find contours
        contours, _ = cv2.findContours(box_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        h, w = image.shape[:2]
        
        for contour in contours:
            x, y, bw, bh = cv2.boundingRect(contour)
            
            # Filter by size
            if bw > 100 and bh > 50:
                # Check if it's a closed box
                roi = binary[y:y+bh, x:x+bw]
                border_pixels = cv2.countNonZero(roi)
                total_pixels = bw * bh
                
                if total_pixels > 0:
                    border_ratio = border_pixels / total_pixels
                    if 0.05 < border_ratio < 0.3:  # Box has border but not too dense
                        boxes.append({
                            'bbox': [x, y, x + bw, y + bh],
                            'confidence': min(1.0, border_ratio * 10)
                        })
        
        return boxes
    
    def _detect_columns(self, binary: np.ndarray) -> List[Dict]:
        """Detect column layout"""
        h, w = binary.shape
        
        # Project to vertical axis
        v_proj = np.sum(binary, axis=0) / 255
        
        # Find gaps (low projection values)
        threshold = h * 0.1
        gaps = np.where(v_proj < threshold)[0]
        
        # Find column boundaries
        columns = []
        if len(gaps) > 0:
            # Find significant gaps
            gap_diffs = np.diff(gaps)
            big_gaps = np.where(gap_diffs > self.column_gap_threshold)[0]
            
            if len(big_gaps) >= 1:
                # Two-column layout
                left_end = gaps[big_gaps[0]]
                right_start = gaps[big_gaps[0] + 1]
                
                columns.append({
                    'bbox': [0, 0, left_end, h],
                    'column': 1
                })
                columns.append({
                    'bbox': [right_start, 0, w, h],
                    'column': 2
                })
        
        return columns
    
    def _detect_headings(self, image: np.ndarray, binary: np.ndarray) -> List[Dict]:
        """Detect headings (larger/bolder text)"""
        headings = []
        
        # Use morphological operations to find text regions
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3))
        dilated = cv2.dilate(binary, kernel, iterations=2)
        
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        h, w = image.shape[:2]
        
        for contour in contours:
            x, y, bw, bh = cv2.boundingRect(contour)
            
            # Filter by size - headings are typically wider and taller
            if bw > w * 0.3 and bh > 20:
                # Check if text is bold (high pixel density)
                roi = binary[y:y+bh, x:x+bw]
                density = cv2.countNonZero(roi) / (bw * bh)
                
                if density > 0.3:  # Bold text has higher density
                    headings.append({
                        'bbox': [x, y, x + bw, y + bh],
                        'is_bold': True,
                        'font_size': bh,
                        'confidence': min(1.0, density * 2)
                    })
        
        return headings
    
    def _detect_bullets(self, binary: np.ndarray) -> List[Dict]:
        """Detect bullet points"""
        bullets = []
        h, w = binary.shape
        
        # Project to horizontal axis
        h_proj = np.sum(binary, axis=1) / 255
        
        # Find rows with bullet characters (small, isolated marks)
        for y in range(h):
            if h_proj[y] > 5 and h_proj[y] < 30:  # Small mark
                # Check if it's a bullet (left-aligned, small)
                row_pixels = np.where(binary[y, :] > 0)[0]
                if len(row_pixels) > 0:
                    x_start = row_pixels[0]
                    if x_start < w * 0.2:  # Left-aligned
                        bullets.append({
                            'bbox': [x_start, y - 5, x_start + 20, y + 5],
                            'confidence': 0.8
                        })
        
        return bullets
    
    def _detect_separators(self, binary: np.ndarray) -> List[Dict]:
        """Detect horizontal separators"""
        separators = []
        h, w = binary.shape
        
        # Project to horizontal axis
        h_proj = np.sum(binary, axis=1) / 255
        
        # Find rows with significant horizontal lines
        for y in range(h):
            if h_proj[y] > w * 0.3:  # Line spans >30% of width
                separators.append({
                    'bbox': [0, y - 2, w, y + 2],
                    'confidence': 0.9
                })
        
        return separators
    
    def _assign_columns(self, regions: List[LayoutRegion], image_width: int) -> List[LayoutRegion]:
        """Assign columns to regions"""
        mid_point = image_width // 2
        
        for region in regions:
            x_center = (region.bbox[0] + region.bbox[2]) // 2
            
            if x_center < mid_point * 0.8:
                region.column = 1  # Left column
            elif x_center > mid_point * 1.2:
                region.column = 2  # Right column
            else:
                region.column = 0  # Single column / centered
        
        return regions
    
    def _sort_reading_order(self, regions: List[LayoutRegion]) -> List[LayoutRegion]:
        """Sort regions in proper reading order"""
        def sort_key(region):
            y = region.bbox[1]
            x = region.bbox[0]
            col = region.column
            
            # Primary sort by Y, secondary by column, tertiary by X
            return (y, col, x)
        
        return sorted(regions, key=sort_key)


class ImageMatchingFormatter:
    """
    Formats OCR output to match exact image layout
    """
    
    def __init__(self):
        self.line_width = 80  # Characters per line
        self.section_spacing = "\n\n"
        self.column_spacing = "        "  # 8 spaces between columns
    
    def format_output(self, regions: List[LayoutRegion], ocr_results: Dict) -> str:
        """
        Format OCR results to match image layout
        
        Args:
            regions: Detected layout regions
            ocr_results: OCR text for each region
            
        Returns:
            Formatted text matching image layout
        """
        if not regions:
            return ""
        
        # Group regions by type and column
        groups = self._group_regions(regions)
        
        # Build output
        output_parts = []
        
        for group in groups:
            formatted = self._format_group(group, ocr_results)
            if formatted:
                output_parts.append(formatted)
        
        return self.section_spacing.join(output_parts)
    
    def _group_regions(self, regions: List[LayoutRegion]) -> List[List[LayoutRegion]]:
        """Group regions that should be together"""
        groups = []
        current_group = []
        
        for region in regions:
            if not current_group:
                current_group.append(region)
            else:
                # Check if this region should be in the same group
                last = current_group[-1]
                
                # Same column and close vertically
                same_column = region.column == last.column
                vertical_gap = abs(region.bbox[1] - last.bbox[3])
                
                if same_column and vertical_gap < 50:
                    current_group.append(region)
                else:
                    groups.append(current_group)
                    current_group = [region]
        
        if current_group:
            groups.append(current_group)
        
        return groups
    
    def _format_group(self, group: List[LayoutRegion], ocr_results: Dict) -> str:
        """Format a group of regions"""
        if not group:
            return ""
        
        parts = []
        
        # Check if this is a two-column group
        has_left = any(r.column == 1 for r in group)
        has_right = any(r.column == 2 for r in group)
        
        if has_left and has_right:
            # Format as two columns
            left_regions = [r for r in group if r.column == 1]
            right_regions = [r for r in group if r.column == 2]
            
            left_text = self._format_column(left_regions, ocr_results)
            right_text = self._format_column(right_regions, ocr_results)
            
            # Side by side
            left_lines = left_text.split('\n')
            right_lines = right_text.split('\n')
            
            max_lines = max(len(left_lines), len(right_lines))
            
            for i in range(max_lines):
                left = left_lines[i] if i < len(left_lines) else ""
                right = right_lines[i] if i < len(right_lines) else ""
                
                # Pad to fixed width
                left_padded = left.ljust(40)
                parts.append(f"{left_padded}{right}")
        else:
            # Single column
            parts.append(self._format_column(group, ocr_results))
        
        return '\n'.join(parts)
    
    def _format_column(self, regions: List[LayoutRegion], ocr_results: Dict) -> str:
        """Format regions in a single column"""
        parts = []
        
        for region in regions:
            text = ocr_results.get(str(region.bbox), "")
            if not text:
                continue
            
            # Format based on region type
            if region.region_type == RegionType.HEADING:
                parts.append(f"\n{text}\n")
            elif region.region_type == RegionType.BULLET:
                parts.append(f"  • {text}")
            elif region.region_type == RegionType.BOX_CONTENT:
                parts.append(f"┌{'─' * 50}┐")
                parts.append(f"│ {text}")
                parts.append(f"└{'─' * 50}┘")
            elif region.region_type == RegionType.SEPARATOR:
                parts.append("─" * 60)
            else:
                parts.append(text)
        
        return '\n'.join(parts)


class StructuredNotesFormatter:
    """
    Formats OCR output into notebook-style structured notes
    Matches the exact format shown in educational images
    """
    
    def __init__(self):
        self.indent = "    "
        self.bullet = "•"
        self.arrow = "→"
    
    def format_notes(self, text: str, layout_info: Dict = None) -> str:
        """
        Format text into structured notes style
        
        Args:
            text: Raw OCR text
            layout_info: Optional layout detection info
            
        Returns:
            Structured notes text
        """
        lines = text.split('\n')
        formatted_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                formatted_lines.append('')
                continue
            
            # Detect line type and format accordingly
            formatted = self._format_line(line)
            formatted_lines.append(formatted)
        
        # Clean up multiple blank lines
        result = '\n'.join(formatted_lines)
        result = re.sub(r'\n{3,}', '\n\n', result)
        
        return result
    
    def _format_line(self, line: str) -> str:
        """Format a single line based on content"""
        import re
        
        # Main heading (larger text, centered)
        if self._is_main_heading(line):
            return f"\n{'=' * 60}\n{line.center(60)}\n{'=' * 60}\n"
        
        # Section heading (ends with colon or is short bold text)
        if self._is_section_heading(line):
            return f"\n{line}\n{'─' * 40}\n"
        
        # Sub-section heading
        if self._is_sub_heading(line):
            return f"\n  {line}\n"
        
        # Numbered list item
        match = re.match(r'^(\d+)\.?\s+(.+)', line)
        if match:
            num = match.group(1)
            content = match.group(2)
            return f"  {num}. {content}"
        
        # Bullet point
        if line.startswith(('●', '•', '▸', '▹', '▪', '►', '‣', '⁃', '-', '*')):
            return f"  {self.bullet} {line[1:].strip()}"
        
        # Diagram label (short, standalone term)
        if len(line) < 25 and not line.endswith(('।', '.')):
            return f"    [{line}]"
        
        # Trick/revision box content
        if 'trick' in line.lower() or 'revision' in line.lower():
            return f"\n┌{'─' * 50}┐\n│ {line}\n└{'─' * 50}┘\n"
        
        # Map label
        if any(word in line for word in ['सागर', 'खाड़ी', 'प्रदेश', 'द्वीप']):
            return f"  📍 {line}"
        
        # Regular paragraph
        return f"  {line}"
    
    def _is_main_heading(self, line: str) -> bool:
        """Check if line is a main heading"""
        # Main headings are typically short, centered, and may have special formatting
        if len(line) < 30 and not line.endswith(('।', '.')):
            return True
        return False
    
    def _is_section_heading(self, line: str) -> bool:
        """Check if line is a section heading"""
        import re
        
        # Ends with colon
        if line.endswith(':'):
            return True
        
        # Hindi section markers
        if any(marker in line for marker in ['परिभाषा', 'प्रकार', 'भाग', 'तथ्य', 'नोट', 'उदाहरण']):
            return True
        
        # English section markers
        if any(marker in line.lower() for marker in ['definition', 'types', 'parts', 'facts', 'note', 'example']):
            return True
        
        return False
    
    def _is_sub_heading(self, line: str) -> bool:
        """Check if line is a sub-heading"""
        # Short lines that aren't headings
        if len(line) < 40 and not line.endswith(('।', '.')):
            return True
        return False


def format_ocr_to_match_image(raw_ocr_text: str) -> str:
    """
    Main function to format OCR text to match image layout exactly
    
    Args:
        raw_ocr_text: Raw OCR output
        
    Returns:
        Formatted text matching image layout
    """
    formatter = StructuredNotesFormatter()
    return formatter.format_notes(raw_ocr_text)


def demo():
    """Demo function to test the formatter"""
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    print("=" * 70)
    print("Image-Matching OCR Output Formatter Demo")
    print("=" * 70)
    
    # Sample raw OCR text (unstructured)
    raw_text = """भारत की प्रमुख नदियाँ हिमालयी नदियाँ प्रायद्वीपीय नदियाँ गंगा यमुना ब्रह्मपुत्र सिंधु गोदावरी कृष्णा नर्मदा तापी महानदी कावेरी नदियों के प्रवाह की दिशा महत्वपूर्ण तथ्य सबसे लंबी नदी गंगा सबसे लंबी प्रायद्वीपीय नदी गोदावरी पश्चिम की ओर बहने वाली नदियाँ नर्मदा तापी दक्षिण की गंगा गोदावरी PYQ नदियों को जोड़ने वाली परियोजनाएँ गंगा कावेरी लिंक परियोजना केन बेतवा लिंक परियोजना दमन गंगा पिंजल लिंक परियोजना याद रखने की Trick हि य ब्र सिं Quick Revision"""
    
    print("\nRAW OCR TEXT:")
    print("-" * 50)
    print(raw_text)
    
    # Format to match image
    formatted = format_ocr_to_match_image(raw_text)
    
    print("\n\nFORMATTED OUTPUT (Matching Image):")
    print("-" * 50)
    print(formatted)
    
    print("\n\n" + "=" * 70)
    print("EXPECTED OUTPUT FORMAT:")
    print("=" * 70)
    expected = """
══════════════════════════════════════════════════════════════
                    भारत की प्रमुख नदियाँ
══════════════════════════════════════════════════════════════

  हिमालयी नदियाँ                    प्रायद्वीपीय नदियाँ
  ─────────────────────              ─────────────────────
    • गंगा                             • गोदावरी
    • यमुना                            • कृष्णा
    • ब्रह्मपुत्र                       • नर्मदा
    • सिंधु                             • तापी
                                       • महानदी
                                       • कावेरी

  नदियों के प्रवाह की दिशा           महत्वपूर्ण तथ्य
  ─────────────────────              ─────────────────────
    • सबसे लंबी नदी - गंगा
    • सबसे लंबी प्रायद्वीपीय नदी - गोदावरी
    • पश्चिम की ओर बहने वाली नदियाँ - नर्मदा, तापी
    • दक्षिण की गंगा - गोदावरी

  PYQ
  ─────────────────────

  नदियों को जोड़ने वाली परियोजनाएँ
  ─────────────────────
    • गंगा - कावेरी लिंक परियोजना
    • केन - बेतवा लिंक परियोजना
    • दमन गंगा - पिंजल लिंक परियोजना

┌──────────────────────────────────────────────────────────┐
│ याद रखने की Trick                                        │
│   हि - य - ब्र - सिं                                      │
└──────────────────────────────────────────────────────────┘

  Quick Revision
  ─────────────────────
"""
    print(expected)


if __name__ == "__main__":
    import re
    demo()
