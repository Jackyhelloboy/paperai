import Header from '../../components/Header'
import Link from 'next/link'

export const metadata = {
  title: 'Features - PaperAI',
  description: 'Explore the powerful features of PaperAI question paper OCR system',
}

export default function FeaturesPage() {
  const features = [
    {
      title: 'Multi-Language OCR',
      description: 'Advanced OCR engine supports Hindi, Telugu, English, and Mathematics with industry-leading accuracy.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
      ),
      color: 'from-primary-50 to-primary-100 text-primary-600 dark:from-primary-900/30 dark:to-primary-800/30 dark:text-primary-400',
    },
    {
      title: 'Math Expression Preservation',
      description: 'Special handling for mathematical expressions, equations, and scientific notation to maintain accuracy.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: 'from-purple-50 to-purple-100 text-purple-600 dark:from-purple-900/30 dark:to-purple-800/30 dark:text-purple-400',
    },
    {
      title: 'Smart Layout Detection',
      description: 'Automatically detects document layout, question boundaries, and answer regions for structured output.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
      color: 'from-emerald-50 to-emerald-100 text-emerald-600 dark:from-emerald-900/30 dark:to-emerald-800/30 dark:text-emerald-400',
    },
    {
      title: 'Confidence Scoring',
      description: 'Every extracted text region gets a confidence score so you know exactly what needs review.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-amber-50 to-amber-100 text-amber-600 dark:from-amber-900/30 dark:to-amber-800/30 dark:text-amber-400',
    },
    {
      title: 'Multiple Export Formats',
      description: 'Export extracted text as TXT, HTML, or Markdown documents for easy sharing and editing.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'from-rose-50 to-rose-100 text-rose-600 dark:from-rose-900/30 dark:to-rose-800/30 dark:text-rose-400',
    },
    {
      title: 'Image Preprocessing',
      description: 'Automatic image enhancement, rotation correction, and noise reduction for better OCR results.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      color: 'from-cyan-50 to-cyan-100 text-cyan-600 dark:from-cyan-900/30 dark:to-cyan-800/30 dark:text-cyan-400',
    },
    {
      title: 'Dark Mode',
      description: 'Full dark mode support with system preference detection for comfortable use in any lighting.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
      color: 'from-indigo-50 to-indigo-100 text-indigo-600 dark:from-indigo-900/30 dark:to-indigo-800/30 dark:text-indigo-400',
    },
    {
      title: 'Keyboard Shortcuts',
      description: 'Press Ctrl+V to paste images, Ctrl+S to download, Ctrl+E to edit. Fast workflow for power users.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      color: 'from-pink-50 to-pink-100 text-pink-600 dark:from-pink-900/30 dark:to-pink-800/30 dark:text-pink-400',
    },
    {
      title: 'Offline Support',
      description: 'Works completely offline after first visit. Your data never leaves your device.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: 'from-orange-50 to-orange-100 text-orange-600 dark:from-orange-900/30 dark:to-orange-800/30 dark:text-orange-400',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Header />
      <main className="flex-1">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-200/20 dark:bg-primary-800/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-200/20 dark:bg-accent-800/10 rounded-full blur-3xl"></div>
          </div>
          <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 max-w-6xl">
            <div className="text-center mb-16 animate-in">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                Powerful Features
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto">
                Everything you need to extract, validate, and export text from question papers
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="card-hover animate-in"
                  style={{ animationDelay: `${index * 75}ms` }}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}>
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-16">
              <Link href="/" className="btn-primary">
                Try It Now
                <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
