"""
Comprehensive English Dictionary for OCR Spell Checking
Contains: common words, math terminology, science terms, geography terms
"""
from typing import Set, Dict, List


class EnglishDictionary:
    """
    High-accuracy English dictionary for OCR spell checking
    """
    
    def __init__(self):
        self.common_words = self._load_common_words()
        self.math_words = self._load_math_words()
        self.science_words = self._load_science_words()
        self.geography_words = self._load_geography_words()
        self.physics_words = self._load_physics_words()
        self.chemistry_words = self._load_chemistry_words()
        self.biology_words = self._load_biology_words()
        
        # Combine all words
        self.all_words = (
            self.common_words | 
            self.math_words | 
            self.science_words | 
            self.geography_words |
            self.physics_words |
            self.chemistry_words |
            self.biology_words
        )
        
        # Common OCR misspellings and corrections
        self.ocr_corrections = {
            "equater": "equator",
            "hemispere": "hemisphere",
            "hemispher": "hemisphere",
            "latitue": "latitude",
            "longitue": "longitude",
            "triangel": "triangle",
            "circel": "circle",
            "paralel": "parallel",
            "perpendiculer": "perpendicular",
            "symetry": "symmetry",
            "asymetry": "asymmetry",
            "diagnol": "diagonal",
            "perimiter": "perimeter",
            "diamiter": "diameter",
            "compleks": "complex",
            "imaginery": "imaginary",
            "polynominal": "polynomial",
            "quadradic": "quadratic",
            "trigonomerty": "trigonometry",
            "algreba": "algebra",
            "calclus": "calculus",
            "geometery": "geometry",
            "algebriac": "algebraic",
            "trig": "trigonometric",
            "multipication": "multiplication",
            "additon": "addition",
            "substract": "subtract",
            "divition": "division",
            "numerator": "numerator",
            "denominator": "denominator",
            "fracion": "fraction",
            "desimal": "decimal",
            "percenage": "percentage",
            "decimel": "decimal",
            "expontial": "exponential",
            "logrithm": "logarithm",
            "naturall": "natural",
            "irrashional": "irrational",
            "rationl": "rational",
            "composie": "composite",
            "priem": "prime",
            "divisble": "divisible",
            "mulitple": "multiple",
            "factore": "factor",
            "sequnce": "sequence",
            "serise": "series",
            "convergense": "convergence",
            "differntial": "differential",
            "derivitive": "derivative",
            "indefinate": "indefinite",
            "definate": "definite",
            "intege": "integer",
            "numbre": "number",
            "varible": "variable",
            "constant": "constant",
            "coefficent": "coefficient",
            "equasion": "equation",
            "expreesion": "expression",
            "term": "term",
            "soluton": "solution",
            "probablity": "probability",
            "statitics": "statistics",
            "mesasure": "measure",
            "angl": "angle",
            "degre": "degree",
            "radien": "radian",
            "symmetrycal": "symmetrical",
            "concave": "concave",
            "convex": "convex",
            "polygon": "polygon",
            "polyhedron": "polyhedron",
            "dodecahedron": "dodecahedron",
            "icosahedron": "icosahedron",
            "tetrahedron": "tetrahedron",
            "octahedron": "octahedron",
            "pyrimid": "pyramid",
            "prisim": "prism",
            "cyliner": "cylinder",
            "cone": "cone",
            "spher": "sphere",
            "ellipise": "ellipse",
            "parabola": "parabola",
            "hyperbola": "hyperbola",
            "symptote": "asymptote",
            "vertex": "vertex",
            "verticies": "vertices",
            "radi": "radii",
            "diamiter": "diameter",
            "olum": "volume",
            "suerface": "surface",
            "mas": "mass",
            "weigth": "weight",
            "densiy": "density",
            "velocit": "velocity",
            "accelertion": "acceleration",
            "froce": "force",
            "enery": "energy",
            "powr": "power",
            "currnet": "current",
            "resistnce": "resistance",
            "voltge": "voltage",
            "circut": "circuit",
            "magnet": "magnetic",
            "elecric": "electric",
            "therm": "thermal",
            "gravty": "gravity",
            "fictin": "friction",
            "pressre": "pressure",
            "temperture": "temperature",
            "celesial": "celestial",
            "planet": "planet",
            "stelar": "stellar",
            "galax": "galaxy",
            "nebula": "nebula",
            "comt": "comet",
            "asterod": "asteroid",
            "metor": "meteor",
            "satelite": "satellite",
            "orbit": "orbit",
            "rotaion": "rotation",
            "revolton": "revolution",
            "axis": "axis",
            "equitorial": "equatorial",
            "tropicl": "tropical",
            "arctic": "arctic",
            "antarctc": "antarctic",
            "hemisphre": "hemisphere",
            "contient": "continent",
            "ocen": "ocean",
            "primery": "primary",
            "secondry": "secondary",
            "tertary": "tertiary",
            "cimatic": "climatic",
            "vegetaion": "vegetation",
            "ecosysem": "ecosystem",
            "biodiversty": "biodiversity",
            "conservton": "conservation",
            "polluton": "pollution",
            "recycle": "recycle",
            "renwable": "renewable",
            "environmnt": "environment",
            "sustanable": "sustainable",
            "organism": "organism",
            "speces": "species",
            "evoluton": "evolution",
            "adaptton": "adaptation",
            "mutaton": "mutation",
            "genetc": "genetic",
            "chromosme": "chromosome",
            "protin": "protein",
            "carbohydate": "carbohydrate",
            "lipd": "lipid",
            "nuceic": "nucleic",
            "photosynhesis": "photosynthesis",
            "respration": "respiration",
            "dgestion": "digestion",
            "circultory": "circulatory",
            "nervos": "nervous",
            "skeletal": "skeletal",
            "muscuar": "muscular",
            "excretry": "excretory",
            "reproductve": "reproductive",
            "immne": "immune",
            "endcrine": "endocrine",
        }
    
    def _load_common_words(self) -> Set[str]:
        """Load common English words"""
        return {
            # Articles and determiners
            "a", "an", "the", "this", "that", "these", "those", "my", "your",
            "his", "her", "its", "our", "their", "some", "any", "no", "all",
            "every", "each", "both", "few", "many", "much", "several", "most",
            
            # Pronouns
            "i", "me", "mine", "we", "us", "ours", "you", "yours",
            "he", "him", "his", "she", "her", "hers", "it", "its",
            "they", "them", "theirs", "who", "whom", "whose", "which", "what",
            "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
            
            # Prepositions
            "in", "on", "at", "to", "for", "with", "by", "from", "of", "about",
            "into", "through", "during", "before", "after", "above", "below",
            "between", "under", "near", "behind", "beside", "around", "against",
            "across", "along", "among", "beyond", "inside", "outside", "within",
            
            # Conjunctions
            "and", "but", "or", "nor", "for", "yet", "so", "both", "either",
            "neither", "not", "only", "whether", "although", "because", "since",
            "while", "when", "where", "how", "if", "unless", "until", "before",
            "after", "than", "that", "as", "however", "therefore", "moreover",
            "furthermore", "nevertheless", "meanwhile", "otherwise", "thus",
            
            # Verbs (common forms)
            "be", "am", "is", "are", "was", "were", "been", "being",
            "have", "has", "had", "having", "do", "does", "did", "doing",
            "say", "says", "said", "saying", "go", "goes", "went", "gone", "going",
            "get", "gets", "got", "getting", "make", "makes", "made", "making",
            "know", "knows", "knew", "known", "knowing",
            "think", "thinks", "thought", "thinking",
            "take", "takes", "took", "taken", "taking",
            "see", "sees", "saw", "seen", "seeing",
            "come", "comes", "came", "coming",
            "want", "wants", "wanted", "wanting",
            "use", "uses", "used", "using",
            "find", "finds", "found", "finding",
            "give", "gives", "gave", "given", "giving",
            "tell", "tells", "told", "telling",
            "work", "works", "worked", "working",
            "call", "calls", "called", "calling",
            "try", "tries", "tried", "trying",
            "ask", "asks", "asked", "asking",
            "need", "needs", "needed", "needing",
            "feel", "feels", "felt", "feeling",
            "become", "becomes", "became", "becoming",
            "leave", "leaves", "left", "leaving",
            "put", "puts", "putting",
            "mean", "means", "meant", "meaning",
            "keep", "keeps", "kept", "keeping",
            "let", "lets", "letting",
            "begin", "begins", "began", "begun", "beginning",
            "show", "shows", "showed", "shown", "showing",
            "hear", "hears", "heard", "hearing",
            "play", "plays", "played", "playing",
            "run", "runs", "ran", "running",
            "move", "moves", "moved", "moving",
            "live", "lives", "lived", "living",
            "believe", "believes", "believed", "believing",
            "hold", "holds", "held", "holding",
            "bring", "brings", "brought", "bringing",
            "happen", "happens", "happened", "happening",
            "write", "writes", "wrote", "written", "writing",
            "provide", "provides", "provided", "providing",
            "sit", "sits", "sat", "sitting",
            "stand", "stands", "stood", "standing",
            "lose", "loses", "lost", "losing",
            "pay", "pays", "paid", "paying",
            "meet", "meets", "met", "meeting",
            "include", "includes", "included", "including",
            "continue", "continues", "continued", "continuing",
            "set", "sets", "setting",
            "learn", "learns", "learned", "learning",
            "change", "changes", "changed", "changing",
            "lead", "leads", "led", "leading",
            "understand", "understands", "understood", "understanding",
            "watch", "watches", "watched", "watching",
            "follow", "follows", "followed", "following",
            "stop", "stops", "stopped", "stopping",
            "create", "creates", "created", "creating",
            "speak", "speaks", "spoke", "spoken", "speaking",
            "read", "reads", "reading",
            "allow", "allows", "allowed", "allowing",
            "add", "adds", "added", "adding",
            "spend", "spends", "spent", "spending",
            "grow", "grows", "grew", "grown", "growing",
            "open", "opens", "opened", "opening",
            "walk", "walks", "walked", "walking",
            "win", "wins", "won", "winning",
            "offer", "offers", "offered", "offering",
            "remember", "remembers", "remembered", "remembering",
            "love", "loves", "loved", "loving",
            "consider", "considers", "considered", "considering",
            "appear", "appears", "appeared", "appearing",
            "buy", "buys", "bought", "buying",
            "wait", "waits", "waited", "waiting",
            "serve", "serves", "served", "serving",
            "die", "dies", "died", "dying",
            "send", "sends", "sent", "sending",
            "expect", "expects", "expected", "expecting",
            "build", "builds", "built", "building",
            "stay", "stays", "stayed", "staying",
            "fall", "falls", "fell", "fallen", "falling",
            "cut", "cuts", "cutting",
            "reach", "reaches", "reached", "reaching",
            "kill", "kills", "killed", "killing",
            "remain", "remains", "remained", "remaining",
            "suggest", "suggests", "suggested", "suggesting",
            "raise", "raises", "raised", "raising",
            "pass", "passes", "passed", "passing",
            "sell", "sells", "sold", "selling",
            "require", "requires", "required", "requiring",
            "report", "reports", "reported", "reporting",
            "decide", "decides", "decided", "deciding",
            "pull", "pulls", "pulled", "pulling",
            
            # Adjectives
            "good", "new", "first", "last", "long", "great", "little", "own",
            "other", "old", "right", "big", "high", "different", "small", "large",
            "next", "early", "young", "important", "few", "public", "bad", "same",
            "able", "free", "sure", "real", "full", "special", "easy", "clear",
            "close", "best", "recent", "certain", "personal", "open", "strong",
            "possible", "whole", "short", "low", "local", "single", "hard", "simple",
            "fast", "slow", "quick", "rapid", "sudden", "sharp", "wide", "narrow",
            "deep", "shallow", "thick", "thin", "heavy", "light", "dark", "bright",
            "hot", "cold", "warm", "cool", "dry", "wet", "smooth", "rough",
            "soft", "hard", "loud", "quiet", "silent", "noisy", "sweet", "bitter",
            "sour", "salty", "fresh", "stale", "clean", "dirty", "pure", "mixed",
            "true", "false", "right", "wrong", "best", "worst", "better", "worse",
            "happy", "sad", "angry", "calm", "brave", "afraid", "kind", "cruel",
            "rich", "poor", "healthy", "sick", "strong", "weak", "safe", "dangerous",
            "modern", "ancient", "current", "previous", "final", "main", "major",
            "basic", "complex", "simple", "natural", "artificial", "normal", "special",
            "general", "specific", "similar", "different", "separate", "common",
            "familiar", "strange", "foreign", "native", "regular", "normal",
            "average", "total", "complete", "partial", "entire", "whole",
            "perfect", "excellent", "good", "fair", "poor", "bad", "terrible",
            "beautiful", "ugly", "pretty", "handsome", "elegant", "plain",
            "interesting", "boring", "exciting", "dull", "funny", "serious",
            "important", "trivial", "necessary", "unnecessary", "possible", "impossible",
            "probable", "certain", "sure", "uncertain", "doubtful", "obvious",
            "visible", "invisible", "audible", "inaudible", "tangible", "intangible",
            "solid", "liquid", "gaseous", "plasma", "metallic", "organic", "inorganic",
            
            # Adverbs
            "very", "really", "actually", "probably", "certainly", "definitely",
            "absolutely", "completely", "totally", "entirely", "quite", "rather",
            "somewhat", "slightly", "barely", "hardly", "nearly", "almost",
            "always", "never", "sometimes", "often", "usually", "rarely", "seldom",
            "now", "then", "today", "tomorrow", "yesterday", "soon", "later",
            "here", "there", "everywhere", "nowhere", "somewhere", "anywhere",
            "quickly", "slowly", "rapidly", "gradually", "suddenly", "immediately",
            "carefully", "carelessly", "easily", "difficultly", "hard", "well",
            "badly", "good", "fast", "slow", "early", "late", "high", "low",
            "far", "near", "close", "wide", "deep", "straight", "directly",
            "only", "just", "also", "too", "either", "neither", "both",
            "especially", "particularly", "mainly", "mostly", "largely", "chiefly",
            "simply", "merely", "hardly", "scarcely", "barely", "exactly",
            "precisely", "approximately", "roughly", "about", "around", "over",
            "under", "above", "below", "up", "down", "in", "out", "off",
            "on", "away", "back", "forward", "backward", "ahead", "behind",
            
            # Numbers and ordinals
            "zero", "one", "two", "three", "four", "five", "six", "seven",
            "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
            "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
            "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
            "hundred", "thousand", "million", "billion", "trillion",
            "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
            "eighth", "ninth", "tenth", "eleventh", "twelfth",
            
            # Time-related
            "second", "minute", "hour", "day", "week", "month", "year",
            "decade", "century", "millennium", "morning", "afternoon", "evening",
            "night", "today", "tomorrow", "yesterday", "now", "then", "soon",
            "always", "never", "sometimes", "often", "usually", "rarely",
            
            # Colors
            "red", "blue", "green", "yellow", "orange", "purple", "pink",
            "brown", "black", "white", "gray", "grey", "silver", "gold",
            
            # Shapes
            "circle", "square", "rectangle", "triangle", "polygon", "hexagon",
            "octagon", "pentagon", "sphere", "cube", "cylinder", "cone", "pyramid",
            
            # Common nouns
            "time", "year", "people", "way", "day", "man", "woman", "child",
            "world", "life", "hand", "part", "place", "case", "week", "company",
            "system", "program", "question", "work", "government", "number",
            "night", "point", "home", "water", "room", "mother", "area", "money",
            "story", "fact", "month", "lot", "right", "study", "book", "eye",
            "job", "word", "business", "issue", "side", "kind", "head", "house",
            "service", "friend", "father", "power", "hour", "game", "line",
            "end", "member", "law", "car", "city", "community", "name", "president",
            "team", "minute", "idea", "body", "information", "back", "parent",
            "face", "others", "level", "office", "door", "health", "person",
            "art", "war", "history", "party", "result", "change", "morning",
            "reason", "research", "girl", "guy", "moment", "air", "teacher",
            "force", "education", "dog", "cat", "table", "chair", "desk",
            "computer", "phone", "paper", "pen", "book", "school", "student",
        }
    
    def _load_math_words(self) -> Set[str]:
        """Load mathematics terminology"""
        return {
            # Basic operations
            "addition", "subtraction", "multiplication", "division",
            "plus", "minus", "times", "divided", "equals", "equal",
            "sum", "difference", "product", "quotient", "remainder",
            
            # Numbers and types
            "number", "integer", "natural", "whole", "rational", "irrational",
            "real", "complex", "imaginary", "prime", "composite", "even", "odd",
            "positive", "negative", "zero", "one", "digit", "numeral",
            
            # Fractions and decimals
            "fraction", "numerator", "denominator", "decimal", "point",
            "percent", "percentage", "ratio", "proportion", "mixed",
            "improper", "proper", "simplified", "reduced",
            
            # Algebra
            "algebra", "variable", "constant", "coefficient", "term",
            "expression", "equation", "inequality", "formula", "function",
            "linear", "quadratic", "cubic", "polynomial", "monomial",
            "binomial", "trinomial", "factor", "factorize", "expand",
            "simplify", "solve", "solution", "root", "solution",
            "graph", "plot", "coordinate", "axis", "origin", "slope",
            "intercept", "parabola", "hyperbola", "ellipse",
            
            # Geometry
            "geometry", "point", "line", "ray", "segment", "plane",
            "angle", "degree", "radian", "acute", "obtuse", "right",
            "straight", "reflex", "complementary", "supplementary",
            "triangle", "quadrilateral", "pentagon", "hexagon", "heptagon",
            "octagon", "nonagon", "decagon", "polygon", "polyhedron",
            "circle", "radius", "diameter", "circumference", "arc", "chord",
            "tangent", "secant", "sector", "segment",
            "rectangle", "square", "parallelogram", "rhombus", "trapezoid",
            "trapezium", "kite",
            "cube", "cuboid", "sphere", "hemisphere", "cylinder", "cone",
            "pyramid", "prism", "tetrahedron", "octahedron", "dodecahedron",
            "icosahedron",
            "area", "perimeter", "volume", "surface", "face", "edge", "vertex",
            "vertices", "diagonal", "symmetry", "congruent", "similar",
            "parallel", "perpendicular", "intersect", "bisect",
            "translation", "rotation", "reflection", "transformation",
            
            # Trigonometry
            "trigonometry", "sine", "cosine", "tangent", "cotangent",
            "secant", "cosecant", "angle", "hypotenuse", "opposite",
            "adjacent", "pythagorean", "identity",
            "sine", "cosine", "tangent", "sin", "cos", "tan",
            
            # Calculus
            "calculus", "limit", "derivative", "integral", "differential",
            "differentiation", "integration", "antiderivative",
            "continuous", "differentiable", "convergent", "divergent",
            "series", "sequence", "sum", "infinite",
            "maximum", "minimum", "extrema", "critical", "inflection",
            "concave", "convex", "tangent", "normal",
            
            # Statistics
            "statistics", "probability", "mean", "median", "mode",
            "range", "variance", "standard", "deviation", "normal",
            "distribution", "sample", "population", "data", "graph",
            "chart", "histogram", "frequency", "relative", "cumulative",
            
            # Set theory
            "set", "subset", "superset", "union", "intersection",
            "complement", "element", "member", "empty", "universal",
            "cardinality", "finite", "infinite",
            
            # Logic
            "logic", "statement", "proposition", "conjunction", "disjunction",
            "negation", "implication", "biconditional", "truth", "false",
            "valid", "invalid", "tautology", "contradiction",
            
            # Sequences and series
            "arithmetic", "geometric", "harmonic", "sequence", "series",
            "term", "common", "difference", "ratio", "convergence",
            "divergence", "sum", "partial",
            
            # Matrices and vectors
            "matrix", "matrices", "vector", "scalar", "tensor",
            "determinant", "inverse", "transpose", "identity",
            "linear", "algebra", "operation",
            
            # Mathematical terms
            "theorem", "axiom", "postulate", "corollary", "lemma",
            "proof", "conjecture", "hypothesis", "definition",
            "property", "principle", "rule", "formula", "equation",
            "expression", "term", "factor", "exponent", "base",
            "power", "square", "cube", "root", "radical",
            "absolute", "value", "modulus", "argument",
            "real", "imaginary", "complex", "conjugate",
        }
    
    def _load_science_words(self) -> Set[str]:
        """Load general science terminology"""
        return {
            # General science
            "science", "scientific", "experiment", "hypothesis", "theory",
            "observation", "measurement", "analysis", "conclusion", "result",
            "data", "evidence", "method", "process", "research", "study",
            "investigation", "discovery", "invention", "technology",
            
            # Physical science
            "matter", "energy", "force", "motion", "mass", "weight",
            "density", "volume", "pressure", "temperature", "heat",
            "light", "sound", "electricity", "magnetism", "radiation",
            "wave", "frequency", "wavelength", "amplitude", "velocity",
            "acceleration", "momentum", "inertia", "friction", "gravity",
            
            # Chemical science
            "atom", "molecule", "element", "compound", "mixture",
            "solution", "solute", "solvent", "concentration",
            "chemical", "reaction", "bond", "ion", "ionization",
            "acid", "base", "salt", "pH", "alkaline", "neutral",
            "organic", "inorganic", "polymer", "monomer",
            
            # Life science
            "cell", "tissue", "organ", "system", "organism",
            "protein", "carbohydrate", "lipid", "nucleic", "acid",
            "DNA", "RNA", "gene", "chromosome", "mutation",
            "evolution", "adaptation", "species", "ecosystem",
            "photosynthesis", "respiration", "digestion",
            "metabolism", "enzyme", "membrane", "nucleus",
            
            # Earth science
            "geology", "geography", "meteorology", "oceanography",
            "astronomy", "planet", "star", "galaxy", "universe",
            "earth", "moon", "sun", "solar", "system",
            "atmosphere", "hydrosphere", "biosphere", "lithosphere",
            "tectonic", "volcanic", "seismic", "erosion", "weathering",
            "sediment", "fossil", "mineral", "rock", "soil",
        }
    
    def _load_geography_words(self) -> Set[str]:
        """Load geography terminology"""
        return {
            # Coordinates and measurement
            "latitude", "longitude", "equator", "meridian", "prime",
            "hemisphere", "tropic", "arctic", "antarctic", "circle",
            "angle", "degree", "minute", "second", "coordinate",
            
            # Landforms
            "continent", "ocean", "sea", "gulf", "bay", "strait",
            "peninsula", "island", "archipelago", "atoll",
            "mountain", "hill", "plateau", "plain", "valley",
            "canyon", "gorge", "cliff", "coast", "shore", "beach",
            "desert", "forest", "jungle", "grassland", "savanna",
            "tundra", "wetland", "marsh", "swamp", "bog",
            
            # Water bodies
            "river", "lake", "pond", "stream", "creek", "brook",
            "waterfall", "glacier", "iceberg", "spring", "well",
            "reservoir", "canal", "delta", "estuary", "fjord",
            
            # Climate
            "climate", "weather", "temperature", "precipitation",
            "humidity", "wind", "monsoon", "cyclone", "hurricane",
            "typhoon", "tornado", "thunderstorm", "blizzard",
            "drought", "flood", "season", "winter", "summer",
            "spring", "autumn", "fall",
            
            # Human geography
            "population", "demography", "urban", "rural", "suburban",
            "settlement", "city", "town", "village", "metropolis",
            "capital", "border", "boundary", "territory", "region",
            "country", "nation", "state", "province", "district",
            
            # Resources
            "resource", "mineral", "fossil", "fuel", "petroleum",
            "coal", "natural", "gas", "renewable", "nonrenewable",
            "conservation", "pollution", "deforestation", "erosion",
            
            # Maps and tools
            "map", "atlas", "globe", "cartography", "survey",
            "satellite", "aerial", "topographic", "scale", "legend",
            "compass", "direction", "north", "south", "east", "west",
            
            # Processes
            "erosion", "weathering", "deposition", "sedimentation",
            "tectonic", "volcanic", "earthquake", "tsunami",
            "subduction", "uplift", "folding", "faulting",
            "orogeny", "denudation", "gradation",
        }
    
    def _load_physics_words(self) -> Set[str]:
        """Load physics terminology"""
        return {
            # Mechanics
            "mechanics", "kinematics", "dynamics", "statics",
            "displacement", "velocity", "acceleration", "jerk",
            "force", "mass", "weight", "momentum", "impulse",
            "inertia", "torque", "angular", "rotational",
            "equilibrium", "center", "gravity", "mass",
            
            # Energy and work
            "energy", "kinetic", "potential", "work", "power",
            "joule", "watt", "newton", "pascal", "calorie",
            "conservation", "dissipation", "friction",
            
            # Waves and optics
            "wave", "frequency", "wavelength", "amplitude",
            "period", "velocity", "reflection", "refraction",
            "diffraction", "interference", "polarization",
            "light", "photon", "optics", "mirror", "lens",
            "image", "real", "virtual", "magnification",
            
            # Thermodynamics
            "thermodynamics", "temperature", "heat", "thermal",
            "entropy", "enthalpy", "internal", "energy",
            "conduction", "convection", "radiation",
            "ideal", "gas", "law", "boyle", "charles",
            "carnot", "engine", "refrigerator",
            
            # Electricity and magnetism
            "electric", "current", "voltage", "resistance",
            "capacitance", "inductance", "circuit", "series",
            "parallel", "ohm", "kirchhoff", "faraday",
            "magnetic", "field", "flux", "electromagnetic",
            "solenoid", "motor", "generator", "transformer",
            
            # Modern physics
            "relativity", "special", "general", "einstein",
            "quantum", "mechanics", "photon", "electron",
            "proton", "neutron", "nucleus", "atom",
            "radioactivity", "half-life", "decay", "fission", "fusion",
            "nuclear", "particle", "wave-particle", "duality",
            
            # Units and measurements
            "meter", "kilogram", "second", "ampere", "kelvin",
            "mole", "candela", "hertz", "newton", "pascal",
            "joule", "watt", "coulomb", "volt", "farad",
            "ohm", "siemens", "weber", "tesla", "henry",
            "lumen", "lux", "becquerel", "gray", "sievert",
            "radian", "steradian",
        }
    
    def _load_chemistry_words(self) -> Set[str]:
        """Load chemistry terminology"""
        return {
            # Atoms and elements
            "atom", "proton", "neutron", "electron", "nucleus",
            "shell", "orbital", "valence", "isotope", "ion",
            "cation", "anion", "element", "periodic", "table",
            
            # Bonds and compounds
            "bond", "ionic", "covalent", "metallic", "hydrogen",
            "compound", "molecule", "formula", "empirical",
            "molecular", "structural", "isomer",
            
            # Reactions
            "reaction", "reactant", "product", "catalyst",
            "equilibrium", "stoichiometry", "yield", "limiting",
            "excess", "reversible", "irreversible",
            "synthesis", "decomposition", "single", "double",
            "replacement", "combustion", "oxidation", "reduction",
            
            # States and solutions
            "solid", "liquid", "gas", "plasma", "sublimation",
            "evaporation", "condensation", "freezing", "melting",
            "solution", "solute", "solvent", "concentration",
            "molarity", "molality", "dilution", "colligative",
            
            # Acids and bases
            "acid", "base", "salt", "pH", "hydrogen", "ion",
            "arrhenius", "brønsted", "lewis", "strong", "weak",
            "neutralization", "hydrolysis",
            
            # Organic chemistry
            "organic", "hydrocarbon", "alkane", "alkene", "alkyne",
            "aromatic", "benzene", "alcohol", "ether", "aldehyde",
            "ketone", "carboxylic", "ester", "amine", "amide",
            "polymer", "monomer", "protein", "carbohydrate", "lipid",
            
            # Thermochemistry
            "enthalpy", "entropy", "gibbs", "free", "energy",
            "exothermic", "endothermic", "calorimetry",
            
            # Electrochemistry
            "electrode", "anode", "cathode", "electrolysis",
            "galvanic", "electrolytic", "cell", "potential",
            
            # Common compounds
            "water", "hydrogen", "oxygen", "nitrogen", "carbon",
            "dioxide", "sulfuric", "nitric", "hydrochloric",
            "sodium", "chloride", "calcium", "carbonate",
            "iron", "oxide", "copper", "sulfate", "zinc",
            
            # Chemical formulas
            "H2O", "CO2", "O2", "N2", "H2", "NaCl", "H2SO4",
            "HNO3", "HCl", "CaCO3", "NaOH", "KOH", "CH4",
            "C2H5OH", "C6H12O6", "Fe2O3", "CuSO4", "KMnO4",
        }
    
    def _load_biology_words(self) -> Set[str]:
        """Load biology terminology"""
        return {
            # Cell biology
            "cell", "nucleus", "membrane", "cytoplasm", "organelle",
            "mitochondria", "ribosome", "endoplasmic", "reticulum",
            "golgi", "lysosome", "vacuole", "chloroplast",
            "cell wall", "chromosome", "gene", "DNA", "RNA",
            
            # Genetics
            "gene", "allele", "genotype", "phenotype", "dominant",
            "recessive", "heterozygous", "homozygous", "mutation",
            "inheritance", "meiosis", "mitosis", "recombination",
            
            # Evolution
            "evolution", "natural selection", "adaptation", "speciation",
            "extinction", "fossil", "darwin", "mutation", "variation",
            
            # Ecology
            "ecology", "ecosystem", "habitat", "niche", "population",
            "community", "biome", "food chain", "food web",
            "producer", "consumer", "decomposer", "symbiosis",
            "mutualism", "parasitism", "commensalism",
            
            # Anatomy
            "tissue", "organ", "system", "epithelial", "connective",
            "muscle", "nervous", "skeletal", "circulatory",
            "respiratory", "digestive", "excretory", "reproductive",
            "endocrine", "lymphatic", "immune",
            
            # Physiology
            "metabolism", "photosynthesis", "respiration", "digestion",
            "absorption", "circulation", "excretion", "regulation",
            "homeostasis", "enzyme", "hormone", "neurotransmitter",
            
            # Microbiology
            "bacteria", "virus", "fungi", "protist", "archaea",
            "pathogen", "antibiotic", "vaccine", "immune",
            
            # Classification
            "kingdom", "phylum", "class", "order", "family",
            "genus", "species", "taxonomy", "classification",
            "vertebrate", "invertebrate", "mammal", "bird",
            "reptile", "amphibian", "fish", "insect", "arachnid",
        }
    
    def check_word(self, word: str) -> bool:
        """Check if word is in dictionary"""
        return word.lower() in self.all_words
    
    def get_suggestions(self, word: str, max_suggestions: int = 5) -> List[str]:
        """Get spelling suggestions for a word"""
        word_lower = word.lower()
        
        # Check if it's an OCR correction
        if word_lower in self.ocr_corrections:
            return [self.ocr_corrections[word_lower]]
        
        # Generate suggestions using edit distance
        suggestions = []
        
        # Simple edit distance
        alphabet = 'abcdefghijklmnopqrstuvwxyz'
        
        # Deletions
        for i in range(len(word_lower)):
            candidate = word_lower[:i] + word_lower[i+1:]
            if candidate in self.all_words:
                suggestions.append(candidate)
        
        # Transpositions
        for i in range(len(word_lower) - 1):
            candidate = word_lower[:i] + word_lower[i+1] + word_lower[i] + word_lower[i+2:]
            if candidate in self.all_words:
                suggestions.append(candidate)
        
        # Insertions
        for i in range(len(word_lower) + 1):
            for c in alphabet:
                candidate = word_lower[:i] + c + word_lower[i:]
                if candidate in self.all_words:
                    suggestions.append(candidate)
        
        # Replacements
        for i in range(len(word_lower)):
            for c in alphabet:
                candidate = word_lower[:i] + c + word_lower[i+1:]
                if candidate in self.all_words:
                    suggestions.append(candidate)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_suggestions = []
        for s in suggestions:
            if s not in seen:
                seen.add(s)
                unique_suggestions.append(s)
        
        return unique_suggestions[:max_suggestions]
    
    def correct_word(self, word: str) -> str:
        """Correct a word if possible"""
        if self.check_word(word):
            return word
        
        # Check OCR corrections first
        if word.lower() in self.ocr_corrections:
            return self.ocr_corrections[word.lower()]
        
        # Get suggestions
        suggestions = self.get_suggestions(word)
        if suggestions:
            return suggestions[0]
        
        return word
    
    def get_word_info(self, word: str) -> Dict:
        """Get detailed information about a word"""
        word_lower = word.lower()
        
        categories = []
        if word_lower in self.common_words:
            categories.append("common")
        if word_lower in self.math_words:
            categories.append("mathematics")
        if word_lower in self.science_words:
            categories.append("science")
        if word_lower in self.geography_words:
            categories.append("geography")
        if word_lower in self.physics_words:
            categories.append("physics")
        if word_lower in self.chemistry_words:
            categories.append("chemistry")
        if word_lower in self.biology_words:
            categories.append("biology")
        
        return {
            "word": word,
            "is_valid": self.check_word(word),
            "categories": categories,
            "suggestions": self.get_suggestions(word) if not self.check_word(word) else [],
            "ocr_correction": self.ocr_corrections.get(word_lower),
        }


# Create global instance
english_dictionary = EnglishDictionary()
