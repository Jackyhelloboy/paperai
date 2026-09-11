export interface PreprocessedImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/**
 * Preprocess image for Hindi OCR.
 * Key: upscale to 3000px height, strong binarization, preserve Devanagari matras.
 */
export function preprocessImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): PreprocessedImage {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  let w = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  let h = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height

  // Upscale to at least 3000px height for Devanagari OCR accuracy
  const minDim = 3000
  if (h < minDim) {
    const scale = minDim / h
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  // Also cap at 4000 to avoid memory issues
  const maxDim = 4000
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  canvas.width = w
  canvas.height = h

  // Use high-quality scaling
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imageSource, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Step 1: Convert to grayscale
  const gray = new Float32Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }

  // Step 2: Otsu's thresholding for clean binarization
  const threshold = otsuThreshold(gray)
  for (let i = 0; i < data.length; i += 4) {
    const val = gray[i / 4] < threshold ? 0 : 255
    data[i] = val
    data[i + 1] = val
    data[i + 2] = val
  }

  ctx.putImageData(imageData, 0, 0)
  return { canvas, width: w, height: h }
}

/**
 * Otsu's method for finding optimal binarization threshold
 */
function otsuThreshold(gray: Float32Array): number {
  const histogram = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) {
    const val = Math.min(255, Math.max(0, Math.round(gray[i])))
    histogram[val]++
  }

  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]

  let sumB = 0
  let wB = 0
  let maxVariance = 0
  let threshold = 128

  for (let i = 0; i < 256; i++) {
    wB += histogram[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break

    sumB += i * histogram[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) * (mB - mF)

    if (variance > maxVariance) {
      maxVariance = variance
      threshold = i
    }
  }

  return threshold
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
      if (data[idx] < 128) hProj[y]++
    }
  }

  // Find text lines
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
            if (data[idx] < 128) {
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

  // Merge nearby regions (within 20px)
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
