'use client'

import { useEffect, useRef, useState } from 'react'

const PING_INTERVAL = 14 * 60 * 1000 // 14 minutes (Render sleeps after 15)

export default function useKeepAlive() {
  const [alive, setAlive] = useState<boolean | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

  const ping = async () => {
    if (!API_BASE_URL) return
    try {
      const res = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        cache: 'no-store',
      })
      setAlive(res.ok)
    } catch {
      setAlive(false)
    }
  }

  useEffect(() => {
    if (!API_BASE_URL) return

    // Ping immediately on mount
    ping()

    // Then ping every 14 minutes
    intervalRef.current = setInterval(ping, PING_INTERVAL)

    // Also ping when tab becomes visible again (user may have been away)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        ping()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Ping on focus
    const handleFocus = () => ping()
    window.addEventListener('focus', handleFocus)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [API_BASE_URL])

  return alive
}
