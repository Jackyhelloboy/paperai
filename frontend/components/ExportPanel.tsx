'use client'

import { useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'

interface ExportPanelProps {
  jobId: string
  filename: string
}

export default function ExportPanel({ jobId, filename }: ExportPanelProps) {
  const [exporting, setExporting] = useState<string | null>(null)
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const handleExport = async (formatType: string) => {
    setExporting(formatType)
    try {
      const response = await axios.get(`${API_BASE_URL}/api/export/${jobId}/${formatType}`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const baseName = filename.replace(/\.[^/.]+$/, '')
      link.setAttribute('download', `${baseName}.${formatType}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success(`Exported as ${formatType.toUpperCase()} successfully!`)
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Export failed'
      toast.error(errorMessage)
    } finally {
      setExporting(null)
    }
  }

  const formats = [
    { type: 'txt', label: 'Text File', desc: 'Plain text, easy to copy', gradient: 'from-gray-50 to-gray-100', iconBg: 'bg-gray-100 text-gray-600', border: 'border-gray-200 hover:border-gray-300' },
    { type: 'docx', label: 'Word Document', desc: 'Formatted for editing', gradient: 'from-blue-50 to-blue-100', iconBg: 'bg-blue-100 text-blue-600', border: 'border-blue-200 hover:border-blue-300' },
    { type: 'pdf', label: 'PDF Document', desc: 'Portable for printing', gradient: 'from-red-50 to-red-100', iconBg: 'bg-red-100 text-red-600', border: 'border-red-200 hover:border-red-300' },
  ]

  return (
    <div className="card">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900">Export Options</h3>
        <p className="text-gray-500 text-sm mt-1">Download your extracted text in your preferred format</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {formats.map((f) => (
          <button
            key={f.type}
            onClick={() => handleExport(f.type)}
            disabled={exporting !== null}
            className={`relative p-5 rounded-xl border-2 text-left transition-all duration-200 bg-gradient-to-br ${f.gradient} ${f.border} ${exporting === f.type ? 'opacity-60 cursor-wait' : 'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]'} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className={`w-12 h-12 rounded-xl ${f.iconBg} flex items-center justify-center mb-3`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h4 className="font-semibold text-gray-900 mb-0.5">{f.label}</h4>
            <p className="text-xs text-gray-500">{f.desc}</p>
            {exporting === f.type && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl backdrop-blur-sm">
                <svg className="animate-spin h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
