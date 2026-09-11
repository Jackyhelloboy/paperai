export interface PreprocessedImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

export function preprocessImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): PreprocessedImage {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const maxDim = 2000
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

  // Step 1: Grayscale
  const gray = new Float32Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }

  // Step 2: Adaptive thresholding (better for mixed fonts in Hindi)
  const binary = adaptiveThreshold(gray, w, h)

  // Step 3: Enhance contrast specifically for Devanagari
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4
    const val = binary[idx] * 255
    data[i] = val
    data[i + 1] = val
    data[i + 2] = val
  }

  ctx.putImageData(imageData, 0, 0)

  // Step 4: Slight sharpening to preserve matras (horizontal connecting lines)
  applySharpen(ctx, w, h)

  return { canvas, width: w, height: h }
}

function adaptiveThreshold(gray: Float32Array, w: number, h: number): Uint8Array {
  const binary = new Uint8Array(w * h)
  const blockSize = 15
  const c = 10

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0

      const x0 = Math.max(0, x - blockSize)
      const y0 = Math.max(0, y - blockSize)
      const x1 = Math.min(w - 1, x + blockSize)
      const y1 = Math.min(h - 1, y + blockSize)

      for (let ky = y0; ky <= y1; ky++) {
        for (let kx = x0; kx <= x1; kx++) {
          sum += gray[ky * w + kx]
          count++
        }
      }

      const mean = sum / count
      binary[y * w + x] = gray[y * w + x] > mean - c ? 0 : 1
    }
  }

  return binary
}

function applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Simple unsharp mask - strengthens edges (helps preserve Devanagari matras)
  const kernel = [
    0, -0.5, 0,
    -0.5, 3, -0.5,
    0, -0.5, 0
  ]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let val = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * w + (x + kx)) * 4
          val += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)]
        }
      }
      const idx = (y * w + x) * 4
      data[idx] = Math.min(255, Math.max(0, val))
      data[idx + 1] = data[idx]
      data[idx + 2] = data[idx]
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

export function detectTextRegions(
  canvas: HTMLCanvasElement
): { x: number; y: number; w: number; h: number }[] {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  const binary = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i += 4) {
    binary[i / 4] = data[i] < 128 ? 1 : 0
  }

  // Horizontal projection for line detection (important for Hindi with matras)
  const hProj = new Uint16Array(h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      hProj[y] += binary[y * w + x]
    }
  }

  const threshold = w * 0.015
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
      if (lineH > 6) {
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
            y: Math.max(0, lineStart - 10),
            w: Math.min(w, maxX - minX + 10),
            h: Math.min(h - lineStart, lineH + 20)
          })
        }
      }
    }
  }

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
