export interface PreprocessedImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/**
 * Preprocess image for Hindi OCR.
 * Key: upscale to high resolution, grayscale + contrast, NO binarization.
 */
export function preprocessImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): PreprocessedImage {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  let w = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  let h = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height

  // Upscale to at least 2500px height for Devanagari OCR accuracy
  const minH = 2500
  if (h < minH) {
    const scale = minH / h
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  // Cap at 4000 to avoid memory issues
  const maxDim = 4000
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  canvas.width = w
  canvas.height = h

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imageSource, 0, 0, w, h)

  // Grayscale + contrast enhancement (no binarization - Tesseract works better with grayscale)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Calculate histogram for adaptive contrast
  const histogram = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
    histogram[gray]++
  }

  // Find histogram bounds (ignore top/bottom 1%)
  const totalPixels = w * h
  const clip = Math.floor(totalPixels * 0.01)
  let low = 0, high = 255
  let accum = 0
  for (let i = 0; i < 256; i++) {
    accum += histogram[i]
    if (accum > clip) { low = i; break }
  }
  accum = 0
  for (let i = 255; i >= 0; i--) {
    accum += histogram[i]
    if (accum > clip) { high = i; break }
  }

  // Stretch contrast
  const range = Math.max(high - low, 1)
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    const stretched = Math.min(255, Math.max(0, ((gray - low) / range) * 255))
    // Slight sharpening: boost contrast around midpoint
    const enhanced = stretched > 128
      ? Math.min(255, stretched * 1.1)
      : Math.max(0, stretched * 0.9)
    data[i] = enhanced
    data[i + 1] = enhanced
    data[i + 2] = enhanced
  }

  ctx.putImageData(imageData, 0, 0)
  return { canvas, width: w, height: h }
}

/**
 * Detect text lines using horizontal projection
 */
export function detectTextRegions(
  canvas: HTMLCanvasElement
): { x: number; y: number; w: number; h: number }[] {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  // Horizontal projection
  const hProj = new Uint32Array(h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (data[idx] < 160) hProj[y]++
    }
  }

  const threshold = w * 0.02
  const regions: { x: number; y: number; w: number; h: number }[] = []
  let inLine = false
  let lineStart = 0

  for (let y = 0; y < h; y++) {
    if (hProj[y] > threshold && !inLine) {
      inLine = true
      lineStart = y
    } else if ((hProj[y] <= threshold || y === h - 1) && inLine) {
      inLine = false
      const lineH = y - lineStart
      if (lineH > 10) {
        let minX = w, maxX = 0
        for (let ly = lineStart; ly < y; ly++) {
          for (let x = 0; x < w; x++) {
            const idx = (ly * w + x) * 4
            if (data[idx] < 160) {
              minX = Math.min(minX, x)
              maxX = Math.max(maxX, x)
            }
          }
        }
        if (maxX > minX) {
          regions.push({
            x: Math.max(0, minX - 10),
            y: Math.max(0, lineStart - 15),
            w: Math.min(w, maxX - minX + 20),
            h: Math.min(h - lineStart, lineH + 30),
          })
        }
      }
    }
  }

  const merged: typeof regions = []
  for (const r of regions) {
    const last = merged[merged.length - 1]
    if (last && r.y - (last.y + last.h) < 20) {
      last.h = r.y + r.h - last.y
      last.w = Math.max(last.w, r.x + r.w - last.x)
      last.x = Math.min(last.x, r.x)
    } else {
      merged.push({ ...r })
    }
  }

  return merged.length > 0 ? merged : [{ x: 0, y: 0, w, h }]
}

export function cropRegion(
  canvas: HTMLCanvasElement,
  region: { x: number; y: number; w: number; h: number }
): HTMLCanvasElement {
  const crop = document.createElement('canvas')
  crop.width = region.w
  crop.height = region.h
  const ctx = crop.getContext('2d')!
  ctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)
  return crop
}
