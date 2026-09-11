'use client'

import { useState, useCallback } from 'react'
import { processImage, ProcessResult } from '../lib/processImage'

export interface ProcessingState {
  status: 'idle' | 'preprocessing' | 'ocr' | 'completed' | 'failed'
  progress: number
  message: string
  result: ProcessResult | null
  error: string | null
  processingTime: number
}

export function useOCRProcessing() {
  const [state, setState] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
    message: '',
    result: null,
    error: null,
    processingTime: 0,
  })

  const process = useCallback(async (file: File) => {
    setState({
      status: 'preprocessing',
      progress: 0,
      message: 'Starting...',
      result: null,
      error: null,
      processingTime: 0,
    })

    try {
      const result = await processImage(file, (progress, message) => {
        setState(prev => ({
          ...prev,
          progress,
          message,
          status: progress < 30 ? 'preprocessing' : 'ocr',
        }))
      })

      setState({
        status: 'completed',
        progress: 100,
        message: 'Processing complete!',
        result,
        error: null,
        processingTime: result.metadata.processingTime,
      })
    } catch (error: any) {
      setState({
        status: 'failed',
        progress: 0,
        message: '',
        result: null,
        error: error.message || 'Processing failed',
        processingTime: 0,
      })
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: 0,
      message: '',
      result: null,
      error: null,
      processingTime: 0,
    })
  }, [])

  return { ...state, process, reset }
}
