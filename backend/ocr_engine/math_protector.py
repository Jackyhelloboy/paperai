"""
Comprehensive Math Protector - High Accuracy Math Formula Recognition
Handles: degrees, exponents, fractions, decimals, equations, operations, and more
"""
import re
import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
from fractions import Fraction


class MathProtector:
    """
    Comprehensive math formula recognition and protection system.
    High accuracy for: degrees, exponents, fractions, decimals,
    equations, operations, chemical formulas, and universal formulas.
    """
    
    def __init__(self):
        # ==================== CORE MATH SYMBOLS ====================
        self.protected_tokens = {
            # Basic operators
            "+", "-", "×", "÷", "=", "±", "∓",
            
            # Comparison operators
            "≠", "≤", "≥", "<", ">", "≈", "≡", "∝",
            
            # Exponents and roots
            "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹", "⁰",
            "¹", "⁻", "√", "∛", "∜",
            "∞", "‾",
            
            # Greek letters (variables)
            "α", "β", "γ", "δ", "ε", "ζ", "η", "θ",
            "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π",
            "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω",
            "Γ", "Δ", "Θ", "Λ", "Ξ", "Π", "Σ", "Φ", "Ψ", "Ω",
            
            # Arrows and relations
            "→", "←", "↔", "⇒", "⇐", "⇔", "⇌", "↦", "↗", "↘",
            
            # Logical symbols
            "∧", "∨", "¬", "∀", "∃", "∄", "∈", "∉", "∋",
            "⊂", "⊃", "⊆", "⊇", "∪", "∩", "∅",
            
            # Set theory and misc
            "∑", "∏", "∫", "∬", "∮", "∂", "∇",
            "∴", "∵", "∝", "∞",
            
            # Geometry symbols
            "∠", "⊥", "∥", "△", "□", "○", "⊙", "⊚",
            "arc", "°", "′", "″",
            
            # Fractions
            "½", "⅓", "⅔", "¼", "¾", "⅕", "⅖", "⅗", "⅘",
            "⅙", "⅚", "⅐", "⅛", "⅜", "⅝", "⅞", "⅑", "⅒",
            
            # Currency and special
            "₹", "$", "€", "£", "¥", "%", "‰", "‱",
            
            # Infinity and constants
            "∞", "ℏ", "ℑ", "ℜ", "ℂ", "ℍ", "ℝ", "ℤ", "ℕ",
        }
        
        # ==================== EXPONENT PATTERNS ====================
        self.exponent_patterns = [
            r'\d+[²³⁴⁵⁶⁷⁸⁹⁰¹]',           # 2³, 10², x⁵
            r'\d+\^\{?\d+\}?',                # 2^3, 10^{2}
            r'[a-zA-Z]\^[²³⁴⁵⁶⁷⁸⁹⁰¹\d\(\)]',  # x^2, x^(n+1)
            r'\d+\^\([^)]+\)',                 # 2^(n+1)
            r'e\^[\d\+\-]',                    # e^2, e^(-1)
            r'10\^[\d\+\-]',                   # 10^6, 10^(-3)
        ]
        
        # ==================== FRACTION PATTERNS ====================
        self.fraction_patterns = [
            # Unicode fractions
            r'[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]',
            
            # Written fractions: 1/2, 3/4, 22/7
            r'\d+\s*/\s*\d+',
            
            # Mixed fractions: 1½, 2¾, 3⅓
            r'\d+[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]',
            
            # Compound fractions: 1 1/2, 2 3/4
            r'\d+\s+\d+/\d+',
            
            # Complex fractions with horizontal bar
            r'\d+\s*÷\s*\d+',  # Sometimes ÷ is used for fraction
            
            # Fraction with variables
            r'[a-zA-Z]\s*/\s*[a-zA-Z]',
        ]
        
        # ==================== DECIMAL PATTERNS ====================
        self.decimal_patterns = [
            r'\d+\.\d+',                          # 3.14, 0.5
            r'\.\d+',                             # .5, .25
            r'\d+\.\d+%',                         # 3.14%
            r'\d+\.\d+[eE][\+\-]?\d+',           # 3.14e-5, 1.6E+3
            r'\d+\.\d+\s*[a-zA-Z]+',             # 3.14 cm, 2.5 kg
        ]
        
        # ==================== DEGREE PATTERNS ====================
        self.degree_patterns = [
            # Basic degree
            r'\d+°',                              # 360°, 90°
            r'\d+\.?\d*°',                        # 360.5°
            r'\d+½°',                             # 66½°
            r'\d+¼°',                             # 23¼°
            r'\d+¾°',                             # 45¾°
            
            # Degree with direction (Hindi geography)
            r'\d+½°\s*उ\.अ\.',                   # 66½° उ.अ.
            r'\d+½°\s*द\.अ\.',                   # 23½° द.अ.
            r'\d+°\s*उ\.अ\.',                    # 66° उ.अ.
            r'\d+°\s*द\.अ\.',                    # 23° द.अ.
            r'\d+½°\s*उत्तरी\s*अक्षांश',        # 23½° उत्तरी अक्षांश
            r'\d+½°\s*दक्षिणी\s*अक्षांश',       # 23½° दक्षिणी अक्षांश
            r'\d+°\s*पूर्वी\s*देशांतर',          # 82° पूर्वी देशांतर
            r'\d+°\s*पश्चिमी\s*देशांतर',        # 82° पश्चिमी देशांतर
            
            # Temperature
            r'\d+\.?\d*\s*°[CFK]',               # 37°C, 212°F, 273.15K
            
            # Degree in equations
            r'\d+\s*°\s*[\+\-\×\÷]',             # 90° + 45°
            r'[\+\-\×\÷]\s*\d+\s*°',             # + 30°
        ]
        
        # ==================== EQUATION PATTERNS ====================
        self.equation_patterns = [
            # Simple equations: x = 5, y = -3
            r'[a-zA-Z]\s*=\s*[\-\+]?\d+',
            
            # Linear equations: 2x + 3 = 7
            r'\d*\s*[a-zA-Z]\s*[\+\-]\s*\d+\s*=\s*[\-\+]?\d+',
            
            # Quadratic: x^2 + 5x + 6 = 0, x² - 5x + 6 = 0
            r'[a-zA-Z]\s*[\^²³⁴]\s*\d*\s*[\+\-]\s*\d*\s*[a-zA-Z]?\s*[\+\-]?\s*\d*\s*[a-zA-Z]?\s*=\s*[\-\+]?\d+',
            
            # Two variable: 2x + 3y = 10
            r'\d*\s*[a-zA-Z]\s*[\+\-]\s*\d*\s*[a-zA-Z]\s*=\s*[\-\+]?\d+',
            
            # With fractions: x/2 + y/3 = 1
            r'[a-zA-Z]\s*/\s*\d+\s*[\+\-]\s*[a-zA-Z]\s*/\s*\d+\s*=\s*\d+',
            
            # Inequality: x > 5, 2x ≤ 10
            r'[a-zA-Z]\s*[<>≤≥]\s*[\-\+]?\d+',
            r'\d+\s*[<>≤≥]\s*[a-zA-Z]',
            
            # System of equations indicator
            r'\{[^}]*=\s*[\-\+]?\d+',
            
            # Trigonometric equations
            r'sin\s*\([^)]+\)\s*=\s*[\-\+]?\d+\.?\d*',
            r'cos\s*\([^)]+\)\s*=\s*[\-\+]?\d+\.?\d*',
            r'tan\s*\([^)]+\)\s*=\s*[\-\+]?\d+\.?\d*',
            r'sin\s*[²³]?\s*[a-zA-Zθαβ]\s*[\+\-]\s*cos\s*[²³]?\s*[a-zA-Zθαβ]\s*=\s*\d+',
            
            # Logarithmic equations
            r'log\s*\([^)]+\)\s*=\s*[\-\+]?\d+',
            r'ln\s*\([^)]+\)\s*=\s*[\-\+]?\d+',
            
            # Radical equations
            r'√\s*\([^)]+\)\s*=\s*[\-\+]?\d+',
            r'√\s*[a-zA-Z]\s*=\s*[\-\+]?\d+',
        ]
        
        # ==================== UNIVERSAL FORMULA PATTERNS ====================
        self.universal_formula_patterns = [
            # Area formulas
            r'[Aa]\s*=\s*\d*\s*[a-zA-Z²³]',
            r'\bpi\b\s*[rR]\s*\^\s*2',           # πr²
            r'π\s*[rR²]',
            r'length\s*\*\s*width',               # l × w
            
            # Perimeter/Circumference
            r'2\s*[pPπ]\s*[rR]',                  # 2πr
            r'[Cc]\s*=\s*2\s*[pPπ]\s*[rR]',
            
            # Volume formulas
            r'[Vv]\s*=\s*[lLwWhHsS]',
            r'π\s*[rR²³]\s*[hH]',
            r'4\s*/\s*3\s*π\s*[rR³]',
            
            # Pythagorean theorem
            r'a\s*\^\s*2\s*\+\s*b\s*\^\s*2\s*=\s*c\s*\^\s*2',
            r'a²\s*\+\s*b²\s*=\s*c²',
            
            # Trigonometric
            r'sin\s*[θαβ]',
            r'cos\s*[θαβ]',
            r'tan\s*[θαβ]',
            r'sin²\s*\+\s*cos²\s*=\s*1',
            
            # Algebraic identities
            r'\(a\s*[\+\-]\s*b\)²\s*=\s*a²\s*[\+\-]\s*2ab\s*\+\s*b²',
            r'a²\s*[\+\-]\s*b²\s*=\s*\(a\s*[\+\-]\s*b\)',
            
            # Physics formulas
            r'F\s*=\s*m\s*a',                      # F = ma
            r'E\s*=\s*m\s*c\s*\^\s*2',            # E = mc²
            r'v\s*=\s*u\s*[\+\-]\s*a\s*t',        # v = u ± at
            r's\s*=\s*u\s*t\s*\+\s*½\s*a\s*t\s*\^\s*2',
            r'P\s*=\s*W\s*/\s*t',                  # P = W/t
            r'V\s*=\s*I\s*R',                      # V = IR (Ohm's law)
            
            # Chemical formulas
            r'H₂O', r'CO₂', r'O₂', r'N₂', r'H₂',
            r'H₂SO₄', r'NaCl', r'CaCO₃', r'NaOH',
            r'CH₄', r'C₂H₅OH', r'C₆H₁₂O₆',
        ]
        
        # ==================== OPERATION PATTERNS ====================
        self.operation_patterns = [
            # Addition
            r'\d+\s*\+\s*\d+',                    # 5 + 3
            r'[a-zA-Z]\s*\+\s*[a-zA-Z]',         # x + y
            r'[a-zA-Z]\s*\+\s*\d+',               # x + 5
            
            # Subtraction
            r'\d+\s*-\s*\d+',                      # 10 - 3
            r'[a-zA-Z]\s*-\s*[a-zA-Z]',           # x - y
            
            # Multiplication
            r'\d+\s*[×\*]\s*\d+',                 # 5 × 3, 5 * 3
            r'\d+\s*×\s*[a-zA-Z]',                 # 3x
            r'[a-zA-Z]\s*×\s*[a-zA-Z]',           # x × y
            
            # Division
            r'\d+\s*[÷/]\s*\d+',                  # 10 ÷ 2, 10 / 2
            r'[a-zA-Z]\s*[÷/]\s*[a-zA-Z]',        # x ÷ y
            
            # Combined operations
            r'\d+\s*[\+\-]\s*\d+\s*[\+\-]\s*\d+', # 5 + 3 - 2
            r'\d+\s*[×÷]\s*\d+\s*[\+\-]\s*\d+',   # 5 × 3 + 2
            
            # Order of operations indicators
            r'\([^()]+\)\s*[×÷^]',                  # (a+b) ×
            r'\^[²³⁴⁵⁶⁷⁸⁹]',                      # exponents
        ]
        
        # ==================== NUMBER PATTERNS ====================
        self.number_patterns = [
            # Integers
            r'\b\d+\b',
            
            # Negative numbers
            r'-\d+',
            r'\(\s*-\s*\d+\s*\)',
            
            # Decimals
            r'\d+\.\d+',
            r'\.\d+',
            
            # Scientific notation
            r'\d+\.?\d*\s*[eE]\s*[\+\-]?\d+',
            
            # Roman numerals (common)
            r'\b[IVXLCDM]+\b',
            
            # Numbers with separators
            r'\d{1,3}(?:,\d{3})+',
        ]
        
        # ==================== UNIT PATTERNS ====================
        self.unit_patterns = [
            # Length
            r'\d+\s*(?:mm|cm|dm|m|km|in|ft|yd|mi)',
            r'\d+\s*(?:millimeters?|centimeters?|meters?|kilometers?)',
            
            # Mass
            r'\d+\s*(?:mg|g|kg|ton|lb|oz)',
            r'\d+\s*(?:milligrams?|grams?|kilograms?|tons?)',
            
            # Volume
            r'\d+\s*(?:mL|dL|L|gal|qt|pt|cup)',
            r'\d+\s*(?:milliliters?|deciliters?|liters?|gallons?)',
            
            # Time
            r'\d+\s*(?:ms|s|min|hr|h|d|yr)',
            r'\d+\s*(?:seconds?|minutes?|hours?|days?|years?)',
            
            # Temperature
            r'\d+\.?\d*\s*°[CFK]',
            
            # Speed
            r'\d+\s*(?:m/s|km/h|mph|knot)',
            
            # Area
            r'\d+\s*(?:mm²|cm²|m²|km²|ha|acre|sq\s*(?:ft|mi|yd))',
            
            # Volume (cubic)
            r'\d+\s*(?:mm³|cm³|m³|L|mL)',
            
            # Pressure
            r'\d+\s*(?:Pa|kPa|MPa|bar|atm|psi|mmHg|torr)',
            
            # Energy
            r'\d+\s*(?:J|kJ|cal|kcal|eV|kWh)',
            
            # Power
            r'\d+\s*(?:W|kW|MW|hp)',
            
            # Electric
            r'\d+\s*(?:A|mA|V|mV|kV|Ω|kΩ|MΩ|F|μF|nF|pF|Hz|kHz|MHz|GHz)',
            
            # Chemical concentration
            r'\d+\s*(?:mol|mmol|mol/L|M)',
            
            # Common in geography/science
            r'\d+\s*(?:km²|sq\s*km)',
            r'\d+\s*(?:million|billion|trillion)',
        ]
        
        # ==================== CHEMICAL FORMULA PATTERNS ====================
        self.chemical_patterns = [
            r'H₂O', r'CO₂', r'O₂', r'N₂', r'H₂', r'Cl₂', r'SO₂', r'NO₂',
            r'H₂SO₄', r'HNO₃', r'HCl', r'NaCl', r'CaCO₃', r'NaOH', r'KOH',
            r'CH₄', r'C₂H₆', r'C₂H₄', r'C₂H₂', r'C₃H₈',
            r'C₂H₅OH', r'CH₃COOH', r'C₆H₁₂O₆', r'C₁₂H₂₂O₁₁',
            r'Fe₂O₃', r'CuSO₄', r'KMnO₄', r'Ca(OH)₂', r'Mg(OH)₂',
            r'Na₂CO₃', r'NaHCO₃', r'CaO', r'MgO', r'Al₂O₃',
        ]
    
    def protect(self, ocr_results: List[Dict]) -> List[Dict]:
        """Protect math expressions in OCR results"""
        protected_results = []
        
        for result in ocr_results:
            protected = self._protect_region(result)
            protected_results.append(protected)
        
        return protected_results
    
    def _protect_region(self, region: Dict) -> Dict:
        """Protect math in a single region"""
        text = region.get("text", "")
        
        if not text:
            return region
        
        math_segments = self._extract_math_segments(text)
        protected_text = self._apply_protection(text, math_segments)
        critical_tokens = self._find_critical_tokens(text)
        equation_info = self._detect_equations(text)
        formula_info = self._detect_formulas(text)
        
        return {
            **region,
            "original_text": text,
            "protected_text": protected_text,
            "math_segments": math_segments,
            "critical_tokens": critical_tokens,
            "has_math": len(math_segments) > 0 or equation_info["has_equation"],
            "has_critical_tokens": len(critical_tokens) > 0,
            "equation_info": equation_info,
            "formula_info": formula_info,
        }
    
    def _extract_math_segments(self, text: str) -> List[Dict]:
        """Extract all math segments from text"""
        segments = []
        
        # Extract exponents
        for pattern in self.exponent_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "exponent"
                })
        
        # Extract fractions
        for pattern in self.fraction_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "fraction"
                })
        
        # Extract decimals
        for pattern in self.decimal_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "decimal"
                })
        
        # Extract degrees
        for pattern in self.degree_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "degree"
                })
        
        # Extract operations
        for pattern in self.operation_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "operation"
                })
        
        # Extract equations
        for pattern in self.equation_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "equation"
                })
        
        # Extract universal formulas
        for pattern in self.universal_formula_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "universal_formula"
                })
        
        # Extract units
        for pattern in self.unit_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "unit"
                })
        
        # Extract chemical formulas
        for pattern in self.chemical_patterns:
            for match in re.finditer(pattern, text):
                segments.append({
                    "text": match.group(),
                    "start": match.start(),
                    "end": match.end(),
                    "type": "chemical_formula"
                })
        
        segments.sort(key=lambda x: x["start"])
        return self._merge_overlapping_segments(segments)
    
    def _merge_overlapping_segments(self, segments: List[Dict]) -> List[Dict]:
        """Merge overlapping math segments"""
        if not segments:
            return segments
        
        merged = [segments[0]]
        
        for segment in segments[1:]:
            if segment["start"] <= merged[-1]["end"]:
                merged[-1]["end"] = max(merged[-1]["end"], segment["end"])
                if merged[-1]["type"] != segment["type"]:
                    merged[-1]["type"] = "merged_math"
            else:
                merged.append(segment)
        
        return merged
    
    def _apply_protection(self, text: str, math_segments: List[Dict]) -> str:
        """Apply protection placeholders to math segments"""
        if not math_segments:
            return text
        
        protected = text
        
        for i, segment in enumerate(reversed(math_segments)):
            placeholder = f"<MATH_{i:03d}>"
            protected = protected[:segment["start"]] + placeholder + protected[segment["end"]:]
        
        return protected
    
    def _find_critical_tokens(self, text: str) -> List[Dict]:
        """Find all critical math tokens in text"""
        tokens = []
        
        # Find protected tokens
        for token in self.protected_tokens:
            start = 0
            while True:
                pos = text.find(token, start)
                if pos == -1:
                    break
                tokens.append({
                    "token": token,
                    "position": pos,
                    "type": "critical_symbol"
                })
                start = pos + 1
        
        # Find numbers
        for match in re.finditer(r'\d+\.?\d*(?:[eE][\+\-]?\d+)?', text):
            tokens.append({
                "token": match.group(),
                "position": match.start(),
                "type": "number"
            })
        
        # Find mixed numbers (e.g., 1½, 2¾)
        for match in re.finditer(r'\d+[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]', text):
            tokens.append({
                "token": match.group(),
                "position": match.start(),
                "type": "mixed_number"
            })
        
        tokens.sort(key=lambda x: x["position"])
        return tokens
    
    def _detect_equations(self, text: str) -> Dict:
        """Detect and classify equations"""
        equation_result = {
            "has_equation": False,
            "equations": [],
            "variables": [],
            "operators": [],
            "equation_type": None
        }
        
        for pattern in self.equation_patterns:
            for match in re.finditer(pattern, text):
                equation_result["has_equation"] = True
                eq_text = match.group()
                
                # Classify equation type
                eq_type = self._classify_equation(eq_text)
                
                equation_result["equations"].append({
                    "text": eq_text,
                    "start": match.start(),
                    "end": match.end(),
                    "type": eq_type
                })
        
        # Find variables
        variable_pattern = r'[a-zA-Zαβγδεζηθικλμνξοπρστυφχψω]'
        for match in re.finditer(variable_pattern, text):
            var = match.group()
            if var not in equation_result["variables"]:
                equation_result["variables"].append(var)
        
        # Find operators
        operator_pattern = r'[\+\-\×\÷\=≠≤≥<>±∓]'
        for match in re.finditer(operator_pattern, text):
            equation_result["operators"].append({
                "operator": match.group(),
                "position": match.start()
            })
        
        # Determine primary equation type
        if equation_result["equations"]:
            types = [eq["type"] for eq in equation_result["equations"]]
            from collections import Counter
            type_counts = Counter(types)
            equation_result["equation_type"] = type_counts.most_common(1)[0][0]
        
        return equation_result
    
    def _classify_equation(self, equation: str) -> str:
        """Classify the type of equation"""
        if '=' not in equation:
            return "expression"
        
        # Check for trigonometric first (before checking exponents)
        if any(x in equation.lower() for x in ['sin', 'cos', 'tan', 'sec', 'csc', 'cot']):
            return "trigonometric"
        
        # Check for logarithmic
        if any(x in equation.lower() for x in ['log', 'ln', 'lg']):
            return "logarithmic"
        
        # Check for radical
        if '√' in equation or '∛' in equation or '∜' in equation:
            return "radical"
        
        # Check for exponents/powers - use more specific patterns
        # Look for variable with exponent (x², x^2, x³, x^3, etc.)
        if re.search(r'[a-zA-Z]\s*[²³⁴⁵⁶⁷⁸⁹]\s*', equation):
            # Check if highest power is 2
            powers = re.findall(r'[a-zA-Z]\s*([²³⁴⁵⁶⁷⁸⁹])\s*', equation)
            power_map = {'²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9}
            max_power = max([power_map.get(p, 1) for p in powers])
            if max_power == 2:
                return "quadratic"
            else:
                return "polynomial"
        
        # Check for ^ notation (x^2, x^3, etc.)
        if re.search(r'[a-zA-Z]\s*\^\s*\d+', equation):
            powers = re.findall(r'[a-zA-Z]\s*\^\s*(\d+)', equation)
            max_power = max([int(p) for p in powers]) if powers else 1
            if max_power == 2:
                return "quadratic"
            else:
                return "polynomial"
        
        # Check for fractions
        if '/' in equation or '÷' in equation:
            return "rational"
        
        # Check if linear
        var_matches = re.findall(r'[a-zA-Z]', equation)
        if len(set(var_matches)) == 1:
            return "linear"
        
        return "linear"
    
    def _detect_formulas(self, text: str) -> Dict:
        """Detect universal formulas"""
        formula_result = {
            "has_formula": False,
            "formulas": [],
            "formula_type": None
        }
        
        for pattern in self.universal_formula_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                formula_result["has_formula"] = True
                formula_text = match.group()
                
                # Classify formula type
                f_type = self._classify_formula(formula_text)
                
                formula_result["formulas"].append({
                    "text": formula_text,
                    "start": match.start(),
                    "end": match.end(),
                    "type": f_type
                })
        
        if formula_result["formulas"]:
            from collections import Counter
            types = [f["type"] for f in formula_result["formulas"]]
            formula_result["formula_type"] = Counter(types).most_common(1)[0][0]
        
        return formula_result
    
    def _classify_formula(self, formula: str) -> str:
        """Classify the type of formula"""
        formula_lower = formula.lower()
        
        if any(x in formula_lower for x in ['area', 'a=', 'πr', 'l×w', 'b×h']):
            return "area"
        if any(x in formula_lower for x in ['perimeter', 'circumference', '2πr', 'p=']):
            return "perimeter"
        if any(x in formula_lower for x in ['volume', 'v=', 'πr²h', '4/3πr³']):
            return "volume"
        if any(x in formula_lower for x in ['pythagorean', 'a²+b²', 'a^2+b^2']):
            return "pythagorean"
        if any(x in formula_lower for x in ['sin', 'cos', 'tan']):
            return "trigonometric"
        if any(x in formula_lower for x in ['f=ma', 'e=mc', 'v=ir']):
            return "physics"
        if any(x in formula_lower for x in ['h₂o', 'co₂', 'h₂so₄', 'nacl']):
            return "chemical"
        
        return "general"
    
    def validate_math_expression(self, expression: str) -> Dict:
        """Validate a math expression for correctness"""
        validation = {
            "is_valid": True,
            "issues": [],
            "confidence": 1.0
        }
        
        if not expression:
            return validation
        
        # Check parentheses/brackets
        open_parens = expression.count('(')
        close_parens = expression.count(')')
        if open_parens != close_parens:
            validation["issues"].append(f"Mismatched parentheses: {open_parens} open, {close_parens} close")
            validation["confidence"] *= 0.7
        
        open_brackets = expression.count('[')
        close_brackets = expression.count(']')
        if open_brackets != close_brackets:
            validation["issues"].append(f"Mismatched brackets: {open_brackets} open, {close_brackets} close")
            validation["confidence"] *= 0.7
        
        open_braces = expression.count('{')
        close_braces = expression.count('}')
        if open_braces != close_braces:
            validation["issues"].append(f"Mismatched braces: {open_braces} open, {close_braces} close")
            validation["confidence"] *= 0.7
        
        # Check consecutive operators
        operators = ['+', '-', '×', '÷', '=', '<', '>', '≤', '≥']
        for i, char in enumerate(expression):
            if char in operators and i > 0 and expression[i-1] in operators:
                if char == '-' and expression[i-1] in ['(', '+', '=', '<', '>', '≤', '≥']:
                    continue  # Allow negative after these
                validation["issues"].append(f"Consecutive operators at position {i}: '{expression[i-1:i+1]}'")
                validation["confidence"] *= 0.9
        
        # Check equation balance
        if '=' in expression:
            parts = expression.split('=')
            if len(parts) == 2:
                left_has_digit = any(c.isdigit() for c in parts[0])
                right_has_digit = any(c.isdigit() for c in parts[1])
                if not (left_has_digit and right_has_digit):
                    validation["issues"].append("Equation may be incomplete")
                    validation["confidence"] *= 0.85
        
        # Check for division by zero
        if re.search(r'÷\s*0\b|/\s*0\b', expression):
            validation["issues"].append("Potential division by zero")
            validation["confidence"] *= 0.5
        
        if validation["issues"]:
            validation["is_valid"] = False
        
        return validation
    
    def restore_math_placeholders(self, text: str, math_segments: List[Dict]) -> str:
        """Restore math segments from placeholders"""
        restored = text
        
        for i, segment in enumerate(math_segments):
            placeholder = f"<MATH_{i:03d}>"
            restored = restored.replace(placeholder, segment["text"])
        
        return restored
    
    def format_equation_for_display(self, text: str) -> str:
        """Format equation for better display"""
        formatted = text
        
        # Add spaces around operators
        formatted = formatted.replace('×', ' × ')
        formatted = formatted.replace('÷', ' ÷ ')
        formatted = formatted.replace('=', ' = ')
        formatted = formatted.replace('+', ' + ')
        formatted = formatted.replace('-', ' - ')
        
        # Clean up multiple spaces
        formatted = re.sub(r'\s+', ' ', formatted)
        
        return formatted.strip()
    
    def get_math_summary(self, text: str) -> Dict:
        """Get comprehensive summary of math content in text"""
        region = {"text": text}
        protected = self._protect_region(region)
        
        return {
            "has_math": protected["has_math"],
            "has_critical_tokens": protected["has_critical_tokens"],
            "equation_info": protected["equation_info"],
            "formula_info": protected["formula_info"],
            "critical_tokens": protected["critical_tokens"],
            "math_segments": protected["math_segments"],
            "token_count": len(protected["critical_tokens"]),
            "segment_count": len(protected["math_segments"]),
        }
    
    def parse_fraction(self, text: str) -> Optional[float]:
        """Parse a fraction string to float value"""
        # Unicode fraction mapping
        unicode_fractions = {
            "½": 0.5, "⅓": 1/3, "⅔": 2/3, "¼": 0.25, "¾": 0.75,
            "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
            "⅙": 1/6, "⅚": 5/6, "⅐": 1/7, "⅛": 0.125,
            "⅜": 0.375, "⅝": 0.625, "⅞": 0.875, "⅑": 1/9, "⅒": 0.1
        }
        
        # Check for unicode fraction
        for frac, val in unicode_fractions.items():
            if frac in text:
                # Mixed number: 1½
                match = re.match(r'(\d+)' + frac, text)
                if match:
                    return int(match.group(1)) + val
                return val
        
        # Check for written fraction: 1/2
        match = re.match(r'(\d+)\s*/\s*(\d+)', text)
        if match:
            return int(match.group(1)) / int(match.group(2))
        
        # Check for mixed fraction: 1 1/2
        match = re.match(r'(\d+)\s+(\d+)\s*/\s*(\d+)', text)
        if match:
            return int(match.group(1)) + int(match.group(2)) / int(match.group(3))
        
        return None


# ==================== ENGLISH SPELL CHECKER ====================
class EnglishSpellChecker:
    """
    High-accuracy English spell checker with mathematical terminology
    """
    
    def __init__(self):
        # Common English words (top 1000+)
        self.common_words = {
            "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
            "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
            "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
            "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
            "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
            "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
            "people", "into", "year", "your", "good", "some", "could", "them", "see",
            "other", "than", "then", "now", "look", "only", "come", "its", "over",
            "think", "also", "back", "after", "use", "two", "how", "our", "work",
            "first", "well", "way", "even", "new", "want", "because", "any", "these",
            "give", "day", "most", "find", "here", "thing", "many", "well", "those",
            "tell", "one", "very", "her", "own", "may", "still", "long", "much",
            "should", "call", "world", "high", "place", "small", "again", "never",
            "between", "each", "right", "move", "live", "must", "great", "real",
            "old", "same", "under", "while", "last", "keep", "few", "turn", "night",
            "real", "life", "few", "north", "south", "east", "west",
            
            # Academic/scientific words
            "theory", "analysis", "function", "equation", "variable", "constant",
            "formula", "method", "system", "problem", "result", "solution",
            "process", "structure", "property", "value", "element", "number",
            "water", "earth", "force", "energy", "power", "work", "mass",
            "velocity", "acceleration", "pressure", "temperature", "volume",
            "distance", "speed", "light", "sound", "heat", "current",
            "temperature", "climate", "weather", "ocean", "river", "mountain",
            "continent", "country", "state", "city", "village", "population",
            "latitude", "longitude", "equator", "meridian", "hemisphere",
        }
        
        # Math terminology
        self.math_words = {
            "plus", "minus", "times", "divided", "equals", "equal",
            "addition", "subtraction", "multiplication", "division",
            "fraction", "decimal", "percent", "percentage",
            "numerator", "denominator", "quotient", "remainder",
            "sum", "difference", "product", "quotient",
            "square", "cube", "root", "power", "exponent",
            "variable", "coefficient", "term", "expression",
            "equation", "inequality", "solution", "solution",
            "function", "graph", "axis", "origin", "coordinate",
            "angle", "degree", "radian", "triangle", "quadrilateral",
            "circle", "radius", "diameter", "circumference", "area",
            "perimeter", "volume", "surface", "face", "edge", "vertex",
            "parallel", "perpendicular", "intersect", "tangent",
            "symmetry", "rotation", "reflection", "translation",
            "probability", "statistics", "mean", "median", "mode",
            "range", "variance", "standard", "deviation",
            "integer", "natural", "rational", "irrational", "real",
            "complex", "imaginary", "prime", "composite",
            "factor", "multiple", "divisor", "divisible",
            "geometry", "algebra", "calculus", "trigonometry",
            "theorem", "axiom", "postulate", "corollary", "lemma",
            "proof", "conjecture", "hypothesis", "conclusion",
            "set", "subset", "union", "intersection", "complement",
            "sequence", "series", "convergence", "divergence",
            "limit", "derivative", "integral", "differential",
            "matrix", "vector", "scalar", "tensor",
        }
        
        # Science terminology
        self.science_words = {
            "atom", "molecule", "element", "compound", "reaction",
            "acid", "base", "salt", "solution", "mixture",
            "protein", "carbohydrate", "lipid", "nucleic",
            "cell", "tissue", "organ", "system", "organism",
            "gene", "chromosome", "dna", "rna", "mutation",
            "evolution", "adaptation", "species", "ecosystem",
            "photosynthesis", "respiration", "digestion",
            "force", "motion", "energy", "work", "power",
            "velocity", "acceleration", "momentum", "inertia",
            "gravity", "friction", "tension", "pressure",
            "wave", "frequency", "wavelength", "amplitude",
            "electric", "magnetic", "electromagnetic",
            "nucleus", "proton", "neutron", "electron",
            "orbital", "bond", "valence", "ionization",
        }
        
        # Geography terminology
        self.geography_words = {
            "latitude", "longitude", "equator", "meridian",
            "hemisphere", "tropic", "arctic", "antarctic",
            "continent", "ocean", "sea", "gulf", "bay",
            "peninsula", "island", "archipelago", "strait",
            "mountain", "plateau", "plain", "valley", "canyon",
            "river", "lake", "glacier", "desert", "forest",
            "climate", "weather", "temperature", "precipitation",
            "erosion", "weathering", "sediment", "volcanic",
            "earthquake", "tsunami", "cyclone", "monsoon",
            "geography", "geology", "topography", "cartography",
            "hemisphere", "tropic", "arctic", "antarctic",
        }
        
        self.all_words = self.common_words | self.math_words | self.science_words | self.geography_words
    
    def check_word(self, word: str) -> Tuple[bool, List[str]]:
        """
        Check if a word is spelled correctly
        
        Returns:
            Tuple of (is_correct, suggestions)
        """
        word_lower = word.lower()
        
        # Check common words
        if word_lower in self.all_words:
            return True, []
        
        # Check with basic rules
        suggestions = self._generate_suggestions(word_lower)
        
        return False, suggestions
    
    def _generate_suggestions(self, word: str) -> List[str]:
        """Generate spelling suggestions"""
        suggestions = []
        
        # Simple edit distance suggestions
        alphabet = 'abcdefghijklmnopqrstuvwxyz'
        
        # Deletions
        for i in range(len(word)):
            candidate = word[:i] + word[i+1:]
            if candidate in self.all_words:
                suggestions.append(candidate)
        
        # Transpositions
        for i in range(len(word) - 1):
            candidate = word[:i] + word[i+1] + word[i] + word[i+2:]
            if candidate in self.all_words:
                suggestions.append(candidate)
        
        # Insertions
        for i in range(len(word) + 1):
            for c in alphabet:
                candidate = word[:i] + c + word[i:]
                if candidate in self.all_words:
                    suggestions.append(candidate)
        
        # Replacements
        for i in range(len(word)):
            for c in alphabet:
                candidate = word[:i] + c + word[i+1:]
                if candidate in self.all_words:
                    suggestions.append(candidate)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_suggestions = []
        for s in suggestions:
            if s not in seen:
                seen.add(s)
                unique_suggestions.append(s)
        
        return unique_suggestions[:5]  # Return top 5 suggestions
    
    def correct_text(self, text: str) -> Tuple[str, List[Dict]]:
        """
        Correct English text
        
        Returns:
            Tuple of (corrected_text, list_of_corrections)
        """
        words = text.split()
        corrected_words = []
        corrections = []
        
        for i, word in enumerate(words):
            # Skip non-English words (Hindi, etc.)
            if any('\u0900' <= c <= '\u097F' for c in word):
                corrected_words.append(word)
                continue
            
            # Skip numbers and symbols
            if re.match(r'^[\d\.\,\;\:\!\?\-\+\×\÷\=\<\>\≤\≥\½\¼\¾°%₹$]+$', word):
                corrected_words.append(word)
                continue
            
            is_correct, suggestions = self.check_word(word)
            
            if is_correct:
                corrected_words.append(word)
            elif suggestions:
                best_suggestion = suggestions[0]
                corrected_words.append(best_suggestion)
                corrections.append({
                    "original": word,
                    "corrected": best_suggestion,
                    "position": i,
                    "suggestions": suggestions
                })
            else:
                # Keep original if no suggestions
                corrected_words.append(word)
        
        return " ".join(corrected_words), corrections


# ==================== HINDI SPELL CHECKER ====================
class HindiSpellChecker:
    """
    High-accuracy Hindi spell checker with common word dictionary
    """
    
    def __init__(self):
        # Common Hindi words
        self.common_words = {
            # Pronouns
            "मैं", "तुम", "आप", "वह", "यह", "हम", "वे", "ये", "कोई", "सब",
            
            # Postpositions
            "में", "पर", "से", "को", "के", "की", "का", "ने", "लिए", "तक",
            "के लिए", "में", "पर", "से", "तक", "के साथ", "के बाद",
            
            # Conjunctions
            "और", "या", "परंतु", "लेकिन", "क्योंकि", "इसलिए", "तो", "फिर",
            
            # Verbs (common forms)
            "है", "हैं", "था", "थे", "थी", "हो", "गया", "गई", "गए",
            "कर", "करना", "किया", "करता", "करती", "करते",
            "होना", "होता", "होती", "होते", "होगा", "होंगे",
            "जाना", "जाता", "जाती", "जाते", "जाएगा",
            "आना", "आता", "आती", "आते", "आएगा",
            "देना", "देता", "देती", "देगा",
            "लेना", "लेता", "लेती", "लेगा",
            "कहना", "कहता", "कहती", "कहेगा",
            
            # Adjectives
            "अच्छा", "बुरा", "बड़ा", "छोटा", "नया", "पुराना",
            "लंबा", "छोटा", "चौड़ा", "तंग",
            "गर्म", "ठंडा", "सूखा", "गीला",
            "सफेद", "काला", "लाल", "नीला", "हरा", "पीला",
            
            # Numbers
            "एक", "दो", "तीन", "चार", "पांच", "छह", "सात", "आठ", "नौ", "दस",
            
            # Question words
            "क्या", "कौन", "कहाँ", "कब", "क्यों", "कैसे", "कितना",
            
            # Negation
            "नहीं", "ना", "मत",
            
            # Common nouns (geography)
            "पृथ्वी", "सूर्य", "चंद्रमा", "तारा", "ग्रह",
            "महासागर", "सागर", "नदी", "पहाड़", "पर्वत",
            "राज्य", "देश", "शहर", "गांव", "जिला",
            "अक्षांश", "देशांतर", "मध्याह्न", "रेखा",
            "उत्तर", "दक्षिण", "पूर्व", "पश्चिम", "मध्य",
        }
        
        # Common OCR error corrections
        self.corrections = {
            "समानंतर": "समानांतर",
            "प्रधान मध्याहन": "प्रधान मध्याह्न",
            "स्थिते": "स्थित",
        }
    
    def check_word(self, word: str) -> bool:
        """Check if Hindi word is in dictionary"""
        return word in self.common_words
    
    def correct_word(self, word: str) -> str:
        """Correct a Hindi word"""
        if word in self.corrections:
            return self.corrections[word]
        return word
    
    def correct_text(self, text: str) -> Tuple[str, List[Dict]]:
        """Correct Hindi text"""
        words = text.split()
        corrected_words = []
        corrections = []
        
        for i, word in enumerate(words):
            if not any('\u0900' <= c <= '\u097F' for c in word):
                corrected_words.append(word)
                continue
            
            corrected = self.correct_word(word)
            
            if corrected != word:
                corrections.append({
                    "original": word,
                    "corrected": corrected,
                    "position": i
                })
            
            corrected_words.append(corrected)
        
        return " ".join(corrected_words), corrections


def demo():
    """Demo function to test comprehensive math protector"""
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    
    print("=" * 70)
    print("Comprehensive Math Protector & Spell Checkers Demo")
    print("=" * 70)
    
    protector = MathProtector()
    eng_checker = EnglishSpellChecker()
    hindi_checker = HindiSpellChecker()
    
    # Test cases
    test_cases = [
        # Degrees
        "66½° उ.अ. पर स्थित है",
        "23½° द.अ. और 82½° पूर्वी देशांतर",
        "360° में विभाजित",
        
        # Fractions
        "1/2 + 3/4 = 5/4",
        "1½ + 2¾ = 4½",
        "π ≈ 22/7",
        
        # Exponents
        "x² + y² = r²",
        "2³ = 8",
        "a² + b² = c²",
        "10⁻³ = 0.001",
        
        # Equations
        "2x + 3y = 10",
        "x² - 5x + 6 = 0",
        "F = ma",
        "E = mc²",
        
        # Operations
        "15 + 25 = 40",
        "100 - 37 = 63",
        "12 × 8 = 96",
        "144 ÷ 12 = 12",
        
        # Decimals
        "3.14159 × 2 = 6.28318",
        "π ≈ 3.14159",
        
        # Mixed content
        "भारत का क्षेत्रफल 32,87,263 km² है",
        "दिल्ली 28°37'N 77°13'E पर स्थित है",
    ]
    
    print("\n1. MATH PROTECTION TESTS:")
    print("-" * 50)
    
    for text in test_cases:
        summary = protector.get_math_summary(text)
        print(f"\nText: {text}")
        print(f"  Has Math: {summary['has_math']}")
        print(f"  Math Segments: {summary['segment_count']}")
        print(f"  Critical Tokens: {summary['token_count']}")
        if summary['equation_info']['has_equation']:
            print(f"  Equation Type: {summary['equation_info']['equation_type']}")
        if summary['formula_info']['has_formula']:
            print(f"  Formula Type: {summary['formula_info']['formula_type']}")
    
    print("\n2. ENGLISH SPELL CHECK TESTS:")
    print("-" * 50)
    
    eng_tests = [
        "The equater divides the earth into hemispheres",
        "Latitude mesures the north-south position",
        "A triangel has three sides and three angles",
        "The area of a circel is pi r squared",
    ]
    
    for text in eng_tests:
        corrected, corrections = eng_checker.correct_text(text)
        print(f"\nOriginal: {text}")
        print(f"Corrected: {corrected}")
        if corrections:
            for c in corrections:
                print(f"  Changed: {c['original']} -> {c['corrected']}")
    
    print("\n3. HINDI SPELL CHECK TESTS:")
    print("-" * 50)
    
    hindi_tests = [
        "समानंतर रेखाएँ कभी नहीं मिलती",
        "प्रधान मध्याहन रेखा भारत से गुजरती है",
        "पृथ्वी अपनी अक्ष पर घूमती है",
    ]
    
    for text in hindi_tests:
        corrected, corrections = hindi_checker.correct_text(text)
        print(f"\nOriginal: {text}")
        print(f"Corrected: {corrected}")
        if corrections:
            for c in corrections:
                print(f"  Changed: {c['original']} -> {c['corrected']}")
    
    print("\n4. FRACTION PARSING:")
    print("-" * 50)
    
    fraction_tests = ["½", "¾", "1/3", "2/5", "1½", "2¾", "3 1/4"]
    
    for text in fraction_tests:
        value = protector.parse_fraction(text)
        print(f"  {text} = {value}")


if __name__ == "__main__":
    demo()
