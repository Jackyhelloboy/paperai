# PaperAI - Question Paper OCR System

Extract text from question papers with high accuracy for Hindi, Telugu, English, and Mathematics.

## Features

- **Multi-Language OCR**: Supports Hindi, Telugu, English, and Mathematics
- **High Accuracy**: Uses PP-OCRv5 with multi-resolution processing
- **Question Paper Aware**: Validates question numbers, options, and marks
- **Math Protection**: Preserves mathematical expressions and formulas
- **Multiple Export Formats**: Export to TXT, Word, or PDF
- **Responsive Design**: Works on both desktop and mobile devices

## Architecture

```
                    PDF / CAMERA IMAGE
                           │
                           ▼
                IMAGE QUALITY ANALYZER
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          rotation       blur         perspective
          lighting       noise        resolution
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                  IMAGE PREPROCESSOR
                           │
                           ▼
                   LAYOUT DETECTION
                           │
           heading / question / formula /
            table / options / diagram
                           │
                           ▼
                 SCRIPT CLASSIFIER
                    │      │      │
               English   Hindi   Telugu
                    │      │      │
                    ▼      ▼      ▼
                 PP-OCRv5 recognizers
                           │
                           ▼
                  FIRST OCR RESULT
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      HIGH CONFIDENCE                UNCERTAIN
             │                           │
             │                 multiple enhanced crops
             │                           │
             │                    OCR second pass
             │                           │
             │                 independent OCR checker
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    MATH CHECKER
                           │
                           ▼
                 PaddleOCR-VL 1.6
                document/layout checker
                           │
                           ▼
                    RULE CHECKER
                           │
                           ▼
                 SOURCE COMPARATOR
                           │
                           ▼
                  VERIFIED OUTPUT
```

## Project Structure

```
Paper Ai/
├── frontend/                    # Next.js frontend
│   ├── app/                     # Next.js app directory
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Main page
│   │   └── globals.css         # Global styles
│   ├── components/              # React components
│   │   ├── Header.tsx          # Navigation header
│   │   ├── UploadZone.tsx      # File upload component
│   │   ├── ProcessingStatus.tsx # Processing progress
│   │   ├── ResultViewer.tsx    # Text results display
│   │   └── ExportPanel.tsx     # Export options
│   ├── package.json            # Frontend dependencies
│   ├── tailwind.config.js      # Tailwind CSS config
│   └── next.config.js          # Next.js config
│
├── backend/                     # Python FastAPI backend
│   ├── main.py                 # FastAPI application
│   ├── requirements.txt        # Python dependencies
│   ├── api/
│   │   └── routes.py          # API endpoints
│   ├── ocr_engine/
│   │   ├── image_preprocessor.py    # Image preprocessing
│   │   ├── script_classifier.py     # Script detection
│   │   ├── ocr_engine.py            # PP-OCRv5 engine
│   │   ├── math_protector.py        # Math expression protection
│   │   ├── question_paper_validator.py # Structure validation
│   │   └── consensus_scorer.py      # Confidence scoring
│   ├── exports/
│   │   └── export_manager.py   # Export to TXT/Word/PDF
│   └── utils/
│       └── config.py          # Configuration
│
└── training_data/               # Correction data for fine-tuning
```

## Installation

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   # source venv/bin/activate  # Linux/Mac
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   python main.py
   ```

   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload a file for processing |
| POST | `/api/process/{job_id}` | Start OCR processing |
| GET | `/api/status/{job_id}` | Check processing status |
| GET | `/api/result/{job_id}` | Get extraction results |
| GET | `/api/export/{job_id}/{format}` | Export results (txt/docx/pdf) |
| POST | `/api/correct/{job_id}` | Submit corrections for training |
| DELETE | `/api/job/{job_id}` | Delete a job and its files |
| GET | `/api/jobs` | List all jobs |

## Supported File Types

- PDF (.pdf)
- JPEG (.jpg, .jpeg)
- PNG (.png)
- BMP (.bmp)
- TIFF (.tiff, .tif)
- WebP (.webp)

Maximum file size: 50MB

## How It Works

1. **Upload**: Teacher uploads a question paper (PDF/image)
2. **Preprocess**: Image is cleaned, rotated, and enhanced
3. **Layout Detection**: Identify text regions, questions, formulas
4. **Script Detection**: Each region is classified by script type
5. **OCR**: PP-OCRv5 processes each region in the correct language
6. **Math Protection**: Mathematical expressions are preserved
7. **Validation**: Question paper structure is verified
8. **Scoring**: Confidence scores are calculated
9. **Export**: Results can be exported as TXT, Word, or PDF

## Accuracy Improvements

### Per-Line Script Detection
Instead of treating the entire document as one language, each line/region is classified separately. This handles mixed-language papers correctly.

### Multi-Resolution OCR
Each text region is processed at 1x, 1.5x, and 2x resolutions to capture small characters and details.

### Question Paper Rules
The system validates:
- Question numbering sequences
- MCQ option completeness (A, B, C, D)
- Marks values
- Section headers

### Critical Token Protection
Special attention is given to:
- Numbers (especially in answers/marks)
- Mathematical operators
- Chemical formulas
- Units (cm, kg, mL)

### Consensus Scoring
Multiple factors are combined for confidence:
- Text confidence (35%)
- Second-pass agreement (20%)
- Independent OCR agreement (10%)
- Script validity (10%)
- Layout agreement (10%)
- Critical token agreement (10%)
- Document rules (5%)

## Future Improvements

1. **Fine-tune PP-OCRv5**: Train on real question papers
2. **Teacher Corrections**: Collect corrections for model improvement
3. **Batch Processing**: Process multiple papers at once
4. **Cloud Deployment**: Deploy to AWS/GCP for scalability
5. **Mobile App**: Native Android/iOS application

## License

This project is built for educational purposes to help teachers prepare and digitize question papers.
