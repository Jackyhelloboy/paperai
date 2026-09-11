'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'

interface Job {
  job_id: string
  filename: string
  status: 'uploaded' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  result?: any
}

interface ProcessingStatusProps {
  job: Job
  onComplete: (result: any) => void
  onError: (error: string) => void
}

export default function ProcessingStatus({ job, onComplete, onError }: ProcessingStatusProps) {
  const [currentJob, setCurrentJob] = useState(job)
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (currentJob.status === 'uploaded') {
      startProcessing()
    }
  }, [])

  useEffect(() => {
    if (currentJob.status === 'processing') {
      const interval = setInterval(checkStatus, 1000)
      return () => clearInterval(interval)
    }
  }, [currentJob.status])

  const startProcessing = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/process/${currentJob.job_id}`)
      setCurrentJob(prev => ({ ...prev, status: 'processing', message: 'Starting processing...' }))
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to start processing'
      onError(errorMessage)
    }
  }

  const checkStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/status/${currentJob.job_id}`)
      const data = response.data

      setCurrentJob(prev => ({
        ...prev,
        status: data.status,
        progress: data.progress || 0,
        message: data.message || ''
      }))

      if (data.status === 'completed') {
        const resultResponse = await axios.get(`${API_BASE_URL}/api/result/${currentJob.job_id}`)
        onComplete(resultResponse.data)
      } else if (data.status === 'failed') {
        onError(data.error || 'Processing failed')
      }
    } catch (error) {
      console.error('Status check failed:', error)
    }
  }

  const steps = [
    { label: 'Uploaded', threshold: 0, icon: 'upload' },
    { label: 'Loading', threshold: 5, icon: 'search' },
    { label: 'Regions', threshold: 15, icon: 'grid' },
    { label: 'OCR', threshold: 30, icon: 'text' },
    { label: 'Done', threshold: 95, icon: 'done' },
  ]

  const getStepIcon = (icon: string) => {
    const icons: Record<string, JSX.Element> = {
      upload: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
      search: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
      chart: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
      grid: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
      language: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>,
      text: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      math: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
      check: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      score: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
      done: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
    }
    return icons[icon] || icons.check
  }

  return (
    <div className="card">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Processing Progress</h3>
          <span className="text-sm font-medium text-primary-600 bg-primary-50 px-2.5 py-0.5 rounded-full">
            {currentJob.progress}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-primary-500 to-accent-500 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${currentJob.progress}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-500 mt-2">{currentJob.message}</p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {steps.map((step, index) => {
          const isActive =
            currentJob.progress >= step.threshold &&
            (index === steps.length - 1 || currentJob.progress < steps[index + 1].threshold)
          const isCompleted =
            currentJob.progress > step.threshold ||
            (index < steps.length - 1 && currentJob.progress >= steps[index + 1].threshold)

          return (
            <div
              key={step.label}
              className={`
                relative p-2 sm:p-3 rounded-xl border text-center transition-all duration-300
                ${isCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}
                ${isActive ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-100' : ''}
                ${!isCompleted && !isActive ? 'bg-gray-50 border-gray-100 text-gray-400' : ''}
              `}
            >
              <div className={`w-7 h-7 mx-auto rounded-lg flex items-center justify-center mb-1 ${
                isCompleted ? 'bg-emerald-100' : isActive ? 'bg-primary-100' : 'bg-gray-100'
              }`}>
                {isCompleted ? (
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <svg className="animate-spin w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <span className="text-gray-400">{getStepIcon(step.icon)}</span>
                )}
              </div>
              <div className="text-[10px] sm:text-xs font-medium hidden sm:block">{step.label}</div>
            </div>
          )
        })}
      </div>

      {currentJob.status === 'failed' && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-800 font-medium">Processing Failed</p>
          </div>
          <p className="text-red-600 text-sm mt-1 ml-7">{currentJob.message}</p>
        </div>
      )}
    </div>
  )
}
