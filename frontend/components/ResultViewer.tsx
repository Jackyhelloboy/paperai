'use client'

import { useState } from 'react'

interface ResultViewerProps {
  result: any
  jobId: string
}

export default function ResultViewer({ result, jobId }: ResultViewerProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'details' | 'summary'>('text')
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const pages = result?.pages || []
  const summary = result?.confidence_summary || {}

  const getAllText = () => {
    return pages
      .map((page: any) =>
        page.regions
          ?.map((region: any) => region.text)
          .filter((text: string) => text?.trim())
          .join('\n')
      )
      .filter((text: string) => text?.trim())
      .join('\n\n')
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'verified':
      case 'high':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'low':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const tabs = [
    { id: 'text' as const, label: 'Text Output', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'details' as const, label: 'Details', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'summary' as const, label: 'Summary', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ]

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h3 className="text-xl font-bold text-gray-900">Extracted Text</h3>

        <div className="flex bg-gray-100 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'text' && (
        <div className="space-y-4 animate-in">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Click any section to copy</p>
            <button
              onClick={() => handleCopyText(getAllText())}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              {copiedText === getAllText() ? (
                <>
                  <svg className="w-3.5 h-3.5 mr-1 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy All
                </>
              )}
            </button>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 max-h-[500px] sm:max-h-[600px] overflow-y-auto scrollbar-thin">
            {pages.map((page: any, pageIndex: number) => (
              <div key={pageIndex} className="mb-6 last:mb-0">
                {pages.length > 1 && (
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 pb-2 border-b border-gray-200">
                    Page {page.page_number || pageIndex + 1}
                  </h4>
                )}
                {page.regions?.map((region: any, regionIndex: number) => (
                  <div
                    key={regionIndex}
                    onClick={() => handleCopyText(region.text)}
                    className={`
                      p-3 mb-2 rounded-xl cursor-pointer transition-all duration-200 border
                      hover:shadow-md active:scale-[0.99]
                      ${getConfidenceColor(region.confidence_level)}
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm whitespace-pre-wrap flex-1 leading-relaxed">{region.text}</p>
                      <span className="text-xs opacity-60 whitespace-nowrap font-medium">
                        {(region.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    {region.needs_review && (
                      <p className="text-xs mt-1.5 opacity-75 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        May need review
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'details' && (
        <div className="bg-gray-50 rounded-xl p-4 max-h-[500px] sm:max-h-[600px] overflow-y-auto scrollbar-thin animate-in">
          {pages.map((page: any, pageIndex: number) => (
            <div key={pageIndex} className="mb-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Page {page.page_number || pageIndex + 1}
              </h4>
              {page.regions?.map((region: any, regionIndex: number) => (
                <div key={regionIndex} className="bg-white rounded-xl p-4 mb-3 border border-gray-100 shadow-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                    <div>
                      <span className="text-gray-400 text-xs">Region</span>
                      <p className="font-semibold text-gray-900">#{regionIndex + 1}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Language</span>
                      <p className="font-semibold text-gray-900 uppercase">{region.detected_language}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Confidence</span>
                      <p className={`font-semibold ${
                        region.confidence >= 0.9 ? 'text-emerald-600' :
                        region.confidence >= 0.75 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {(region.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Level</span>
                      <p>
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${getConfidenceColor(region.confidence_level)}`}>
                          {region.confidence_level}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg text-sm font-mono">
                    <p className="whitespace-pre-wrap">{region.text}</p>
                  </div>

                  {region.has_math && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-md border border-purple-200 font-medium">
                        Math
                      </span>
                      {region.critical_tokens?.length > 0 && (
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-md border border-orange-200 font-medium">
                          {region.critical_tokens.length} critical tokens
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="space-y-6 animate-in">
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Regions', value: summary.total_regions || 0, color: 'blue' },
              { label: 'Verified', value: summary.verified || 0, color: 'emerald' },
              { label: 'High', value: summary.high_confidence || 0, color: 'emerald' },
              { label: 'Medium', value: summary.medium_confidence || 0, color: 'amber' },
              { label: 'Low', value: summary.low_confidence || 0, color: 'red' },
              { label: 'Rate', value: `${((summary.verification_rate || 0) * 100).toFixed(1)}%`, color: 'purple' },
            ].map((stat) => (
              <div key={stat.label} className={`bg-${stat.color}-50 rounded-xl p-3 sm:p-4 text-center border border-${stat.color}-100`}>
                <div className={`text-xl sm:text-2xl font-bold text-${stat.color}-600`}>{stat.value}</div>
                <div className={`text-xs text-${stat.color}-800 mt-0.5`}>{stat.label}</div>
              </div>
            ))}
          </div>

          {result?.metadata && (
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="font-semibold text-gray-900 mb-3 text-sm">Processing Metadata</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Source File</span>
                  <span className="font-medium text-gray-900 truncate ml-2">{result.metadata.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Processed At</span>
                  <span className="font-medium text-gray-900">{new Date(result.metadata.processed_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Regions</span>
                  <span className="font-medium text-gray-900">{result.metadata.total_regions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Languages</span>
                  <span className="font-medium text-gray-900">{result.metadata.languages_detected?.join(', ').toUpperCase()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
