'use client'

import useKeepAlive from '../hooks/useKeepAlive'

export default function KeepAliveIndicator() {
  const alive = useKeepAlive()

  if (alive === null) return null

  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border backdrop-blur-sm transition-colors duration-300"
      style={{
        background: alive ? 'rgba(236, 253, 245, 0.9)' : 'rgba(254, 226, 226, 0.9)',
        borderColor: alive ? 'rgba(134, 239, 172, 0.5)' : 'rgba(252, 165, 165, 0.5)',
        color: alive ? '#166534' : '#991b1b'
      }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${alive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
      {alive ? 'Connected' : 'Offline'}
    </div>
  )
}
