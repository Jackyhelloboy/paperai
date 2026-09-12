# PaperAI - Question Paper OCR System

Extract text from question papers with high accuracy for Hindi, Telugu, English, and Mathematics.

## Features

- **Multi-Language OCR**: Supports Hindi, Telugu, English, and Mathematics
- **High Accuracy**: Uses Tesseract.js v5 with multi-resolution processing
- **Client-Side Processing**: 100% browser-based - no data leaves your device
- **Dark Mode**: Full dark mode with system preference detection
- **Keyboard Shortcuts**: Ctrl+V paste, Ctrl+S download, Ctrl+E edit, Esc reset
- **PWA Support**: Works offline after first visit
- **Multiple Export Formats**: Export to TXT, HTML, or Markdown
- **Confidence Scoring**: Every region gets a confidence score
- **Auto-Correction**: Hindi and Telugu post-processing with dictionary correction
- **Image Cropping**: Crop specific regions for focused OCR

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **OCR Engine**: Tesseract.js v5 (LSTM)
- **PDF Processing**: pdf.js v4
- **PWA**: Service Worker with offline caching
- **Deployment**: Cloudflare Pages

## Quick Start

### Development

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
cd frontend
npm run build
npm start
```

## Deployment to Cloudflare Pages

### Prerequisites

1. A Cloudflare account
2. Cloudflare API token with Pages permission
3. GitHub repository connected to Cloudflare

### Setup

1. **Set GitHub Secrets**:
   - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

2. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "feat: enhanced UI, dark mode, keyboard shortcuts"
   git push origin main
   ```

3. **Automatic Deployment**: GitHub Actions will build and deploy to Cloudflare Pages automatically.

### Manual Deployment

```bash
cd frontend
npm run build
npx wrangler pages deploy .next --project-name=paperai
```

## Project Structure

```
Paper Ai/
├── frontend/                    # Next.js frontend
│   ├── app/                     # Next.js app directory
│   │   ├── layout.tsx          # Root layout with ThemeProvider
│   │   ├── page.tsx            # Main OCR page
│   │   ├── globals.css         # Global styles (dark mode)
│   │   ├── features/           # Features page
│   │   └── about/              # About page
│   ├── components/              # React components
│   │   ├── Header.tsx          # Navigation with dark mode toggle
│   │   ├── ThemeProvider.tsx   # Dark mode context
│   │   ├── Skeleton.tsx        # Loading skeletons
│   │   ├── SWRegister.tsx      # Service worker registration
│   │   └── KeepAliveIndicator.tsx
│   ├── hooks/                   # Custom React hooks
│   │   ├── useOCRProcessing.ts # OCR processing state
│   │   └── useKeepAlive.ts     # Backend keep-alive
│   ├── lib/                     # Core libraries
│   │   ├── ocrEngine.ts        # Tesseract.js wrapper
│   │   ├── processImage.ts     # Image processing pipeline
│   │   ├── pdfProcess.ts       # PDF to images
│   │   ├── imagePreprocess.ts  # Image preprocessing
│   │   ├── documentProcessor.ts # Document OCR pipeline
│   │   ├── hindiPostProcess.ts # Hindi text correction
│   │   └── teluguPostProcess.ts # Telugu text correction
│   ├── public/                  # Static assets
│   │   ├── sw.js              # Service worker
│   │   ├── manifest.json      # PWA manifest
│   │   └── _headers           # Cloudflare headers
│   ├── next.config.js          # Next.js config
│   ├── tailwind.config.js      # Tailwind config (dark mode)
│   └── package.json            # Dependencies
│
├── .github/workflows/
│   ├── deploy.yml              # Cloudflare Pages deployment
│   └── keep-alive.yml          # Backend keep-alive
│
├── backend/                     # Python FastAPI backend (optional)
├── training_data/               # OCR correction data
└── README.md
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+V` | Paste image from clipboard |
| `Ctrl+S` | Download extracted text |
| `Ctrl+E` | Enter edit mode |
| `Esc` | Reset / Upload another file |

## OCR Pipeline

```
Input Image
    ↓
Image Preprocessing (grayscale, contrast, background removal)
    ↓
Text Line Detection (horizontal projection)
    ↓
Per-Line OCR (Tesseract.js LSTM)
    ↓
Script Detection (Hindi/English/Mixed/Telugu)
    ↓
Multi-Resolution Passes (1x, de-ruled, high-contrast, morphological)
    ↓
Confidence Scoring & Best Result Selection
    ↓
Post-Processing (Hindi/Telugu dictionary correction)
    ↓
Output (Clean text / Layout preserved / Visual overlay)
```

## Accuracy Improvements

### Per-Line Script Detection
Each line/region is classified separately for correct language routing.

### Multi-Resolution OCR
Each region processed at multiple resolutions to capture all details.

### Dictionary Correction
Low-confidence words are corrected against Hindi/Telugu dictionaries.

### Auto-Correction Rules
Common OCR errors are automatically fixed (historical names, numbers, etc.).

## License

This project is built for educational purposes to help teachers prepare and digitize question papers.
