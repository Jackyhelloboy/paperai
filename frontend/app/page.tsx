'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Header from '../components/Header'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import useKeepAlive from '../hooks/useKeepAlive'
import { useOCRProcessing } from '../hooks/useOCRProcessing'
import { SkeletonUpload, SkeletonResult } from '../components/Skeleton'

type OutputMode = 'clean' | 'layout' | 'visual'
type DownloadFormat = 'txt' | 'html' | 'md'

const OUTPUT_MODES: Array<{ key: OutputMode; label: string; icon: string }> = [
  { key: 'clean', label: 'Clean Text', icon: 'Aa' },
  { key: 'layout', label: 'Preserve Layout', icon: '⊞' },
  { key: 'visual', label: 'Visual Overlay', icon: '◻' },
]

const DOWNLOAD_FORMATS: Array<{ key: DownloadFormat; label: string; ext: string; icon: string }> = [
  { key: 'txt', label: 'Text File', ext: '.txt', icon: '📄' },
  { key: 'html', label: 'HTML File', ext: '.html', icon: '🌐' },
  { key: 'md', label: 'Markdown', ext: '.md', icon: '📝' },
]

function formatAsHTML(text: string, regions?: Array<{ text: string; confidence: number }>): string {
  const lines = text.split('\n')
  let html = '<!DOCTYPE html>\n<html lang="hi">\n<head>\n<meta charset="UTF-8">\n'
  html += '<title>Extracted Text - PaperAI</title>\n'
  html += '<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}'
  html += '.line{margin:8px 0;padding:4px;border-bottom:1px solid #eee}'
  html += '.low-confidence{color:#d97706}</style>\n</head>\n<body>\n'
  html += '<h1>Extracted Text</h1>\n'
  lines.forEach((line, i) => {
    const conf = regions?.[i]?.confidence || 1
    const cls = conf < 0.5 ? ' class="low-confidence"' : ''
    html += `<div class="line"${cls}>${escapeHTML(line)}</div>\n`
  })
  html += '</body>\n</html>'
  return html
}

