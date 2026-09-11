export interface PreprocessedImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

export function preprocessImage(imageSource: HTMLImageElement | HTMLCanvasElement): PreprocessedImage {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const maxDim = 1500
  let w = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  let h = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height

  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  canvas.width = w
  canvas.height = h
  ctx.drawImage(imageSource, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Grayscale + contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    // Adaptive threshold-like contrast boost
    const enhanced = gray > 127 ? Math.min(255, gray * 1.2) : Math.max(0, gray * 0.8)
    data[i] = enhanced
    data[i + 1] = enhanced
    data[i + 2] = enhanced
  }

  ctx.putImageData(imageData, 0, 0)
  return { canvas, width: w, height: h }
}

export function detectTextRegions(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number }[] {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  // Simple projection-based text line detection
  const binary = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    binary[i / 4] = data[i] < 140 ? 1 : 0
  }

  // Horizontal projection
  const hProj = new Uint16Array(h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      hProj[y] += binary[y * w + x]
    }
  }

  // Find text lines (rows with enough dark pixels)
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
      if (lineH > 8) {
        // Find horizontal extent of this line
        let minX = w, maxX = 0
        for (let ly = lineStart; ly < y; ly++) {
          for (let x = 0; x < w; x++) {
            if (binary[ly * w + x]) {
              minX = Math.min(minX, x)
              maxX = Math.max(maxX, x)
            }
          }
        }
        if (maxX > minX) {
          regions.push({
            x: Math.max(0, minX - 5),
            y: Math.max(0, lineStart - 5),
            w: Math.min(w, maxX - minX + 10),
            h: Math.min(h - lineStart, lineH + 10)
          })
        }
      }
    }
  }

  // Merge nearby regions
  const merged: typeof regions = []
  for (const r of regions) {
    const last = merged[merged.length - 1]
    if (last && r.y - (last.y + last.h) < 15) {
      last.h = r.y + r.h - last.y
      last.w = Math.max(last.w, r.x + r.w - last.x)
      last.x = Math.min(last.x, r.x)
    } else {
      merged.push({ ...r })
    }
  }

  return merged.length > 0 ? merged : [{ x: 0, y: 0, w, h }]
}

export function cropRegion(canvas: HTMLCanvasElement, region: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const crop = document.createElement('canvas')
  crop.width = region.w
  crop.height = region.h
  const ctx = crop.getContext('2d')!
  ctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)
  return crop
}
