'use client'

import { useEffect } from 'react'

export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (reg) => {
          console.log('Service Worker registered:', reg.scope)
        },
        (err) => {
          console.log('Service Worker registration failed:', err)
        }
      )
    }
  }, [])

  return null
}