function formatAsMarkdown(text: string): string {
  const lines = text.split('\n')
  let md = '# Extracted Text\n\n'
  lines.forEach(line => {
    md += `${line}\n\n`
  })
  return md
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatLayoutText(regions: Array<{ text: string; confidence: number; bbox?: { x: number; y: number; w: number; h: number }; language?: string }>): string {
  return regions
    .filter(r => r.text?.trim())
    .map((r, idx) => `${idx + 1}. ${r.text.trim()}`)
    .join('\n')
}

function buildVisualOverlay(regions: Array<{ text: string; confidence: number; bbox?: { x: number; y: number; w: number; h: number }; language?: string }>, preview: string | null) {
  if (!preview || regions.length === 0) return null

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-3">
      <div className="relative inline-block max-w-full overflow-auto">
        <img src={preview} alt="Visual reconstruction preview" className="max-h-80 rounded-lg shadow-sm" />
        <div className="absolute inset-0 pointer-events-none">
          {regions.map((r, idx) => {
            const bbox = r.bbox
            if (!bbox) return null
            return (
              <div key={idx} className="absolute border-2 border-emerald-500 bg-emerald-500/10 rounded"
                style={{
                  left: `${Math.min(95, Math.max(0, bbox.x))}px`,
                  top: `${Math.min(95, Math.max(0, bbox.y))}px`,
                  width: `${Math.min(420, Math.max(80, bbox.w))}px`,
                  height: `${Math.min(40, Math.max(16, bbox.h))}px`,
                }}>
                <span className="absolute -top-6 left-0 text-[10px] font-bold bg-white dark:bg-gray-800 px-1 rounded border dark:border-gray-600">
                  {r.text.slice(0, 20)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [editedText, setEditedText] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [outputMode, setOutputMode] = useState<OutputMode>('clean')
  const [showCrop, setShowCrop] = useState(false)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const cropStartRef = useRef<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { status, progress, message, result, error, processingTime, process, reset } = useOCRProcessing()
  const alive = useKeepAlive()

  // Keyboard shortcuts
  const handleFileSelectRef = useRef<((f: File) => Promise<void>) | null>(null)
  const handleResetRef = useRef<(() => void) | null>(null)
  const downloadTextRef = useRef<((format: DownloadFormat) => void) | null>(null)

  useEffect(() => {
    handleFileSelectRef.current = handleFileSelect
    handleResetRef.current = handleReset
    downloadTextRef.current = downloadText
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+V / Cmd+V to paste image
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        navigator.clipboard.read().then(items => {
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                item.getType(type).then(blob => {
                  const file = new File([blob], 'clipboard-image.png', { type })
                  handleFileSelectRef.current?.(file)
                })
                return
              }
            }
          }
        }).catch(() => {})
      }

      // Escape to reset
      if (e.key === 'Escape' && file) {
        handleResetRef.current?.()
      }

      // Ctrl+S / Cmd+S to download
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && result) {
        e.preventDefault()
        downloadTextRef.current?.('txt')
      }

      // Ctrl+E / Cmd+E to edit
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && result) {
        e.preventDefault()
        setIsEditing(true)
        const pageText = outputMode === 'layout'
          ? formatLayoutText(result.pages[0].regions)
          : result.pages[0].fullText || ''
        setEditedText(pageText)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [file, result, outputMode])

  const handleFileSelect = useCallback(async (f: File) => {
    const maxSize = 50 * 1024 * 1024
    if (f.size > maxSize) {
      toast.error('File too large. Max 50MB.')
      return
    }

    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    const isImage = f.type.startsWith('image/') || /\.(jpg|jpeg|png|bmp|tiff|tif|webp)$/i.test(f.name)

    if (!isPdf && !isImage) {
      toast.error('Only PDF and image files are supported.')
      return
    }

    setFile(f)
    setPreview(isPdf ? '' : URL.createObjectURL(f))
    toast.info(isPdf ? 'Processing PDF...' : 'Processing image...')

    try {
      await process(f)
    } catch (err: any) {
      toast.error(err.message || 'Upload failed. Please try again.')
    }
  }, [process])

  const onDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    await handleFileSelect(f)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) await handleFileSelect(f)
  }, [handleFileSelect])

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setEditedText('')
    setIsEditing(false)
    setShowCrop(false)
    setCropRect(null)
    setIsCropping(false)
    reset()
  }

  const handleCropStart = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !showCrop) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    cropStartRef.current = { x, y }
    setCropRect({ x, y, w: 0, h: 0 })
    setIsCropping(true)
  }

  const handleCropMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!cropStartRef.current || !imgRef.current || !isCropping) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const start = cropStartRef.current
    setCropRect({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    })
  }

  const handleCropEnd = () => {
    setIsCropping(false)
    cropStartRef.current = null
  }

  const applyCrop = async () => {
    if (!cropRect || !preview || !file) return
    const img = new Image()
    img.src = preview
    await new Promise(r => { img.onload = r })

    const canvas = document.createElement('canvas')
    canvas.width = cropRect.w
    canvas.height = cropRect.h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const croppedFile = new File([blob], file.name, { type: file.type })
      setFile(croppedFile)
      setPreview(URL.createObjectURL(blob))
      setShowCrop(false)
      setCropRect(null)
      toast.info('Crop applied. Processing...')
      try {
        await process(croppedFile)
      } catch (err: any) {
        toast.error(err.message || 'Processing failed.')
      }
    }, file.type)
  }

  const downloadText = (format: DownloadFormat) => {
    if (!result) return
    const text = outputMode === 'layout'
      ? formatLayoutText(result.pages[0].regions)
      : result.pages[0].fullText || ''

    let content: string
    let mimeType: string
    let ext: string

    switch (format) {
      case 'html':
        content = formatAsHTML(text, result.pages[0].regions)
        mimeType = 'text/html'
        ext = '.html'
        break
      case 'md':
        content = formatAsMarkdown(text)
        mimeType = 'text/markdown'
        ext = '.md'
        break
      default:
        content = text
        mimeType = 'text/plain'
        ext = '.txt'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (file?.name?.replace(/\.[^.]+$/, '') || 'extracted') + ext
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded as ${ext}`)
  }

  const copyToClipboard = () => {
    if (!result) return
    const pageText = outputMode === 'visual'
      ? result.pages[0].fullText
      : outputMode === 'layout'
        ? formatLayoutText(result.pages[0].regions)
        : result.pages[0].fullText

    navigator.clipboard.writeText(pageText || '')
    toast.success('Copied to clipboard!')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {!file ? (
          <div className="space-y-8 animate-in">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-4 py-1.5 rounded-full text-sm font-medium border border-primary-100 dark:border-primary-800">
                <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></span>
                Client-Side OCR (No Server Needed)
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white">
                Extract Text from <span className="text-primary-600 dark:text-primary-400">Question Papers</span>
              </h1>
              <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
                Upload your question paper and our AI extracts text directly in your browser.
                Supports Hindi, Telugu, English. No data leaves your device.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Press <kbd className="kbd">Ctrl+V</kbd> to paste, <kbd className="kbd">Ctrl+S</kbd> to download
              </p>
            </div>

            <div
              className={`max-w-lg mx-auto transition-all duration-200 ${dragActive ? 'scale-[1.02]' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
                dragActive
                  ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50/30 dark:hover:bg-primary-900/10'
              }`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-10 h-10 mb-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Drag & drop or click to upload</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, JPG, PNG, BMP, TIFF, WebP (max 50MB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff,.tif,.webp"
                  onChange={onDrop}
                />
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">100%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Client-Side</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">No data leaves browser</div>
              </div>
              <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">3</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Languages</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">Hindi, Telugu, English</div>
              </div>
              <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="text-2xl font-bold text-accent-600 dark:text-accent-400">Free</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Forever</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">No server costs</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{file.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors text-gray-700 dark:text-gray-300"
              >
                Upload Another <kbd className="kbd ml-2">Esc</kbd>
              </button>
            </div>

            {/* Progress */}
            {status !== 'completed' && status !== 'failed' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Processing</h3>
                  <span className="text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 rounded-full">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden mb-3">
                  <div
                    className="bg-gradient-to-r from-primary-500 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
              </div>
            )}

            {/* Error */}
            {status === 'failed' && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-red-800 dark:text-red-300 font-medium">Processing Failed</p>
                    <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Uploaded File</h3>
                  {file?.type !== 'application/pdf' && status === 'completed' && (
                    <button
                      onClick={() => setShowCrop(!showCrop)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        showCrop
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {showCrop ? 'Cancel Crop' : 'Crop Image'}
                    </button>
                  )}
                </div>
                {file?.type === 'application/pdf' ? (
                  <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB - PDF</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative inline-block max-w-full">
                    <img
                      ref={imgRef}
                      src={preview}
                      alt="Uploaded"
                      className={`max-h-64 mx-auto rounded-lg shadow-sm ${showCrop ? 'cursor-crosshair' : ''}`}
                      onMouseDown={handleCropStart}
                      onMouseMove={handleCropMove}
                      onMouseUp={handleCropEnd}
                      onMouseLeave={handleCropEnd}
                    />
                    {showCrop && cropRect && cropRect.w > 0 && cropRect.h > 0 && (
                      <div
                        className="absolute border-2 border-primary-500 bg-primary-500/20 pointer-events-none"
                        style={{
                          left: cropRect.x,
                          top: cropRect.y,
                          width: cropRect.w,
                          height: cropRect.h,
                        }}
                      />
                    )}
                  </div>
                )}
                {showCrop && cropRect && cropRect.w > 10 && cropRect.h > 10 && (
                  <div className="mt-3 flex justify-center">
                    <button
                      onClick={applyCrop}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                    >
                      Apply Crop & Re-process
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {status === 'completed' && result && (
              <div className="space-y-4">
                {/* Catastrophic Failure Warning */}
                {result.documentAnalysis?.metadata.isCatastrophicFailure && (
                  <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-red-600 dark:text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-bold text-red-800 dark:text-red-300 text-lg">OCR Quality: Very Low</p>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          {result.documentAnalysis.metadata.failureReason}
                        </p>
                        <p className="text-sm text-red-500 dark:text-red-400 mt-2">
                          Try uploading a higher resolution image (1600+ px wide, 300 DPI).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* OCR Quality Stats */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">OCR Quality</h3>
                  <div className="grid sm:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        (result.documentAnalysis?.metadata.characterConfidence || 0) >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
                        (result.documentAnalysis?.metadata.characterConfidence || 0) >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {result.documentAnalysis ? Math.round(result.documentAnalysis.metadata.characterConfidence) : Math.round(result.summary.averageConfidence)}%
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Character confidence</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        (result.documentAnalysis?.metadata.wordConfidence || 0) >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
                        (result.documentAnalysis?.metadata.wordConfidence || 0) >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {result.documentAnalysis ? Math.round(result.documentAnalysis.metadata.wordConfidence) : Math.round(result.summary.averageConfidence)}%
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Word confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{(processingTime / 1000).toFixed(1)}s</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Processing time</div>
                    </div>
                  </div>

                  {result.documentAnalysis && (
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-gray-600 dark:text-gray-400">{result.documentAnalysis.metadata.highConfidenceWords} high</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-gray-600 dark:text-gray-400">{result.documentAnalysis.metadata.reviewSuggestedWords} review</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span className="text-gray-600 dark:text-gray-400">{result.documentAnalysis.metadata.lowConfidenceWords} low</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Corrections Applied */}
                {result.documentAnalysis && result.documentAnalysis.corrections.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <p className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                      Auto-corrected {result.documentAnalysis.corrections.length} OCR errors
                    </p>
                    <div className="text-sm text-blue-600 dark:text-blue-400 space-y-1 max-h-32 overflow-y-auto">
                      {result.documentAnalysis.corrections.slice(0, 8).map((c, i) => (
                        <p key={i}>
                          <span className="line-through text-blue-400">{c.original}</span>
                          {' → '}
                          <span className="font-medium">{c.corrected}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Document Entities */}
                {result.documentAnalysis && result.documentAnalysis.documentEntities.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-2 text-sm">Detected Entities</p>
                    <div className="flex flex-wrap gap-2">
                      {result.documentAnalysis.documentEntities.slice(0, 15).map((entity, i) => (
                        <span key={i} className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                          {entity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Output Mode */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Output Mode</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Clean text, layout-preserving, or visual overlay.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {OUTPUT_MODES.map((mode) => (
                        <button
                          key={mode.key}
                          onClick={() => setOutputMode(mode.key)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            outputMode === mode.key
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="mr-1">{mode.icon}</span>
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Text Result */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Extracted Text</h3>
                    <div className="flex items-center gap-2">
                      {!isEditing ? (
                        <>
                          <button
                            onClick={() => {
                              const pageText = outputMode === 'visual'
                                ? result.pages[0].fullText
                                : outputMode === 'layout'
                                  ? formatLayoutText(result.pages[0].regions)
                                  : result.pages[0].fullText
                              setEditedText(pageText || '')
                              setIsEditing(true)
                            }}
                            className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                          >
                            Edit <kbd className="kbd ml-1">Ctrl+E</kbd>
                          </button>
                          <button
                            onClick={copyToClipboard}
                            className="px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm font-medium hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                          >
                            Copy
                          </button>
                          <div className="relative group">
                            <button className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1">
                              Download <kbd className="kbd ml-1">Ctrl+S</kbd>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 hidden group-hover:block min-w-[140px]">
                              {DOWNLOAD_FORMATS.map((fmt) => (
                                <button
                                  key={fmt.key}
                                  onClick={() => downloadText(fmt.key)}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <span>{fmt.icon}</span>
                                  <span className="w-8 text-xs text-gray-400 font-mono">{fmt.ext}</span>
                                  {fmt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setIsEditing(false)
                              toast.success('Changes saved!')
                            }}
                            className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="w-full h-64 text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800 outline-none resize-y"
                      dir="auto"
                    />
                  ) : outputMode === 'visual' ? (
                    <div className="space-y-3">
                      {buildVisualOverlay(result.pages[0].regions, preview)}
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Visual Reconstruction</span>
                        <span className="ml-2">Region coordinate overlays over the uploaded image.</span>
                      </div>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto" dir="auto">
                      {outputMode === 'layout' ? formatLayoutText(result.pages[0].regions) : result.pages[0].fullText || 'No text detected'}
                    </pre>
                  )}
                </div>

                {/* Region details */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Detected Regions</h3>
                  <div className="space-y-3">
                    {result.pages[0].regions.map((r, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                        r.confidence < 0.5 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                        r.confidence < 0.7 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                        'bg-gray-50 dark:bg-gray-800'
                      }`}>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{r.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium ${
                              r.confidence >= 0.7 ? 'text-emerald-600 dark:text-emerald-400' :
                              r.confidence >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {Math.round(r.confidence)}% confidence
                            </span>
                            {r.confidence < 0.5 && (
                              <span className="text-xs text-red-500 dark:text-red-400 font-medium">Needs verification</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 mt-auto">
        <div className="container mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            PaperAI — Client-Side OCR | PDF + Images | Hindi, Telugu, English | Your data stays private
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            Build: {typeof window !== 'undefined' ? (window as any).__BUILD_VERSION || 'dev' : 'dev'}
          </p>
        </div>
      </footer>

      {/* Keep-alive indicator */}
      {alive !== null && (
        <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border backdrop-blur-sm transition-colors duration-300"
          style={{
            background: alive ? 'rgba(236, 253, 245, 0.9)' : 'rgba(254, 226, 226, 0.9)',
            borderColor: alive ? 'rgba(134, 239, 172, 0.5)' : 'rgba(252, 165, 165, 0.5)',
            color: alive ? '#166534' : '#991b1b'
          }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${alive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
          {alive ? 'Connected' : 'Offline'}
        </div>
      )}

      <ToastContainer position="top-right" autoClose={4000} theme="colored" />
    </div>
  )
}
