'use client'

export function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="skeleton w-12 h-12 rounded-xl mb-4" />
      <div className="skeleton w-3/4 h-4 rounded mb-2" />
      <div className="skeleton w-full h-3 rounded" />
    </div>
  )
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-3 rounded"
          style={{ width: `${85 - i * 15}%` }}
        />
      ))}
    </div>
  )
}

export function SkeletonUpload() {
  return (
    <div className="w-full h-64 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl animate-pulse flex items-center justify-center">
      <div className="text-center">
        <div className="skeleton w-10 h-10 rounded-xl mx-auto mb-3" />
        <div className="skeleton w-40 h-4 rounded mx-auto mb-2" />
        <div className="skeleton w-28 h-3 rounded mx-auto" />
      </div>
    </div>
  )
}

export function SkeletonResult() {
  return (
    <div className="space-y-4">
      <div className="card animate-pulse">
        <div className="skeleton w-32 h-5 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="text-center">
              <div className="skeleton w-16 h-8 rounded mx-auto mb-2" />
              <div className="skeleton w-20 h-3 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="card animate-pulse">
        <div className="skeleton w-24 h-5 rounded mb-4" />
        <div className="skeleton w-full h-48 rounded-lg" />
      </div>
    </div>
  )
}
