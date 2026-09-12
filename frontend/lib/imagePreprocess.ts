export interface PreprocessedImage {
  canvas: HTMLCanvasElement
  originalCanvas: HTMLCanvasElement
  width: number
  height: number
}

export interface TextRegion {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Preprocess image for browser OCR while preserving the original pixels.
 * We keep two canvases:
 * - originalCanvas: resized RGB source used for recognition
 * - canvas: mild grayscale/contrast variant used for detection/retry
 *
 * Important: do NOT hard-binarize the source. Thin Devanagari matras and
 * handwriting strokes are easily destroyed by aggressive thresholding.
 */
export function preprocessImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): PreprocessedImage {
  let w = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  let h = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height

  // Give small notebook/page photos enough pixels for Devanagari recognition.
  const minH = 2400
  if (h < minH) {
    const scale = minH / h
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  // Keep browser memory under control on very large camera images.
  const maxDim = 4200
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const originalCanvas = document.createElement('canvas')
  originalCanvas.width = w
  originalCanvas.height = h
  const originalCtx = originalCanvas.getContext('2d')!
  originalCtx.imageSmoothingEnabled = true
  originalCtx.imageSmoothingQuality = 'high'
  originalCtx.drawImage(imageSource, 0, 0, w, h)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(originalCanvas, 0, 0)

  // Mild grayscale + clipped contrast stretch. This is intentionally much
  // gentler than binary thresholding so shirorekha/matras remain intact.
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const histogram = new Uint32Array(256)

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
    histogram[gray]++
  }

  const totalPixels = w * h
  const clip = Math.max(1, Math.floor(totalPixels * 0.005))
  let low = 0
  let high = 255
  let accum = 0

  for (let i = 0; i < 256; i++) {
    accum += histogram[i]
    if (accum > clip) {
      low = i
      break
    }
  }

  accum = 0
  for (let i = 255; i >= 0; i--) {
    accum += histogram[i]
    if (accum > clip) {
      high = i
      break
    }
  }

  const range = Math.max(high - low, 1)
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    const stretched = Math.min(255, Math.max(0, ((gray - low) / range) * 255))
    data[i] = stretched
    data[i + 1] = stretched
    data[i + 2] = stretched
  }

  ctx.putImageData(imageData, 0, 0)
  return { canvas, originalCanvas, width: w, height: h }
}

function longestDarkRunInRow(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  threshold = 170
): number {
  let longest = 0
  let current = 0

  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4
    const gray = data[idx]
    if (gray < threshold) {
      current++
      if (current > longest) longest = current
    } else {
      current = 0
    }
  }

  return longest
}

/**
 * Detect text lines using horizontal projection while suppressing notebook
 * ruling lines. Unlike the previous implementation, detected lines are NOT
 * vertically merged into giant OCR blocks.
 */
