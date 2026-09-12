'use client'

import { useEffect } from 'react'

export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Use build timestamp as cache buster - changes on every deploy
      const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || Date.now().toString()
      const swUrl = `/sw.js?v=${buildVersion}`

      navigator.serviceWorker.register(swUrl).then(
        (reg) => {
          // Check for updates every 5 minutes
          setInterval(() => reg.update(), 5 * 60 * 1000)
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
