import * as pdfjsLib from 'pdfjs-dist'

// Use CDN worker for Next.js compatibility
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`
}

export async function pdfToImages(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<HTMLCanvasElement[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const canvases: HTMLCanvasElement[] = []

  for (let i = 1; i <= numPages; i++) {
    onProgress?.(
      Math.round((i / numPages) * 30),
      `Rendering page ${i}/${numPages}...`
    )

    const page = await pdf.getPage(i)
    const scale = 2.0
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise

    canvases.push(canvas)
  }

  return canvases
}