export function detectTextRegions(canvas: HTMLCanvasElement): TextRegion[] {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  const hProj = new Uint32Array(h)
  const ruleRows = new Uint8Array(h)

  for (let y = 0; y < h; y++) {
    let dark = 0
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (data[idx] < 175) dark++
    }
    hProj[y] = dark

    // Long almost-solid horizontal runs are usually notebook/table rules,
    // not text. Shirorekha is broken by word spaces and normally won't span
    // this much of the page in one uninterrupted run.
    if (dark > w * 0.42 && longestDarkRunInRow(data, w, y, 180) > w * 0.50) {
      ruleRows[y] = 1
    }
  }

  const active = new Uint8Array(h)
  const minInk = Math.max(6, Math.floor(w * 0.008))

  for (let y = 0; y < h; y++) {
    active[y] = hProj[y] > minInk && !ruleRows[y] ? 1 : 0
  }

  // Bridge tiny gaps (including a thin ruled row crossing handwriting) so a
  // single text line is not split into upper/lower fragments.
  const maxBridge = Math.max(2, Math.round(h / 1200))
  let y = 0
  while (y < h) {
    if (active[y]) {
      y++
      continue
    }
    const gapStart = y
    while (y < h && !active[y]) y++
    const gapEnd = y - 1
    const gap = gapEnd - gapStart + 1
    const hasBefore = gapStart > 0 && active[gapStart - 1]
    const hasAfter = y < h && active[y]
    if (hasBefore && hasAfter && gap <= maxBridge) {
      for (let gy = gapStart; gy <= gapEnd; gy++) active[gy] = 1
    }
  }

  const bands: { y1: number; y2: number }[] = []
  let inBand = false
  let start = 0

  for (let row = 0; row < h; row++) {
    if (active[row] && !inBand) {
      inBand = true
      start = row
    }

    if ((!active[row] || row === h - 1) && inBand) {
      const end = active[row] && row === h - 1 ? row + 1 : row
      inBand = false
      const bandH = end - start
      if (bandH >= Math.max(10, Math.round(h * 0.004)) && bandH <= h * 0.10) {
        bands.push({ y1: start, y2: end })
      }
    }
  }

  const regions: TextRegion[] = []

  for (const band of bands) {
    const bandH = band.y2 - band.y1
    const colInk = new Uint32Array(w)

    for (let x = 0; x < w; x++) {
      let count = 0
      for (let yy = band.y1; yy < band.y2; yy++) {
        const idx = (yy * w + x) * 4
        if (data[idx] < 175 && !ruleRows[yy]) count++
      }
      colInk[x] = count
    }

    const activeCols = new Uint8Array(w)
    const minColInk = Math.max(1, Math.floor(bandH * 0.06))
    for (let x = 0; x < w; x++) activeCols[x] = colInk[x] >= minColInk ? 1 : 0

    const rawSpans: { x1: number; x2: number }[] = []
    let inSpan = false
    let xStart = 0

    for (let x = 0; x < w; x++) {
      if (activeCols[x] && !inSpan) {
        inSpan = true
        xStart = x
      }
      if ((!activeCols[x] || x === w - 1) && inSpan) {
        const xEnd = activeCols[x] && x === w - 1 ? x + 1 : x
        inSpan = false
        if (xEnd - xStart >= 2) rawSpans.push({ x1: xStart, x2: xEnd })
      }
    }

    // Merge word-level gaps, but keep large column gaps separate.
    const gapLimit = Math.max(28, Math.round(w * 0.025))
    const spans: { x1: number; x2: number }[] = []
    for (const span of rawSpans) {
      const last = spans[spans.length - 1]
      if (last && span.x1 - last.x2 <= gapLimit) {
        last.x2 = span.x2
      } else {
        spans.push({ ...span })
      }
    }

    const usable = spans.filter(s => s.x2 - s.x1 >= Math.max(20, w * 0.04))
    const finalSpans = usable.length > 0 ? usable : spans

    for (const span of finalSpans) {
      const padX = Math.max(10, Math.min(30, Math.round((span.x2 - span.x1) * 0.025)))
      const padY = Math.max(8, Math.min(28, Math.round(bandH * 0.28)))
      const x1 = Math.max(0, span.x1 - padX)
      const y1 = Math.max(0, band.y1 - padY)
      const x2 = Math.min(w, span.x2 + padX)
      const y2 = Math.min(h, band.y2 + padY)

      if (x2 - x1 > 15 && y2 - y1 > 12) {
        regions.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      }
    }
  }

  // Reading order by row, then left-to-right. Keep geometry so the UI can
  // later reconstruct the exact page layout rather than relying on spaces.
  regions.sort((a, b) => {
    const rowTolerance = Math.max(8, Math.min(a.h, b.h) * 0.5)
    if (Math.abs(a.y - b.y) <= rowTolerance) return a.x - b.x
    return a.y - b.y
  })

  return regions.length > 0 ? regions : [{ x: 0, y: 0, w, h }]
}

export function cropRegion(
  canvas: HTMLCanvasElement,
  region: TextRegion
): HTMLCanvasElement {
  const crop = document.createElement('canvas')
  crop.width = Math.max(1, Math.round(region.w))
  crop.height = Math.max(1, Math.round(region.h))
  const ctx = crop.getContext('2d')!
  ctx.drawImage(
    canvas,
    region.x,
    region.y,
    region.w,
    region.h,
    0,
    0,
    crop.width,
    crop.height
  )
  return crop
}

/**
 * Create a retry variant that removes only very long horizontal runs.
 * This targets notebook/table rules while avoiding ordinary Devanagari
 * shirorekha, which is usually interrupted by word gaps.
 */
export function createDeruledVariant(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(source, 0, 0)

  const imageData = ctx.getImageData(0, 0, out.width, out.height)
  const data = imageData.data
  const w = out.width
  const h = out.height

  const rowsToClean: number[] = []
  for (let y = 0; y < h; y++) {
    const run = longestDarkRunInRow(data, w, y, 185)
    if (run > w * 0.55) rowsToClean.push(y)
  }

  for (const row of rowsToClean) {
    for (let yy = Math.max(0, row - 1); yy <= Math.min(h - 1, row + 1); yy++) {
      let runStart = -1
      for (let x = 0; x <= w; x++) {
        const isDark = x < w ? data[(yy * w + x) * 4] < 185 : false
        if (isDark && runStart < 0) runStart = x
        if ((!isDark || x === w) && runStart >= 0) {
          const runEnd = x
          if (runEnd - runStart > w * 0.45) {
            for (let rx = runStart; rx < runEnd; rx++) {
              const idx = (yy * w + rx) * 4
              data[idx] = 255
              data[idx + 1] = 255
              data[idx + 2] = 255
            }
          }
          runStart = -1
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return out
}
