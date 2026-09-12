'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Header from '../components/Header'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import useKeepAlive from '../hooks/useKeepAlive'
import { useOCRProcessing } from '../hooks/useOCRProcessing'

type OutputMode = 'clean' | 'layout' | 'visual'
type DownloadFormat = 'txt' | 'html' | 'md'

const OUTPUT_MODES: Array<{ key: OutputMode; label: string }> = [
  { key: 'clean', label: 'Clean Text' },
  { key: 'layout', label: 'Preserve Layout' },
  { key: 'visual', label: 'Exact Visual Reconstruction' },
]

const DOWNLOAD_FORMATS: Array<{ key: DownloadFormat; label: string; ext: string }> = [
  { key: 'txt', label: 'Text File', ext: '.txt' },
  { key: 'html', label: 'HTML File', ext: '.html' },
  { key: 'md', label: 'Markdown', ext: '.md' },
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
    <div className="relative border border-gray-200 rounded-xl bg-white p-3">
      <div className="relative inline-block max-w-full overflow-auto">
        <img src={preview} alt="Visual reconstruction preview" className="max-h-80 rounded-lg shadow-sm" />
        <div className="absolute inset-0 pointer-events-none">
          {regions.map((r, idx) => {
            const bbox = r.bbox
            if (!bbox) return null
            const left = Math.max(0, (bbox.x / Math.max(bbox.w, 1)) * 100)
            const top = Math.max(0, (bbox.y / Math.max(bbox.h, 1)) * 100)
            const width = Math.min(100, Math.max(8, Math.round((bbox.w / Math.max(bbox.w, 1)) * 100)))
            return (
              <div key={idx} className="absolute border-2 border-emerald-500 bg-emerald-500/10 rounded"
                style={{
                  left: `${Math.min(95, Math.max(0, bbox.x))}px`,
                  top: `${Math.min(95, Math.max(0, bbox.y))}px`,
                  width: `${Math.min(420, Math.max(80, bbox.w))}px`,
                  height: `${Math.min(40, Math.max(16, bbox.h))}px`,
                }}>
                <span className="absolute -top-6 left-0 text-[10px] font-bold bg-white px-1 rounded border">
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
  const cropStartRef = useRef<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const { status, progress, message, result, error, processingTime, process, reset } = useOCRProcessing()
  const alive = useKeepAlive()

  const onDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {!file ? (
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-1.5 rounded-full text-sm font-medium border border-primary-100">
                <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></span>
                Client-Side OCR (No Server Needed)
              </div>
              <h1 className="text-4xl font-extrabold text-gray-900">
                Extract Text from <span className="text-primary-600">Question Papers</span>
              </h1>
              <p className="text-gray-600 max-w-xl mx-auto">
                Upload your question paper and our AI extracts text directly in your browser.
                Supports Hindi, Telugu, English. No data leaves your device.
              </p>
            </div>

            <div className="max-w-lg mx-auto">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-10 h-10 mb-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600 font-medium">Drag & drop or click to upload</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, BMP, TIFF, WebP (max 50MB)</p>
                </div>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff,.tif,.webp" onChange={onDrop} />
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-white rounded-xl border border-gray-100">
                <div className="text-2xl font-bold text-primary-600">100%</div>
                <div className="text-sm text-gray-600">Client-Side</div>
                <div className="text-xs text-gray-400">No data leaves browser</div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-gray-100">
                <div className="text-2xl font-bold text-emerald-600">3</div>
                <div className="text-sm text-gray-600">Languages</div>
                <div className="text-xs text-gray-400">Hindi, Telugu, English</div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-gray-100">
                <div className="text-2xl font-bold text-accent-600">Free</div>
                <div className="text-sm text-gray-600">Forever</div>
                <div className="text-xs text-gray-400">No server costs</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 truncate">{file.name}</h2>
                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button onClick={handleReset} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">
                Upload Another
              </button>
            </div>

            {/* Progress */}
            {status !== 'completed' && status !== 'failed' && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Processing</h3>
                  <span className="text-sm font-medium text-primary-600 bg-primary-50 px-2.5 py-0.5 rounded-full">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden mb-3">
                  <div className="bg-gradient-to-r from-primary-500 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="text-sm text-gray-500">{message}</p>
              </div>
            )}

            {/* Error */}
            {status === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-800 font-medium">Processing Failed</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Uploaded File</h3>
                  {file?.type !== 'application/pdf' && status === 'completed' && (
                    <button
                      onClick={() => setShowCrop(!showCrop)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        showCrop
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {showCrop ? 'Cancel Crop' : 'Crop Image'}
                    </button>
                  )}
                </div>
                {file?.type === 'application/pdf' ? (
                  <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm font-medium text-gray-700">{file.name}</p>
                      <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB - PDF</p>
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
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-red-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-bold text-red-800 text-lg">OCR Quality: Very Low</p>
                        <p className="text-sm text-red-600 mt-1">
                          {result.documentAnalysis.metadata.failureReason}
                        </p>
                        <p className="text-sm text-red-500 mt-2">
                          Try uploading a higher resolution image (1600+ px wide, 300 DPI).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* OCR Quality Stats */}
                <div className="bg-white rounded-xl border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">OCR Quality</h3>
                  <div className="grid sm:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        (result.documentAnalysis?.metadata.characterConfidence || 0) >= 70 ? 'text-emerald-600' :
                        (result.documentAnalysis?.metadata.characterConfidence || 0) >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {result.documentAnalysis ? Math.round(result.documentAnalysis.metadata.characterConfidence) : Math.round(result.summary.averageConfidence)}%
                      </div>
                      <div className="text-xs text-gray-500">Character confidence</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        (result.documentAnalysis?.metadata.wordConfidence || 0) >= 70 ? 'text-emerald-600' :
                        (result.documentAnalysis?.metadata.wordConfidence || 0) >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {result.documentAnalysis ? Math.round(result.documentAnalysis.metadata.wordConfidence) : Math.round(result.summary.averageConfidence)}%
                      </div>
                      <div className="text-xs text-gray-500">Word confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{(processingTime / 1000).toFixed(1)}s</div>
                      <div className="text-xs text-gray-500">Processing time</div>
                    </div>
                  </div>

                  {result.documentAnalysis && (
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-gray-600">{result.documentAnalysis.metadata.highConfidenceWords} high</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-gray-600">{result.documentAnalysis.metadata.reviewSuggestedWords} review</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span className="text-gray-600">{result.documentAnalysis.metadata.lowConfidenceWords} low</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Document Analysis - Warnings */}
                {result.documentAnalysis && result.documentAnalysis.metadata.fieldsNeedingVerification > 0 && !result.documentAnalysis.metadata.isCatastrophicFailure && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-medium text-amber-800">
                          {result.documentAnalysis.metadata.fieldsNeedingVerification} regions need manual verification
                        </p>
                        <p className="text-sm text-amber-600 mt-1">
                          Low confidence regions marked for review.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Corrections Applied */}
                {result.documentAnalysis && result.documentAnalysis.corrections.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="font-medium text-blue-800 mb-2">
                      Auto-corrected {result.documentAnalysis.corrections.length} OCR errors
                    </p>
                    <div className="text-sm text-blue-600 space-y-1 max-h-32 overflow-y-auto">
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
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="font-medium text-gray-700 mb-2 text-sm">Detected Entities</p>
                    <div className="flex flex-wrap gap-2">
                      {result.documentAnalysis.documentEntities.slice(0, 15).map((entity, i) => (
                        <span key={i} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">
                          {entity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">Output Mode</h3>
                      <p className="text-xs text-gray-500">Clean text, layout-preserving text, or visual reconstruction.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {OUTPUT_MODES.map((mode) => (
                        <button
                          key={mode.key}
                          onClick={() => setOutputMode(mode.key)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            outputMode === mode.key
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Extracted Text</h3>
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
                            className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              const pageText = outputMode === 'visual'
                                ? result.pages[0].fullText
                                : outputMode === 'layout'
                                  ? formatLayoutText(result.pages[0].regions)
                                  : result.pages[0].fullText

                              navigator.clipboard.writeText(pageText)
                              toast.success('Copied to clipboard!')
                            }}
                            className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors"
                          >
                            Copy
                          </button>
                          <div className="relative group">
                            <button className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors flex items-center gap-1">
                              Download
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 hidden group-hover:block min-w-[120px]">
                              {DOWNLOAD_FORMATS.map((fmt) => (
                                <button
                                  key={fmt.key}
                                  onClick={() => downloadText(fmt.key)}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
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
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
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
                      className="w-full h-64 text-sm text-gray-700 font-mono bg-gray-50 rounded-lg p-4 border border-gray-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none resize-y"
                      dir="auto"
                    />
                  ) : outputMode === 'visual' ? (
                    <div className="space-y-3">
                      {buildVisualOverlay(result.pages[0].regions, preview)}
                      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                        <span className="font-semibold text-gray-700">Exact Visual Reconstruction</span>
                        <span className="ml-2">Showing region coordinate overlays over the uploaded image.</span>
                      </div>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto" dir="auto">
                      {outputMode === 'layout' ? formatLayoutText(result.pages[0].regions) : result.pages[0].fullText || 'No text detected'}
                    </pre>
                  )}
                </div>

                {/* Region details with confidence flags */}
                <div className="bg-white rounded-xl border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Detected Regions</h3>
                  <div className="space-y-3">
                    {result.pages[0].regions.map((r, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                        r.confidence < 0.5 ? 'bg-red-50 border border-red-200' :
                        r.confidence < 0.7 ? 'bg-amber-50 border border-amber-200' :
                        'bg-gray-50'
                      }`}>
                        <span className="text-xs font-mono text-gray-400 mt-0.5 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{r.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium ${
                              r.confidence >= 0.7 ? 'text-emerald-600' :
                              r.confidence >= 0.5 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {Math.round(r.confidence * 100)}% confidence
                            </span>
                            {r.confidence < 0.5 && (
                              <span className="text-xs text-red-500 font-medium">⚠ Needs verification</span>
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

      <footer className="border-t border-gray-200 bg-white/50 mt-auto">
        <div className="container mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-500">
            PaperAI — Client-Side OCR | PDF + Images | Hindi, Telugu, English | Your data stays private
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            Build: {typeof window !== 'undefined' ? (window as any).__BUILD_VERSION || 'dev' : 'dev'}
          </p>
        </div>
      </footer>

      {/* Keep-alive indicator - only show if backend is configured */}
      {alive !== null && (
        <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border backdrop-blur-sm"
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

      <ToastContainer position="top-right" autoClose={4000} theme="light" />
    </div>
  )
}
