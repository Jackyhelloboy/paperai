export interface PreprocessedImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/**
 * Preprocess image for OCR - optimized for handwritten Hindi text.
 * Less aggressive than before to preserve handwriting details.
 */
export function preprocessImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): PreprocessedImage {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const w = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  const h = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height

  // Upscale small images for better OCR
  const scale = w < 1000 ? 2 : 1
  canvas.width = w * scale
  canvas.height = h * scale

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Convert to grayscale
  const gray = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  }

  // Gentle contrast enhancement (less aggressive for handwriting)
  let minVal = 255
  let maxVal = 0
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] > 10 && gray[i] < minVal) minVal = gray[i]
    if (gray[i] < 245 && gray[i] > maxVal) maxVal = gray[i]
  }

  // Simple contrast stretch
  const range = maxVal - minVal
  if (range > 50) {
    for (let i = 0; i < gray.length; i++) {
      const normalized = ((gray[i] - minVal) / range * 255) | 0
      gray[i] = Math.min(255, Math.max(0, normalized))
    }
  }

  // Write back
  for (let i = 0; i < gray.length; i++) {
    data[i * 4] = gray[i]
    data[i * 4 + 1] = gray[i]
    data[i * 4 + 2] = gray[i]
  }

  ctx.putImageData(imageData, 0, 0)
  return { canvas, width: canvas.width, height: canvas.height }
}

function estimateBackground(gray: Uint8Array, w: number, h: number): Uint8Array {
  const blockSize = 32
  const bg = new Uint8Array(w * h)

  for (let by = 0; by < h; by += blockSize) {
    for (let bx = 0; bx < w; bx += blockSize) {
      let sum = 0
      let count = 0
      const maxY = Math.min(by + blockSize, h)
      const maxX = Math.min(bx + blockSize, w)
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          sum += gray[y * w + x]
          count++
        }
      }
      const avg = (sum / count) || 255
      for (let y = by; y < maxY; y++) {
        for (let x = bx; x < maxX; x++) {
          bg[y * w + x] = avg
        }
      }
    }
  }
  return bg
}

/**
 * Detect individual text lines using horizontal projection.
 * Optimized for handwritten Hindi text on lined paper.
 */
export function detectTextRegions(
  canvas: HTMLCanvasElement
): { x: number; y: number; w: number; h: number }[] {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  const gray = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  }

  // Horizontal projection
  const hProj = new Uint32Array(h)
  for (let y = 0; y < h; y++) {
    let count = 0
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] < 140) count++
    }
    hProj[y] = count
  }

  // Adaptive threshold - HIGHER to avoid noise detection
  let maxProj = 0
  for (let y = 0; y < h; y++) {
    if (hProj[y] > maxProj) maxProj = hProj[y]
  }
  const threshold = Math.max(maxProj * 0.08, w * 0.01)

  const lines: { start: number; end: number }[] = []
  let inLine = false
  let lineStart = 0

  for (let y = 0; y < h; y++) {
    if (hProj[y] > threshold && !inLine) {
      inLine = true
      lineStart = y
    } else if ((hProj[y] <= threshold || y === h - 1) && inLine) {
      inLine = false
      const lineH = y - lineStart
      if (lineH > 15) {  // Only lines taller than 15px (skip noise)
        lines.push({ start: lineStart, end: y })
      }
    }
  }

  // Merge lines that are very close together (< 5px gap)
  const merged: { start: number; end: number }[] = []
  for (const line of lines) {
    if (merged.length > 0 && line.start - merged[merged.length - 1].end < 5) {
      merged[merged.length - 1].end = line.end
    } else {
      merged.push({ ...line })
    }
  }

  const regions: { x: number; y: number; w: number; h: number }[] = []

  for (const line of merged) {
    let minX = w, maxX = 0

    for (let y = line.start; y < line.end; y++) {
      for (let x = 0; x < w; x++) {
        if (gray[y * w + x] < 140) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }
    }

    if (maxX <= minX) continue

    const lineH = line.end - line.start
    const padY = Math.max(lineH * 0.5, 20)  // More padding for Devanagari
    const padX = 20

    regions.push({
      x: Math.max(0, minX - padX),
      y: Math.max(0, line.start - padY),
      w: Math.min(w, maxX - minX + padX * 2),
      h: Math.min(h - Math.max(0, line.start - padY), lineH + padY * 2),
    })
  }

  return regions.length > 0 ? regions : [{ x: 0, y: 0, w, h }]
}

/**
 * Crop region with padding for Devanagari.
 */
export function cropRegion(
  canvas: HTMLCanvasElement,
  region: { x: number; y: number; w: number; h: number },
  padding: { x?: number; y?: number } = {}
): HTMLCanvasElement {
  const padX = padding.x || 10
  const padY = padding.y || 15

  const crop = document.createElement('canvas')
  crop.width = region.w + padX * 2
  crop.height = region.h + padY * 2

  const ctx = crop.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, crop.width, crop.height)

  ctx.drawImage(
    canvas,
    region.x - padX, region.y - padY,
    region.w + padX * 2, region.h + padY * 2,
    0, 0,
    crop.width, crop.height
  )

  return crop
}
