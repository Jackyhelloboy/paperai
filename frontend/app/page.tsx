'use client'

import { useState, useCallback } from 'react'
import Header from '../components/Header'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import useKeepAlive from '../hooks/useKeepAlive'
import { useOCRProcessing } from '../hooks/useOCRProcessing'

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
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

    setFile(f)
    setPreview(URL.createObjectURL(f))
    toast.info('Processing image...')

    await process(f)
  }, [process])

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    reset()
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
                <h3 className="font-semibold text-gray-900 mb-3">Uploaded Image</h3>
                <img src={preview} alt="Uploaded" className="max-h-64 mx-auto rounded-lg shadow-sm" />
              </div>
            )}

            {/* Results */}
            {status === 'completed' && result && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                    <div className="text-2xl font-bold text-primary-600">{result.summary.totalRegions}</div>
                    <div className="text-xs text-gray-500">Regions</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{result.summary.totalWords}</div>
                    <div className="text-xs text-gray-500">Words</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                    <div className="text-2xl font-bold text-accent-600">{Math.round(result.summary.averageConfidence * 100)}%</div>
                    <div className="text-xs text-gray-500">Confidence</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                    <div className="text-2xl font-bold text-gray-900">{(processingTime / 1000).toFixed(1)}s</div>
                    <div className="text-xs text-gray-500">Time</div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Extracted Text</h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(result.pages[0].fullText)
                        toast.success('Copied to clipboard!')
                      }}
                      className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    {result.pages[0].fullText || 'No text detected'}
                  </pre>
                </div>

                {/* Region details */}
                <div className="bg-white rounded-xl border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Detected Regions</h3>
                  <div className="space-y-3">
                    {result.pages[0].regions.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-xs font-mono text-gray-400 mt-0.5 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{r.text}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Confidence: {Math.round(r.confidence * 100)}%
                          </p>
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
            PaperAI — Client-Side OCR | No server processing | Your data stays private
          </p>
        </div>
      </footer>

      {/* Keep-alive indicator */}
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

      <ToastContainer position="top-right" autoClose={4000} theme="light" />
    </div>
  )
}
