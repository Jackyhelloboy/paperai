export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.json({
        message: 'PaperAI OCR Worker',
        status: 'running',
        endpoints: ['POST /api/ocr', 'POST /api/eval', 'GET /health'],
      }, { headers: corsHeaders });
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy', platform: 'cloudflare-workers' }, { headers: corsHeaders });
    }

    if (url.pathname === '/api/ocr' && request.method === 'POST') {
      try {
        return await handleOCR(request, env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/eval' && request.method === 'POST') {
      try {
        const body = await request.json();
        const metrics = calculateMetrics(body.text || '', body.expected || '');
        return Response.json({ metrics }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
};

async function handleOCR(request, env, corsHeaders) {
  const formData = await request.formData();
  const file = formData.get('file');
  const language = formData.get('language') || 'en';
  const preprocessing = formData.get('preprocessing') || 'auto';

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400, headers: corsHeaders });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|bmp|tiff|tif|webp|pdf)$/i)) {
    return Response.json({ error: 'Unsupported file type' }, { status: 400, headers: corsHeaders });
  }

  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 400, headers: corsHeaders });
  }

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  let images = [];

  if (file.name.match(/\.pdf$/i)) {
    try {
      const pdfDoc = await parsePDF(uint8Array);
      images = pdfDoc;
    } catch (e) {
      return Response.json({ error: 'Failed to parse PDF: ' + e.message }, { status: 400, headers: corsHeaders });
    }
  } else {
    images = [{ data: uint8Array, type: file.type || 'image/jpeg' }];
  }

  const allResults = [];
  let totalConf = 0;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const result = await processImage(img.data, img.type, language, env);
    allResults.push({
      page: i + 1,
      text: result.text,
      confidence: result.confidence,
      regions: result.regions,
    });
    totalConf += result.confidence;
  }

  const fullText = allResults.map(r => r.text).filter(t => t.trim()).join('\n\n');
  const avgConf = totalConf / Math.max(allResults.length, 1);

  return Response.json({
    status: 'completed',
    result: {
      pages: allResults,
      full_text: fullText,
      metadata: {
        filename: file.name,
        total_pages: allResults.length,
        total_characters: fullText.length,
        average_confidence: Math.round(avgConf * 100) / 100,
        language,
        engine: 'cloudflare-ai',
      },
    },
  }, { headers: corsHeaders });
}

async function processImage(imageData, mimeType, language, env) {
  const base64 = uint8ToBase64(imageData);

  try {
    const response = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: `data:${mimeType};base64,${base64}`,
            },
            {
              type: 'text',
              text: 'Extract ALL text from this image exactly as it appears. Preserve the original layout, line breaks, and formatting. Output ONLY the extracted text, nothing else. If there is no text, output "No text detected".',
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const text = response.response || 'No text detected';
    const confidence = text === 'No text detected' ? 0 : estimateConfidence(text);

    return {
      text: text.trim(),
      confidence,
      regions: countRegions(text),
    };
  } catch (e) {
    return {
      text: '',
      confidence: 0,
      regions: 0,
      error: e.message,
    };
  }
}

function estimateConfidence(text) {
  if (!text || text === 'No text detected') return 0;

  let score = 0.7;

  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  const digitRatio = (text.match(/[0-9]/g) || []).length / text.length;
  const spaceRatio = (text.match(/\s/g) || []).length / text.length;

  if (alphaRatio > 0.3) score += 0.1;
  if (spaceRatio > 0.05 && spaceRatio < 0.3) score += 0.05;
  if (text.length > 20) score += 0.05;

  const garbageRatio = (text.match(/[^\w\s.,;:!?'"-]/g) || []).length / text.length;
  if (garbageRatio < 0.1) score += 0.05;
  if (garbageRatio > 0.3) score -= 0.15;

  return Math.min(0.99, Math.max(0.1, score));
}

function countRegions(text) {
  if (!text) return 0;
  const lines = text.split('\n').filter(l => l.trim());
  return Math.max(1, lines.length);
}

function uint8ToBase64(uint8Array) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

async function parsePDF(data) {
  try {
    const { PDFDocument } = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdf = await PDFDocument.load(data);
    const pages = pdf.getPages();
    const images = [];

    for (const page of pages) {
      const { width, height } = page.getSize();
      const scale = 2;
      const image = await page.render({
        x: 0,
        y: 0,
        width: width * scale,
        height: height * scale,
        scale,
      }).toJpg();

      images.push({ data: new Uint8Array(image), type: 'image/jpeg' });
    }

    return images;
  } catch {
    return [{ data, type: 'application/pdf' }];
  }
}

function calculateMetrics(text, expected) {
  const t = text.toLowerCase().trim();
  const e = expected.toLowerCase().trim();

  const eWords = new Set(e.split(/\s+/));
  const tWords = new Set(t.split(/\s+/));
  const intersection = new Set([...eWords].filter(w => tWords.has(w)));
  const wordAccuracy = eWords.size > 0 ? intersection.size / eWords.size : 0;

  let matchCount = 0;
  const maxLen = Math.max(e.length, t.length);
  for (let i = 0; i < Math.min(e.length, t.length); i++) {
    if (e[i] === t[i]) matchCount++;
  }
  const charAccuracy = maxLen > 0 ? matchCount / maxLen : 0;

  const overall = charAccuracy * 0.3 + wordAccuracy * 0.3 + charAccuracy * 0.4;

  return {
    char_accuracy: Math.round(charAccuracy * 10000) / 100,
    word_accuracy: Math.round(wordAccuracy * 10000) / 100,
    overall: Math.round(overall * 10000) / 100,
  };
}
