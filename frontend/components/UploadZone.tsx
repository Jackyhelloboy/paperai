'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { toast } from 'react-toastify'

interface UploadZoneProps {
  onUploadSuccess: (jobId: string, filename: string) => void
  onError: (error: string) => void
}

export default function UploadZone({ onUploadSuccess, onError }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    const maxSize = 50 * 1024 * 1024

    if (file.size > maxSize) {
      onError('File too large. Maximum size is 50MB.')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
          }
        },
      })

      const { job_id, filename } = response.data
      toast.success('File uploaded successfully!')
      onUploadSuccess(job_id, filename)
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Upload failed. Please try again.'
      onError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [onUploadSuccess, onError, API_BASE_URL])

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tiff', '.tif'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer
          transition-all duration-300 ease-in-out group
          ${isDragActive && !isDragReject
            ? 'border-primary-500 bg-primary-50/50 scale-[1.02] shadow-glow'
            : ''
          }
          ${isDragReject ? 'border-red-400 bg-red-50/50' : ''}
          ${!isDragActive && !isDragReject
            ? 'border-gray-200 hover:border-primary-300 hover:bg-gray-50/50 hover:shadow-card'
            : ''
          }
          ${uploading ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="space-y-5 animate-in">
            <div className="w-16 h-16 mx-auto relative">
              <div className="absolute inset-0 rounded-full border-4 border-primary-100"></div>
              <svg className="animate-spin w-full h-full text-primary-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">Uploading your file...</p>
              <p className="text-sm text-gray-500 mt-1">Please wait while we process your upload</p>
            </div>
            <div className="w-full max-w-xs mx-auto">
              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary-500 to-accent-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2 font-medium">{uploadProgress}%</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg
                className="w-8 h-8 text-primary-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div>
              <p className="text-lg font-semibold text-gray-900">
                {isDragActive && !isDragReject
                  ? 'Drop your file here...'
                  : isDragReject
                  ? 'File type not supported'
                  : 'Drag & drop your question paper'}
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                or <span className="text-primary-600 font-medium">click to browse</span> files
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {['PDF', 'JPG', 'PNG', 'BMP', 'TIFF', 'WebP'].map((type) => (
                <span
                  key={type}
                  className="px-3 py-1 bg-gray-100/80 text-gray-600 text-xs font-medium rounded-full border border-gray-200/50"
                >
                  {type}
                </span>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              Maximum file size: 50MB
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
