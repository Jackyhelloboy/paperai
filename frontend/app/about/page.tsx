import Header from '../../components/Header'
import Link from 'next/link'

export const metadata = {
  title: 'About - PaperAI',
  description: 'Learn about PaperAI and its mission to help teachers extract text from question papers',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Header />
      <main className="flex-1">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-200/20 dark:bg-primary-800/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-200/20 dark:bg-accent-800/10 rounded-full blur-3xl"></div>
          </div>
          <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 max-w-4xl">
            <div className="text-center mb-16 animate-in">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                About PaperAI
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto">
                Built for teachers, by developers who care about education
              </p>
            </div>

            <div className="space-y-8">
              <div className="card animate-in delay-75">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Our Mission</h2>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  PaperAI was created to help teachers and educators digitize question papers quickly and accurately.
                  We understand the challenges of manually typing out questions from scanned papers, especially when
                  they contain multiple languages and mathematical expressions. Our AI-powered OCR engine handles
                  all of this automatically.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div className="card animate-in delay-100">
                  <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Innovation</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Using cutting-edge AI and OCR technology to deliver the best possible text extraction results.
                  </p>
                </div>

                <div className="card animate-in delay-150">
                  <div className="w-12 h-12 bg-accent-100 dark:bg-accent-900/30 rounded-xl flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-accent-600 dark:text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Education First</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Designed specifically for the education sector, understanding the unique needs of teachers.
                  </p>
                </div>
              </div>

              <div className="card animate-in delay-200">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Technology</h2>
                <div className="space-y-3 text-gray-600 dark:text-gray-400">
                  <p className="leading-relaxed">
                    PaperAI leverages multiple OCR engines and AI models to deliver accurate results:
                  </p>
                  <ul className="space-y-2 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary-500 mt-1">&#x2022;</span>
                      <span>Tesseract.js v5 with LSTM for primary text recognition</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-500 mt-1">&#x2022;</span>
                      <span>Multi-resolution processing (1x, 1.5x, 2x)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-500 mt-1">&#x2022;</span>
                      <span>Adaptive image preprocessing with local thresholding</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-500 mt-1">&#x2022;</span>
                      <span>Hindi and Telugu post-processing with dictionary correction</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-500 mt-1">&#x2022;</span>
                      <span>Service Worker for offline PWA support</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary-500 mt-1">&#x2022;</span>
                      <span>Confidence scoring for result validation</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="card animate-in delay-200">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Performance</h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">100%</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Client-Side</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">No server needed</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">3</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Languages</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">Hindi, Telugu, English</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-accent-600 dark:text-accent-400">&lt;5s</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Processing</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">Average time</div>
                  </div>
                </div>
              </div>

              <div className="text-center mt-8">
                <Link href="/" className="btn-primary">
                  Start Extracting Text
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
