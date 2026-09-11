import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
}

export const metadata: Metadata = {
  title: 'PaperAI - Smart Question Paper OCR',
  description: 'Extract text from question papers with AI-powered OCR. Supports Hindi, Telugu, English and Mathematics with high accuracy.',
  keywords: ['OCR', 'question paper', 'text extraction', 'Hindi', 'Telugu', 'Mathematics', 'AI'],
  metadataBase: new URL('https://paperai-ocr.vercel.app'),
  openGraph: {
    title: 'PaperAI - Smart Question Paper OCR',
    description: 'Extract text from question papers with AI-powered OCR. Multi-language support for Hindi, Telugu, English and Mathematics.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
