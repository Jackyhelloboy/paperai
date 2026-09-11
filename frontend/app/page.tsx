'use client'

import { useState } from 'react'
import Header from '../components/Header'
import UploadZone from '../components/UploadZone'
import ProcessingStatus from '../components/ProcessingStatus'
import ResultViewer from '../components/ResultViewer'
import ExportPanel from '../components/ExportPanel'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

interface JobStatus {
  job_id: string
  filename: string
  status: 'uploaded' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  result?: any
}

export default function Home() {
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleUploadSuccess = (jobId: string, filename: string) => {
    setCurrentJob({
      job_id: jobId,
      filename,
      status: 'uploaded',
      progress: 0,
      message: 'File uploaded successfully'
    })
    setError(null)
  }

  const handleProcessingComplete = (result: any) => {
    if (currentJob) {
      setCurrentJob(prev => prev ? {
        ...prev,
        status: 'completed',
        progress: 100,
        message: 'Processing complete!',
        result
      } : null)
    }
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  const handleReset = () => {
    setCurrentJob(null)
    setError(null)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {!currentJob ? (
          <div className="relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-200/30 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-200/30 rounded-full blur-3xl"></div>
            </div>

            <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 max-w-6xl">
              <div className="text-center space-y-6 mb-12 animate-in">
                <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-1.5 rounded-full text-sm font-medium border border-primary-100">
                  <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></span>
                  AI-Powered OCR Engine
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight">
                  Extract Text from
                  <br />
                  <span className="gradient-text">Question Papers</span>
                </h1>
                <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                  Upload your question papers and our AI extracts text with high accuracy.
                  Supports Hindi, Telugu, English, and Mathematics.
                </p>
              </div>

              <div className="animate-in delay-100">
                <UploadZone
                  onUploadSuccess={handleUploadSuccess}
                  onError={handleError}
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4 sm:gap-6 mt-16 sm:mt-20 animate-in delay-200">
                <div className="card-hover text-center group">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">Multi-Language OCR</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Hindi, Telugu, English, and Mathematics with high accuracy
                  </p>
                </div>

                <div className="card-hover text-center group">
                  <div className="w-14 h-14 bg-gradient-to-br from-accent-50 to-accent-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">Multiple Formats</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Upload PDF, JPG, PNG, BMP, TIFF, or WebP files up to 50MB
                  </p>
                </div>

                <div className="card-hover text-center group">
                  <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">Export Anywhere</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Export to TXT, Word, or PDF format for easy sharing
                  </p>
                </div>
              </div>

              <div className="mt-16 sm:mt-20 animate-in delay-200">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">How It Works</h2>
                  <p className="text-gray-500 mt-2">Three simple steps to extract text</p>
                </div>
                <div className="grid sm:grid-cols-3 gap-6">
                  {[
                    { step: '01', title: 'Upload', desc: 'Drag and drop or click to upload your question paper' },
                    { step: '02', title: 'Process', desc: 'Our AI engine extracts and validates text automatically' },
                    { step: '03', title: 'Export', desc: 'Download the extracted text in your preferred format' },
                  ].map((item) => (
                    <div key={item.step} className="text-center">
                      <div className="text-4xl font-extrabold gradient-text mb-2">{item.step}</div>
                      <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-6xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate max-w-full">
                  {currentJob.filename}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Processing your document</p>
              </div>
              <button onClick={handleReset} className="btn-secondary text-sm shrink-0">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Upload Another
              </button>
            </div>

            <div className="space-y-6">
              <ProcessingStatus
                job={currentJob}
                onComplete={handleProcessingComplete}
                onError={handleError}
              />

              {currentJob.status === 'completed' && currentJob.result && (
                <>
                  <ResultViewer
                    result={currentJob.result}
                    jobId={currentJob.job_id}
                  />
                  <ExportPanel
                    jobId={currentJob.job_id}
                    filename={currentJob.filename}
                  />
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white/50 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-700">PaperAI</span>
            </div>
            <p className="text-xs text-gray-500">
              Built for Teachers | Extract text from question papers with accuracy
            </p>
          </div>
        </div>
      </footer>

      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  )
}
