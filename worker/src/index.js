import { DurableObject } from 'cloudflare:workers';
import { DICTIONARY, getDictionaryWords, isInDictionary, CONFUSION_PAIRS, autoCorrect, verifyWord, getSuggestions } from './dictionary.js';

const DAILY_FREE_NEURONS = 10000;
const GEMMA4_INPUT_NEURONS_PER_MILLION = 9091;
const GEMMA4_OUTPUT_NEURONS_PER_MILLION = 27273;

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
        endpoints: [
          'POST /api/ocr',
          'POST /api/train/collect',
          'POST /api/train/verify',
          'GET /api/train/export?language=hi&limit=1000',
          'GET /api/train/stats',
          'GET /health',
        ],
      }, { headers: corsHeaders });
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy', platform: 'cloudflare-workers' }, { headers: corsHeaders });
    }

    // Public daily free-AI quota dashboard. This is a PaperAI-side estimate
    // calculated from Workers AI token usage returned after each OCR request.
    if (url.pathname === '/api/usage' && request.method === 'GET') {
      try {
        const usage = await getUsageStatus(env);
        return Response.json(usage, {
          headers: {
            ...corsHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        });
      } catch (e) {
        return Response.json({
          error: 'Usage tracker unavailable',
          detail: e.message,
          free_limit: DAILY_FREE_NEURONS,
        }, { status: 503, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/ocr' && request.method === 'POST') {
      try {
        return await handleOCR(request, env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message, stack: e.stack }, { status: 500, headers: corsHeaders });
      }
    }

    // Training data collection: save OCR result as training sample
    if (url.pathname === '/api/train/collect' && request.method === 'POST') {
      try {
        return await collectTrainingSample(request, env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Human verification: save corrected text as verified training pair
    if (url.pathname === '/api/train/verify' && request.method === 'POST') {
      try {
        return await verifyTrainingSample(request, env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Export training data in JSONL format for fine-tuning
    if (url.pathname === '/api/train/export' && request.method === 'GET') {
      try {
        return await exportTrainingData(request, env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Training data statistics
    if (url.pathname === '/api/train/stats' && request.method === 'GET') {
      try {
        return await getTrainingStats(env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Dictionary lookup and verification
    if (url.pathname === '/api/dictionary' && request.method === 'GET') {
      try {
        const word = url.searchParams.get('word');
        if (!word) {
          return Response.json({ error: 'word parameter required' }, { status: 400, headers: corsHeaders });
        }
        const inDict = isInDictionary(word);
        const correction = CONFUSION_PAIRS[word] || null;
        return Response.json({
          word: word,
          in_dictionary: inDict,
          suggested_correction: correction,
          is_known_error: !!correction,
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Get all confusion pairs
    if (url.pathname === '/api/dictionary/confusions' && request.method === 'GET') {
      try {
        return Response.json({
          total_pairs: Object.keys(CONFUSION_PAIRS).length,
          pairs: CONFUSION_PAIRS,
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Verify multiple words at once
    if (url.pathname === '/api/dictionary/verify' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { text, language } = body;
        if (!text) {
          return Response.json({ error: 'text required' }, { status: 400, headers: corsHeaders });
        }
        const words = text.split(/\s+/);
        const results = words.map(w => verifyWord(w));
        const suggestions = getSuggestions(text);
        return Response.json({
          total_words: words.length,
          valid_words: results.filter(r => r.is_valid).length,
          invalid_words: results.filter(r => !r.is_valid).length,
          results: results,
          suggestions: suggestions,
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Auto-correct text using dictionary
    if (url.pathname === '/api/dictionary/autocorrect' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { text, language } = body;
        if (!text) {
          return Response.json({ error: 'text required' }, { status: 400, headers: corsHeaders });
        }
        const result = autoCorrect(text);
        return Response.json({
          original: text,
          corrected: result.text,
          corrections: result.corrections,
          changes_made: result.corrections.length,
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Regression test suite
    if (url.pathname === '/api/test/regression' && request.method === 'GET') {
      try {
        const tests = [
          {
            name: 'Student spelling stays literal',
            input: 'कर्मकांडवाद विद्यान होते हैं',
            expected: 'कर्मकांडवाद विद्यान होते हैं',
            rule: 'Do not correct source spelling',
          },
          {
            name: 'Dates stay literal',
            input: '1885 में भारत शासन अधिनियम',
            expected: '1885 में भारत शासन अधिनियम',
            rule: 'Do not fact-correct dates',
          },
          {
            name: 'Hindi wording stays literal',
            input: 'धनात्मक और ऋणात्मक',
            expected: 'धनात्मक और ऋणात्मक',
            rule: 'Do not paraphrase',
          },
          {
            name: 'Punctuation stays literal',
            input: 'हुआ था। उनका जन्म',
            expected: 'हुआ था। उनका जन्म',
            rule: 'Preserve punctuation',
          },
          {
            name: 'Question numbering stays literal',
            input: '3. प्रश्न का उत्तर',
            expected: '3. प्रश्न का उत्तर',
            rule: 'Preserve numbering',
          },
          {
            name: 'Answer blanks stay literal',
            input: 'Name: ________  Marks: ____',
            expected: 'Name: ________  Marks: ____',
            rule: 'Preserve underscores',
          },
          {
            name: 'Grid separators stay literal',
            input: 'बा | द | ल | क',
            expected: 'बा | द | ल | क',
            rule: 'Preserve grid rows',
          },
          {
            name: 'Mixed language stays literal',
            input: '⑨ condition = गाँव',
            expected: '⑨ condition = गाँव',
            rule: 'Preserve mixed scripts',
          },
        ];

        // Run tests
        const results = tests.map(test => {
          let output = test.input;

          // Apply regex fixes
          const regexResult = safeRegexCleanup(output, 'hi');
          output = regexResult.text;

          // Apply protection and restoration
          const { text: protectedText, map } = protectContent(output);
          output = restoreContent(protectedText, map);

          // Validate
          output = validateOcrOutput(output, test.input);

          const passed = output === test.expected;
          return {
            name: test.name,
            input: test.input,
            expected: test.expected,
            actual: output,
            passed: passed,
            rule: test.rule,
          };
        });

        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;

        return Response.json({
          total: tests.length,
          passed: passed,
          failed: failed,
          pass_rate: `${Math.round((passed / tests.length) * 100)}%`,
          results: results,
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // Debug endpoint to test post-processing
    if (url.pathname === '/api/debug' && request.method === 'POST') {
      try {
        const body = await request.json();
        const text = body.text || '';
        const language = body.language || 'hi';
        const corrected = postProcessHindi(text, language);
        return Response.json({
          original: text,
          corrected: corrected,
          changed: text !== corrected,
          corrections_applied: text !== corrected ? getAppliedCorrections(text, corrected) : []
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
};

export class UsageTracker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = new Date();
    const utcDay = now.toISOString().slice(0, 10);

    let state = await this.ctx.storage.get('daily');
    if (!state || state.day !== utcDay) {
      state = {
        day: utcDay,
        used: 0,
        requests: 0,
        history: [],
        exhausted: false,
      };
    }

    if (request.method === 'POST' && url.pathname === '/add') {
      const body = await request.json();
      const neurons = Number(body.neurons) || 0;

      if (Number.isFinite(neurons) && neurons > 0) {
        state.used = Math.min(DAILY_FREE_NEURONS, state.used + neurons);
        state.requests += 1;
        state.history.push({
          at: now.toISOString(),
          used: Math.round(state.used * 100) / 100,
        });

        // A whole day only needs a compact trend. Keep first/last and recent
        // points if traffic ever grows beyond the current small audience.
        if (state.history.length > 144) {
          const sampled = state.history.filter((_, i) => i % 2 === 0);
          if (sampled[sampled.length - 1]?.at !== state.history[state.history.length - 1]?.at) {
            sampled.push(state.history[state.history.length - 1]);
          }
          state.history = sampled.slice(-144);
        }
      }

      await this.ctx.storage.put('daily', state);
    }

    if (request.method === 'POST' && url.pathname === '/exhausted') {
      state.used = DAILY_FREE_NEURONS;
      state.exhausted = true;
      state.history.push({ at: now.toISOString(), used: DAILY_FREE_NEURONS });
      state.history = state.history.slice(-144);
      await this.ctx.storage.put('daily', state);
    }

    const reset = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));

    const used = Math.min(DAILY_FREE_NEURONS, Math.max(0, Number(state.used) || 0));
    const remaining = Math.max(0, DAILY_FREE_NEURONS - used);

    return Response.json({
      date_utc: utcDay,
      server_time: now.toISOString(),
      reset_at: reset.toISOString(),
      free_limit: DAILY_FREE_NEURONS,
      estimated_used: Math.round(used * 100) / 100,
      estimated_remaining: Math.round(remaining * 100) / 100,
      percent_used: Math.round((used / DAILY_FREE_NEURONS) * 10000) / 100,
      ocr_requests_tracked: Number(state.requests) || 0,
      exhausted: Boolean(state.exhausted || used >= DAILY_FREE_NEURONS),
      history: state.history || [],
      scope: 'PaperAI OCR requests handled by this Worker',
      accuracy: 'estimate',
      reset_rule: '00:00 UTC daily',
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}

function getUsageStub(env) {
  if (!env.USAGE_TRACKER) {
    throw new Error('USAGE_TRACKER Durable Object binding is not configured');
  }
  const id = env.USAGE_TRACKER.idFromName('paperai-global');
  return env.USAGE_TRACKER.get(id);
}

async function getUsageStatus(env) {
  const res = await getUsageStub(env).fetch('https://usage.internal/status');
  if (!res.ok) throw new Error('Usage tracker returned ' + res.status);
  return await res.json();
}

function estimateGemma4Neurons(usage) {
  if (!usage) return 0;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;

  return (
    (promptTokens * GEMMA4_INPUT_NEURONS_PER_MILLION / 1_000_000) +
    (completionTokens * GEMMA4_OUTPUT_NEURONS_PER_MILLION / 1_000_000)
  );
}

async function recordAiUsage(env, usage) {
  const neurons = estimateGemma4Neurons(usage);
  if (!(neurons > 0)) return;

  await getUsageStub(env).fetch('https://usage.internal/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ neurons }),
  });
}

async function markUsageExhausted(env) {
  await getUsageStub(env).fetch('https://usage.internal/exhausted', {
    method: 'POST',
  });
}

async function handleOCR(request, env, corsHeaders) {
  const contentType = request.headers.get('content-type') || '';

  let fileBuffer = null;
  let imageDataBase64 = '';
  let mimeType = 'image/jpeg';
  let filename = 'unknown';
  let language = 'auto';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return Response.json({ error: 'No file in form data' }, { status: 400, headers: corsHeaders });
    }
    filename = file.name;
    mimeType = file.type || 'application/octet-stream';
    language = formData.get('language') || 'auto';
    const buffer = await file.arrayBuffer();
    fileBuffer = buffer;
    imageDataBase64 = arrayBufferToBase64(buffer);
  } else if (contentType.includes('application/json')) {
    const body = await request.json();
    imageDataBase64 = body.image || body.base64 || '';
    mimeType = body.mimeType || body.mime_type || 'image/jpeg';
    filename = body.filename || 'unknown';
    language = body.language || 'auto';
    if (!imageDataBase64) {
      return Response.json({ error: 'No image data in JSON body. Send { "image": "base64..." }' }, { status: 400, headers: corsHeaders });
    }
  } else {
    return Response.json({ error: 'Content-Type must be multipart/form-data or application/json' }, { status: 400, headers: corsHeaders });
  }

  const ext = filename.split('.').pop().toLowerCase();
  const TEXT_EXTS = ['txt','md','json','xml','html','htm','css','js','py','java','c','cpp','h','log','yaml','yml','toml','ini','cfg','csv','tsv','sql','sh','bat','ps1','env','gitignore','dockerfile','makefile'];
  const DOC_EXTS = ['doc','docx','odt','rtf','ppt','pptx','odp'];
  const XLS_EXTS = ['xls','xlsx','ods'];

  // ── Text files: read directly ──
  if (TEXT_EXTS.includes(ext) || mimeType.startsWith('text/')) {
    const textContent = new TextDecoder('utf-8', { fatal: false }).decode(fileBuffer);
    return Response.json({
      status: 'completed',
      result: {
        full_text: textContent,
        raw_text: textContent,
        filename: filename,
        file_type: 'text',
        metadata: { language, engine: 'text-reader', char_count: textContent.length },
        corrections_summary: { corrections: [], total_flags: 0 },
      },
    }, { headers: corsHeaders });
  }

  // ── PDF: extract text from PDF binary ──
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    try {
      const textContent = await extractPdfText(fileBuffer);
      if (textContent.trim().length > 0) {
        return Response.json({
          status: 'completed',
          result: {
            full_text: textContent,
            raw_text: textContent,
            filename: filename,
            file_type: 'pdf',
            metadata: { language, engine: 'pdf-reader', char_count: textContent.length },
            corrections_summary: { corrections: [], total_flags: 0 },
          },
        }, { headers: corsHeaders });
      }
    } catch (e) {
      console.log('[PDF] Text extraction failed, trying OCR:', e.message);
    }
    // Fallback: treat PDF as image for OCR (single page)
    if (imageDataBase64.length > 15 * 1024 * 1024) {
      return Response.json({ error: 'PDF too large (max ~10MB)' }, { status: 400, headers: corsHeaders });
    }
  }

  // ── Office docs: extract raw text (basic) ──
  if (DOC_EXTS.includes(ext)) {
    try {
      const textContent = await extractDocText(fileBuffer, ext);
      return Response.json({
        status: 'completed',
        result: {
          full_text: textContent,
          raw_text: textContent,
          filename: filename,
          file_type: 'document',
          metadata: { language, engine: 'doc-reader', char_count: textContent.length },
          corrections_summary: { corrections: [], total_flags: 0 },
        },
      }, { headers: corsHeaders });
    } catch (e) {
      console.log('[DOC] Extraction failed:', e.message);
      return Response.json({ error: 'Could not extract text from this document. Try converting to text first.' }, { status: 400, headers: corsHeaders });
    }
  }

  if (XLS_EXTS.includes(ext)) {
    try {
      const textContent = await extractSpreadsheetText(fileBuffer, ext);
      return Response.json({
        status: 'completed',
        result: {
          full_text: textContent,
          raw_text: textContent,
          filename: filename,
          file_type: 'spreadsheet',
          metadata: { language, engine: 'xls-reader', char_count: textContent.length },
          corrections_summary: { corrections: [], total_flags: 0 },
        },
      }, { headers: corsHeaders });
    } catch (e) {
      console.log('[XLS] Extraction failed:', e.message);
      return Response.json({ error: 'Could not extract text from this spreadsheet.' }, { status: 400, headers: corsHeaders });
    }
  }

  // ── Images: OCR (existing flow) ──
  if (imageDataBase64.length > 15 * 1024 * 1024) {
    return Response.json({ error: 'Image too large (max ~10MB base64)' }, { status: 400, headers: corsHeaders });
  }

  let aiResult;
  try {
    // FREE-ONLY MODE: exactly ONE Workers AI inference per image/page.
    // No second verification model and no paid provider fallback.
    aiResult = await runAI(imageDataBase64, mimeType, env, language);
  } catch (e) {
    if (isDailyFreeLimitError(e)) {
      try { await markUsageExhausted(env); } catch (_) {}
      return Response.json({
        error: 'Daily free AI OCR limit reached. PaperAI stopped before any paid fallback. Try again after the Cloudflare daily reset.',
        code: 'FREE_AI_LIMIT_REACHED',
      }, { status: 429, headers: corsHeaders });
    }
    if (isPaidModelRequiredError(e)) {
      return Response.json({
        error: 'This OCR model is not available on the Cloudflare Free plan. PaperAI will not switch to a paid model.',
        code: 'FREE_MODEL_UNAVAILABLE',
      }, { status: 503, headers: corsHeaders });
    }
    return Response.json({
      error: 'AI OCR failed: ' + (e?.message || 'unknown error'),
      code: 'AI_OCR_FAILED',
    }, { status: 502, headers: corsHeaders });
  }

  // Record this successful inference for the public daily usage graph.
  // Failure to write analytics must never block the OCR result.
  try {
    await recordAiUsage(env, aiResult.usage || null);
  } catch (e) {
    console.log('[Usage tracker] Could not record usage:', e.message);
  }

  const rawOcrText = aiResult.raw || aiResult.text || '';
  const detectedLanguage = detectLanguageFromText(rawOcrText);
  const effectiveLanguage = language === 'auto' ? detectedLanguage : language;

  // Deterministic cleanup only. Never rewrite spelling, facts, numbers or wording.
  const regexResult = safeRegexCleanup(rawOcrText, effectiveLanguage);
  let correctedText = validateOcrOutput(regexResult.text, rawOcrText);

  // No semantic auto-correction in free-only literal OCR mode.
  const allCorrections = [];

  const consistencyWarnings = checkConsistency(correctedText);

  // Compute post-correction confidence
  const highConfCorrections = allCorrections.filter(c => c.confidence >= 0.95);

  return Response.json({
    status: 'completed',
    result: {
      pages: [{
        page: 1,
        text: correctedText,
        regions: countRegions(correctedText),
      }],
      full_text: correctedText,
      raw_text: rawOcrText,
      verified_text: correctedText,
      corrections_summary: {
        total_corrections: allCorrections.length,
        high_confidence: highConfCorrections.length,
        medium_confidence: allCorrections.filter(c => c.confidence >= 0.85 && c.confidence < 0.95).length,
        low_confidence: allCorrections.filter(c => c.confidence < 0.85).length,
        needs_review: allCorrections.some(c => c.confidence < 0.97),
        corrections: allCorrections.slice(0, 50),
      },
      metadata: {
        filename: filename,
        total_pages: 1,
        total_characters: correctedText.length,
        engine: aiResult.error ? 'error' : 'cloudflare-ai',
        error: aiResult.error || null,
        language: effectiveLanguage,
        requested_language: language,
        detected_language: detectedLanguage,
        mode: 'free_only_literal_transcription',
        billing_safety: 'one_ai_call_no_paid_fallback',
        model: aiResult.model || 'unknown',
        layout: detectExamLayout(correctedText),
      },
      consistency_warnings: consistencyWarnings,
    },
  }, { headers: corsHeaders });
}

// ═══════════════════════════════════════════════════════════════
// EXAM PAPER LAYOUT DETECTION
// ═══════════════════════════════════════════════════════════════
function detectExamLayout(text) {
  const lines = text.split('\n');
  const regions = [];
  let currentSection = null;
  let gridChars = [];
  let inGrid = false;

  function flushGrid() {
    if (gridChars.length >= 4) {
      while (gridChars.length > 0 && /^\d+$/.test(gridChars[gridChars.length-1])) gridChars.pop();
      while (gridChars.length > 0 && /^\d+$/.test(gridChars[0])) gridChars.shift();
      if (gridChars.length >= 4) {
        let cols, rows;
        if (gridChars.length === 30) { cols = 6; rows = 5; }
        else if (gridChars.length === 25) { cols = 5; rows = 5; }
        else if (gridChars.length === 20) { cols = 5; rows = 4; }
        else if (gridChars.length === 36) { cols = 6; rows = 6; }
        else { cols = Math.ceil(Math.sqrt(gridChars.length)); rows = Math.ceil(gridChars.length / cols); }
        const gridRows = [];
        for (let r = 0; r < rows; r++) gridRows.push(gridChars.slice(r * cols, r * cols + cols));
        regions.push({ type: 'grid', rows: gridRows, cols, gridRows: rows, answerSlots: 5 });
      }
    }
    gridChars = [];
    inGrid = false;
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      if (inGrid) flushGrid();
      continue;
    }

    // School header
    if (/BRILLIANT|MODEL SCHOOL|SCHOOL|ACADEMY|E\/M|D\/M|DHARMARAM/i.test(line)) {
      if (inGrid) flushGrid();
      regions.push({ type: 'header', text: line });
      continue;
    }

    // Student fields
    if (/^(Name|Class|Date|Roll|Sub|Subject|Marks|Time|Section|Main Road)/i.test(line)) {
      if (inGrid) flushGrid();
      regions.push({ type: 'field', text: line });
      continue;
    }

    // Grid header — broad detection
    if (/वर्ग|पहेली|शब्द|ढूँढ|word\s*search|crossword|paheli|खोज|लिखिए/i.test(line) && /5\s*[x×X]\s*2\s*=\s*10/i.test(line)) {
      if (inGrid) flushGrid();
      inGrid = true;
      gridChars = [];
      const marksMatch = line.match(/(\d+[x×X]\d+=\d+)/i);
      regions.push({ type: 'grid_header', text: line.replace(/\|/g, '/'), marks: marksMatch ? marksMatch[1] : null });
      continue;
    }

    // SAFEGUARD: In grid mode, single digit = answer number, NOT grid cell
    if (inGrid && /^\d+$/.test(line)) continue;

    // Grid character: pipe-separated or space/tab-separated short text
    if (inGrid) {
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim()).filter(p => p.length > 0);
        for (const p of parts) {
          if (/^\d+$/.test(p)) continue;
          if (p.length <= 3 && p.length > 0) gridChars.push(p);
        }
        continue;
      }
      const spaceParts = line.split(/[\t\s]+/).filter(p => p.length > 0 && p.length <= 3 && !/^\d+$/.test(p));
      if (spaceParts.length > 1) {
        gridChars.push(...spaceParts);
        continue;
      }
      if (line.length <= 3 && line.length > 0 && !/^\d+$/.test(line)) {
        gridChars.push(line);
        continue;
      }
      if (/^\d+$/.test(line)) continue;
      if (line.length > 3) flushGrid();
    }

    // Section heading — Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X)
    const sectionMatch = line.match(/^([IVX]+)\s*[.)]\s*(.+)/);
    if (sectionMatch) {
      const marksMatch = line.match(/(\d+[x×X]\d+=\d+)/);
      currentSection = {
        type: 'section',
        label: sectionMatch[1],
        instruction: sectionMatch[2].replace(/\d+[x×X]\d+=\d+/, '').trim(),
        marks: marksMatch ? marksMatch[1] : null,
        items: []
      };
      regions.push(currentSection);
      continue;
    }

    // Marks pattern standalone
    if (/^\d+[x×X]\d+=\d+$/.test(line)) {
      regions.push({ type: 'marks', text: line });
      continue;
    }

    // Numbered question: 1) ... or 1. ... or ① ...
    const qMatch = line.match(/^(\d+|[①②③④⑤⑥⑦⑧⑨⑩])\s*[).]\s*(.+)/);
    if (qMatch) {
      const num = qMatch[1];
      const questionText = qMatch[2];
      const hasBlank = /_{2,}|\(\s*\)|_{1,}$/.test(questionText);
      const hasTrueFalse = /\(\s*\)$/.test(questionText);
      regions.push({ type: 'question', number: num, text: questionText, hasBlank, hasTrueFalse });
      continue;
    }

    // Two-column pattern: ① word = ___ or ① word ___
    const colMatch = line.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.+?)\s*(=|_{2,}|→|→)\s*(.*)/);
    if (colMatch) {
      regions.push({
        type: 'two_column',
        number: colMatch[1],
        left: colMatch[2].trim(),
        right: colMatch[4].trim() || null
      });
      continue;
    }

    // Matching diagram with arrows
    if (line.includes('→') || line.includes('↔') || line.includes('->')) {
      regions.push({ type: 'matching', text: line });
      continue;
    }

    // Fill-in-blank with options: word ________ (option1/option2)
    if (/\(.+\)/.test(line) && /_{2,}/.test(line)) {
      regions.push({ type: 'fill_blank', text: line });
      continue;
    }

    // True/false with (  ) at end
    if (/\(\s*\)\s*$/.test(line)) {
      regions.push({ type: 'question', number: null, text: line, hasBlank: false, hasTrueFalse: true });
      continue;
    }

    // Default: paragraph text
    regions.push({ type: 'paragraph', text: line });
  }

  // Flush any remaining grid chars
  if (inGrid && gridChars.length >= 4) {
    while (gridChars.length > 0 && /^\d+$/.test(gridChars[gridChars.length-1])) gridChars.pop();
    while (gridChars.length > 0 && /^\d+$/.test(gridChars[0])) gridChars.shift();
    if (gridChars.length >= 4) {
      const cols = Math.ceil(Math.sqrt(gridChars.length));
      const rows = Math.ceil(gridChars.length / cols);
      const gridRows = [];
      for (let r = 0; r < rows; r++) gridRows.push(gridChars.slice(r * cols, r * cols + cols));
      regions.push({ type: 'grid', rows: gridRows, cols, gridRows: rows, answerSlots: 5 });
    }
  }

  // Fallback: detect grid from consecutive short lines (1-4 chars)
  let consecutiveShort = 0;
  let shortStart = -1;
  for (let i = 0; i < regions.length; i++) {
    const t = regions[i].text || '';
    const isShort = regions[i].type === 'paragraph' && t.length <= 4 && t.length > 0;
    if (isShort) {
      if (consecutiveShort === 0) shortStart = i;
      consecutiveShort++;
    } else {
      if (consecutiveShort >= 8) {
        const chars = regions.slice(shortStart, shortStart + consecutiveShort).map(r => r.text);
        while (chars.length > 0 && /^\d+$/.test(chars[chars.length-1])) chars.pop();
        while (chars.length > 0 && /^\d+$/.test(chars[0])) chars.shift();
        if (chars.length >= 6) {
          let hasGridHeader = false;
          for (let j = Math.max(0, shortStart - 3); j < shortStart; j++) {
            if (regions[j].type === 'grid_header') { hasGridHeader = true; break; }
          }
          regions.splice(shortStart, consecutiveShort);
          const cols = Math.ceil(Math.sqrt(chars.length));
          const rows = Math.ceil(chars.length / cols);
          const gridRows = [];
          for (let r = 0; r < rows; r++) gridRows.push(chars.slice(r * cols, r * cols + cols));
          regions.splice(shortStart, 0, { type: 'grid', rows: gridRows, cols, gridRows: rows, answerSlots: hasGridHeader ? 5 : 0 });
        }
      }
      consecutiveShort = 0;
    }
  }
  if (consecutiveShort >= 8) {
    const chars = regions.slice(shortStart, shortStart + consecutiveShort).map(r => r.text);
    while (chars.length > 0 && /^\d+$/.test(chars[chars.length-1])) chars.pop();
    while (chars.length > 0 && /^\d+$/.test(chars[0])) chars.shift();
    if (chars.length >= 6) {
      let hasGridHeader = false;
      for (let j = Math.max(0, shortStart - 3); j < shortStart; j++) {
        if (regions[j].type === 'grid_header') { hasGridHeader = true; break; }
      }
      regions.splice(shortStart, consecutiveShort);
      const cols = Math.ceil(Math.sqrt(chars.length));
      const rows = Math.ceil(chars.length / cols);
      const gridRows = [];
      for (let r = 0; r < rows; r++) gridRows.push(chars.slice(r * cols, r * cols + cols));
      regions.splice(shortStart, 0, { type: 'grid', rows: gridRows, cols, gridRows: rows, answerSlots: hasGridHeader ? 5 : 0 });
    }
  }

  return { regions, hasGrid: regions.some(r => r.type === 'grid') };
}

async function runAI(base64Image, mimeType, env, language = 'auto') {
  if (!env.AI) {
    throw new Error('Workers AI not available - check if AI binding is configured');
  }

  const model = '@cf/google/gemma-4-26b-a4b-it';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;
  const languageHint = {
    auto: 'Auto-detect all visible languages and scripts. Mixed-language pages are common.',
    en: 'Main language: English. Preserve any Indian-language text exactly where it appears.',
    hi: 'Main language: Hindi (Devanagari). Preserve English, numbers and mixed scripts exactly.',
    te: 'Main language: Telugu. Preserve English, numbers and mixed scripts exactly.',
    ta: 'Main language: Tamil. Preserve English, numbers and mixed scripts exactly.',
    kn: 'Main language: Kannada. Preserve English, numbers and mixed scripts exactly.',
    ml: 'Main language: Malayalam. Preserve English, numbers and mixed scripts exactly.',
    mr: 'Main language: Marathi (Devanagari). Preserve English, numbers and mixed scripts exactly.',
    bn: 'Main language: Bengali. Preserve English, numbers and mixed scripts exactly.',
    gu: 'Main language: Gujarati. Preserve English, numbers and mixed scripts exactly.',
    pa: 'Main language: Punjabi/Gurmukhi. Preserve English, numbers and mixed scripts exactly.',
    ur: 'Main language: Urdu. Preserve English, numbers and mixed scripts exactly.'
  }[language] || 'Auto-detect every visible language and preserve the original scripts exactly.';

  const prompt = `You are PaperAI, a high-accuracy visual OCR and handwriting transcription engine.

LANGUAGE INSTRUCTION:
${languageHint}

Your job is to READ the pixels, including difficult handwriting, and transcribe what is actually visible.
Be intelligent about character shapes and word boundaries like a strong multimodal document reader, but remain a PRINTER, not an editor.

Before writing the answer, silently inspect the page line-by-line and cross-check ambiguous handwriting against the actual glyph shapes and nearby visible context. Use context only to choose between visually plausible characters; NEVER change the author's spelling, grammar, facts or wording.

STRICT TRANSCRIPTION RULES:
1. Output ONLY text visible in the image. No explanations, summaries, Markdown wrappers or commentary.
2. Preserve the source exactly even when it contains mistakes.
3. Preserve English, Hindi, Telugu and every other visible script without transliteration.
4. Pay special attention to handwritten English letter shapes, Devanagari matras/conjuncts and Telugu vowel signs/conjuncts.
5. Distinguish visually similar characters and digits carefully (for example 1/l/I, 0/O, 5/S, 2/Z) only from the image.
6. Preserve dates, numbers, names, punctuation, capitalization, math symbols, units, brackets, question numbers and marks exactly.
7. Preserve line order and meaningful line breaks. Do not merge unrelated lines.
8. Preserve underscores/blanks such as ______ and empty answer brackets like ( ).
9. Forms, tables and two-column lists: keep each label beside the value that is visibly on the same row, using " | " between visible columns.
10. Grids/word-search/crossword boxes: ONE visual grid row per line and one cell per " | ". Keep grapheme clusters together (for example "बा" is one cell).
11. Anything visibly OUTSIDE the grid boundary must stay outside the grid. Never insert side answer numbers or labels into grid cells.
12. Never invent page markers, section markers, filenames, "--- Page 2 ---", or any other text that is not visibly printed in the source.
13. For crossed-out or overwritten handwriting, transcribe the final clearly intended visible writing only when it is visually obvious; otherwise preserve the visible ambiguous text as closely as possible.
14. Do not hallucinate text hidden by blur, cropping, glare or low resolution. If a tiny portion is unreadable, use [unclear] only for that portion rather than inventing a word.
15. Write "No text detected" only when the image truly contains no readable text.

Return only the final transcription.`;

  const response = await env.AI.run(model, {
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 8192,
    temperature: 0,
    chat_template_kwargs: {
      // Keep hidden reasoning disabled so OCR uses fewer free Neurons.
      enable_thinking: false
    }
  });

  const text = (response.response || '').trim();
  return { text, raw: text, model, usage: response.usage || null };
}

function aiErrorText(error) {
  try {
    return [
      error?.message || '',
      error?.cause?.message || '',
      typeof error === 'string' ? error : '',
      JSON.stringify(error || {})
    ].join(' ').toLowerCase();
  } catch (_) {
    return String(error?.message || error || '').toLowerCase();
  }
}

function isDailyFreeLimitError(error) {
  const s = aiErrorText(error);
  return s.includes('3036') ||
    s.includes('daily free allocation') ||
    s.includes('used up your daily free') ||
    (s.includes('429') && (s.includes('neuron') || s.includes('allocation')));
}

function isPaidModelRequiredError(error) {
  const s = aiErrorText(error);
  return s.includes('5035') || s.includes('requires a workers paid plan');
}

function detectLanguageFromText(text) {
  if (!text) return 'en';

  const scripts = [
    ['hi', /[\u0900-\u097F]/g],   // Devanagari (Hindi/Marathi and others)
    ['te', /[\u0C00-\u0C7F]/g],
    ['ta', /[\u0B80-\u0BFF]/g],
    ['kn', /[\u0C80-\u0CFF]/g],
    ['ml', /[\u0D00-\u0D7F]/g],
    ['bn', /[\u0980-\u09FF]/g],
    ['gu', /[\u0A80-\u0AFF]/g],
    ['pa', /[\u0A00-\u0A7F]/g],
    ['ur', /[\u0600-\u06FF]/g],
  ];

  let best = ['en', (text.match(/[A-Za-z]/g) || []).length];
  for (const [code, re] of scripts) {
    const count = (text.match(re) || []).length;
    if (count > best[1] && count >= 3) best = [code, count];
  }
  return best[0];
}

// ═══════════════════════════════════════════════════════════════
// STEP 1: Safe regex pre-pass — deterministic, high-confidence fixes
// ═══════════════════════════════════════════════════════════════
function safeRegexCleanup(text, language) {
  if (!text || text === 'No text detected') return { text, corrections: [] };

  // NFC fixes Unicode composition only. It does NOT change words, dates,
  // grammar, punctuation, or facts.
  const result = text
    .replace(/\u0000/g, '')
    .replace(/^\uFEFF/, '')
    .normalize('NFC');

  return { text: result, corrections: [] };
}

// ═══════════════════════════════════════════════════════════════
// CONTENT PROTECTION — protect before ANY processing
// ═══════════════════════════════════════════════════════════════
function protectContent(text) {
  const map = new Map();
  let idx = 0;
  let result = text;

  // Protect full dates: "15 जून, 1902" or "June 15, 1902"
  result = result.replace(/\b(\d{1,2})\s*(जनवरी|फ़रवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर|January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s*(\d{4})\b/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect standalone years (1500-2099)
  result = result.replace(/\b(1[5-9]\d{2}|20[0-2]\d)\b/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect ALL numeric tokens. PaperAI must never fact-correct or renumber the source.
  result = result.replace(/\b[0-9]+\b|[०-९]+|[౦-౯]+/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect exam/layout tokens before word-level verification.
  result = result.replace(/_{2,}|[①-⑳]|[=×|]/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect punctuation and separators.
  result = result.replace(/[।.?!,;:\"'()\[\]{}\-]/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect paragraph boundaries (double newlines)
  result = result.replace(/\n\n+/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect line breaks (single newlines)
  result = result.replace(/\n/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  return { text: result, map };
}

function restoreContent(text, map) {
  let result = text;
  for (const [ph, original] of map) {
    result = result.replace(ph, original);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION: Strip invented markdown/numbering from LLM output
// ═══════════════════════════════════════════════════════════════
function validateOcrOutput(text, rawOcrText) {
  if (!text) return text;

  let result = text.normalize('NFC');

  // Remove only a markdown code fence that wraps the ENTIRE model response.
  // Do not strip underscores, bullets, numbering or punctuation from the document.
  result = result.replace(/^\`\`\`(?:text|markdown)?\s*\n?/i, '');
  result = result.replace(/\n?\`\`\`\s*$/i, '');

  return result.trim();
}

// Second-pass AI verification intentionally removed.
// Free-only mode performs one high-quality multimodal OCR inference per image.

function postProcessHindi(text, language) {
  if (!text || text === 'No text detected') return text;
  return text.replace(/\u0000/g, '').normalize('NFC');
}

function getAppliedCorrections(original, corrected) {
  // Literal OCR mode never applies semantic dictionary corrections.
  return [];
}
function countRegions(text) {
  if (!text) return 0;
  return Math.max(1, text.split('\n').filter(l => l.trim()).length);
}

// ── PDF text extraction (binary parsing with decompression) ──
async function extractPdfText(buffer) {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);

  // Step 1: Find all objects and their streams
  const objects = [];
  const objRegex = /(\d+)\s+\d+\s+obj[\s\S]*?endobj/g;
  let objMatch;
  while ((objMatch = objRegex.exec(raw)) !== null) {
    const objContent = objMatch[0];
    const objNum = objMatch[1];
    objects.push({ num: objNum, content: objContent, start: objMatch.index });
  }

  // Step 2: Find content streams (pages with text operators)
  const texts = [];
  const seen = new Set();

  for (const obj of objects) {
    const c = obj.content;

    // Skip metadata, fonts, images, color profiles
    if (/\/Type\s*\/(Font|Metadata|XMP|Catalog|Outlines|Sig)/i.test(c)) continue;
    if (/\/Subtype\s*\/(Image|Type0|Type1|TrueType|CIDFont)/i.test(c)) continue;
    if (/dc:format|dc:title|dc:creator|pdf:Producer|xmp:CreatorTool/i.test(c)) continue;

    // Check if this object has a stream
    const streamIdx = c.indexOf('stream');
    if (streamIdx === -1) continue;

    const afterStream = c.substring(streamIdx);
    const streamBodyMatch = afterStream.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
    if (!streamBodyMatch) continue;

    let streamData = streamBodyMatch[1];

    // Check if compressed (FlateDecode)
    const isFlate = /\/FlateDecode/.test(c);
    if (isFlate) {
      try {
        const streamBytes = new Uint8Array([...streamData].map(ch => ch.charCodeAt(0)));
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(streamBytes);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const totalLen = chunks.reduce((a, c) => a + c.length, 0);
        const decompressed = new Uint8Array(totalLen);
        let pos = 0;
        for (const chunk of chunks) {
          decompressed.set(chunk, pos);
          pos += chunk.length;
        }
        streamData = new TextDecoder('latin1').decode(decompressed);
      } catch (e) {
        continue; // Skip streams that can't be decompressed
      }
    }

    // Only process streams that contain text operators
    if (!/BT[\s\S]*?ET/.test(streamData)) continue;

    // Extract text from BT...ET blocks
    const btBlocks = streamData.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btBlocks) {
      // Tj operator: (text) Tj
      const tjMatches = block.match(/\(([^)]*(?:\\.[^)]*)*)\)\s*Tj/g) || [];
      for (const m of tjMatches) {
        const inner = m.replace(/\)\s*Tj$/, '').replace(/^\(/, '');
        const decoded = decodePdfString(inner);
        if (decoded && /[a-zA-Z0-9]{2,}/.test(decoded) && !seen.has(decoded)) {
          seen.add(decoded);
          texts.push(decoded);
        }
      }

      // TJ operator: [(text1) 123 (text2)] TJ
      const tjArrayMatches = block.match(/\[(?:[^\]]*)\]\s*TJ/g) || [];
      for (const m of tjArrayMatches) {
        const inner = m.replace(/\]\s*TJ$/, '').replace(/^\[/, '');
        const strParts = inner.match(/\(([^)]*(?:\\.[^)]*)*)\)/g) || [];
        let combined = '';
        for (const part of strParts) {
          combined += decodePdfString(part.replace(/^\(/, '').replace(/\)$/, ''));
        }
        if (combined && /[a-zA-Z0-9]{2,}/.test(combined) && !seen.has(combined)) {
          seen.add(combined);
          texts.push(combined);
        }
      }
    }
  }

  // Step 3: Fallback — extract readable text from all streams
  if (texts.length < 10) {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(raw)) !== null) {
      const content = streamMatch[1];
      const printable = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      if (printable.length > 30 && /[a-zA-Z]{4,}/.test(printable) &&
          !/xpacket|adobe:|rdf:|dc:|pdf:|xmp:/.test(printable)) {
        texts.push(printable);
      }
    }
  }

  return texts.join('\n').trim();
}

// Decode PDF string escapes
function decodePdfString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

// ── Word / PowerPoint / OpenDocument text extraction ──
async function extractDocText(buffer, ext) {
  if (['docx','odt','pptx','odp'].includes(ext)) {
    try {
      const unzipResult = await unzipBuffer(buffer);
      const decoder = new TextDecoder('utf-8');
      const sections = [];

      if (ext === 'docx') {
        const names = Object.keys(unzipResult)
          .filter(name => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(name))
          .sort((a,b) => a.includes('document.xml') ? -1 : b.includes('document.xml') ? 1 : a.localeCompare(b));
        for (const name of names) {
          const text = stripOfficeXml(decoder.decode(unzipResult[name]));
          if (text) sections.push(text);
        }
      } else if (ext === 'pptx') {
        const names = Object.keys(unzipResult)
          .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
          .sort((a,b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
        for (let i = 0; i < names.length; i++) {
          const text = stripOfficeXml(decoder.decode(unzipResult[names[i]]));
          if (text) sections.push(`--- Slide ${i + 1} ---\n${text}`);
        }
      } else {
        const content = unzipResult['content.xml'];
        if (content) {
          const text = stripOfficeXml(decoder.decode(content));
          if (text) sections.push(text);
        }
      }

      const joined = sections.join('\n\n').trim();
      if (joined) return joined;
    } catch (e) {
      console.log('[Office] ZIP extraction failed:', e.message);
    }
  }

  // Legacy .doc/.ppt/.rtf fallback: best-effort printable text only, never AI.
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(buffer);
  const readable = raw
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!readable || readable.length < 3) {
    throw new Error('Could not extract readable text from this legacy document. Save it as DOCX or PPTX and try again.');
  }
  return readable;
}

function stripOfficeXml(xml) {
  return xml
    .replace(/<w:tab\s*\/>/gi, '\t')
    .replace(/<w:br\s*\/>/gi, '\n')
    .replace(/<a:br\s*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/a:p>/gi, '\n')
    .replace(/<\/text:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Spreadsheet text extraction ──
async function extractSpreadsheetText(buffer, ext) {
  if (ext === 'csv') {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
  // For XLSX/XLS: extract shared strings (basic)
  try {
    const unzipResult = await unzipBuffer(buffer);
    for (const [name, content] of Object.entries(unzipResult)) {
      if (name.includes('sharedStrings.xml')) {
        const text = new TextDecoder('utf-8').decode(content);
        return stripXmlTags(text);
      }
      if (name.includes('sheet') && name.endsWith('.xml')) {
        const text = new TextDecoder('utf-8').decode(content);
        const extracted = stripXmlTags(text);
        if (extracted.trim().length > 5) return extracted;
      }
    }
  } catch (e) {}
  return 'Could not extract text from this spreadsheet.';
}

// ── Simple ZIP extraction (stored, deflate) ──
async function unzipBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const files = {};
  let offset = 0;
  while (offset < bytes.length - 4) {
    if (bytes[offset] === 0x50 && bytes[offset+1] === 0x4B && bytes[offset+2] === 0x03 && bytes[offset+3] === 0x04) {
      const compressionMethod = bytes[offset+8] | (bytes[offset+9] << 8);
      const compressedSize = bytes[offset+18] | (bytes[offset+19] << 8) | (bytes[offset+20] << 16) | (bytes[offset+21] << 24);
      const uncompressedSize = bytes[offset+22] | (bytes[offset+23] << 8) | (bytes[offset+24] << 16) | (bytes[offset+25] << 24);
      const nameLen = bytes[offset+26] | (bytes[offset+27] << 8);
      const extraLen = bytes[offset+28] | (bytes[offset+29] << 8);
      const name = new TextDecoder().decode(bytes.slice(offset+30, offset+30+nameLen));
      const dataStart = offset + 30 + nameLen + extraLen;
      if (compressionMethod === 0) {
        // Stored
        files[name] = bytes.slice(dataStart, dataStart + compressedSize);
      } else if (compressionMethod === 8) {
        // Deflate - use DecompressionStream
        try {
          const compressed = bytes.slice(dataStart, dataStart + compressedSize);
          const ds = new DecompressionStream('deflate');
          const writer = ds.writable.getWriter();
          writer.write(compressed);
          writer.close();
          const reader = ds.readable.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const totalLen = chunks.reduce((a, c) => a + c.length, 0);
          const result = new Uint8Array(totalLen);
          let pos = 0;
          for (const chunk of chunks) {
            result.set(chunk, pos);
            pos += chunk.length;
          }
          files[name] = result;
        } catch (e) {
          // Skip files that can't be decompressed
        }
      }
      offset = dataStart + compressedSize;
      if (offset <= (offset + 30 + nameLen + extraLen)) offset = dataStart + Math.max(compressedSize, 1);
    } else {
      offset++;
    }
    if (offset > 10 * 1024 * 1024) break; // Safety limit
  }
  return files;
}

// ── Strip XML tags ──
function stripXmlTags(xml) {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function checkConsistency(text) {
  if (!text || text === 'No text detected') return [];

  const warnings = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract key-value patterns - supports English, Hindi (Devanagari), Telugu
  // Patterns: "Field: Value", "Field - Value", "क्षेत्र: मान", "క్షేత్రం: విలువ"
  const fieldPattern = /^([A-Za-z\u0900-\u097F\u0C00-\u0C7F\s./#()-]{1,30}?)\s*[:\-]\s*(.+)$/;
  const fields = {};

  for (const line of lines) {
    const match = line.match(fieldPattern);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!fields[key]) fields[key] = [];
      fields[key].push(value);
    }
  }

  // Check for inconsistent values within same field
  for (const [key, values] of Object.entries(fields)) {
    if (values.length < 2) continue;

    const unique = [...new Set(values)];
    if (unique.length <= 1) continue;

    // Find similar values (differ by 1-2 characters)
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i];
        const b = unique[j];
        const dist = levenshtein(a, b);
        if (dist <= 2 && dist < Math.min(a.length, b.length) * 0.3) {
          const countA = values.filter(v => v === a).length;
          const countB = values.filter(v => v === b).length;
          warnings.push({
            type: 'field_inconsistency',
            field: key,
            values: unique,
            suggestion: countA > countB ? a : countB > countA ? b : null,
            message: `Field "${key}" has inconsistent values: ${unique.map(v => `"${v}" (${values.filter(x => x === v).length}x)`).join(', ')}. Most frequent: "${countA >= countB ? a : b}".`,
          });
        }
      }
    }
  }

  // Check for similar patterns across different fields (e.g., same address in different contexts)
  const allValues = Object.values(fields).flat();
  const patternCounts = {};
  for (const v of allValues) {
    // Normalize: lowercase, remove extra spaces
    const norm = v.toLowerCase().replace(/\s+/g, ' ');
    if (!patternCounts[norm]) patternCounts[norm] = { original: v, count: 0, fields: [] };
    patternCounts[norm].count++;
  }

  // Find near-duplicates across all values
  const uniqueValues = [...new Set(allValues)];
  for (let i = 0; i < uniqueValues.length; i++) {
    for (let j = i + 1; j < uniqueValues.length; j++) {
      const a = uniqueValues[i];
      const b = uniqueValues[j];
      if (a === b) continue;
      const dist = levenshtein(a, b);
      if (dist <= 2 && dist < Math.min(a.length, b.length) * 0.3) {
        const alreadyReported = warnings.some(w =>
          w.type === 'cross_field_similarity' &&
          w.values.includes(a) && w.values.includes(b)
        );
        if (!alreadyReported) {
          warnings.push({
            type: 'cross_field_similarity',
            values: [a, b],
            message: `Similar values found: "${a}" and "${b}" differ by ${dist} character(s). Please verify both against the source image.`,
          });
        }
      }
    }
  }

  // Check for suspicious digit patterns (1 vs 7 confusion, common OCR error)
  const digitWarnings = checkDigitPatterns(text);
  warnings.push(...digitWarnings);

  return warnings;
}

function checkDigitPatterns(text) {
  const warnings = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract all 4-digit years and their context
  const yearPattern = /\b(1[5-9]\d{2})\b/g;
  const years = [];
  for (const line of lines) {
    let match;
    while ((match = yearPattern.exec(line)) !== null) {
      years.push({ year: match[1], context: line, index: match.index });
    }
  }

  // Check for years that differ by only 1 digit (1 vs 7 confusion is common)
  for (let i = 0; i < years.length; i++) {
    for (let j = i + 1; j < years.length; j++) {
      const a = years[i].year;
      const b = years[j].year;
      const dist = levenshtein(a, b);
      if (dist === 1) {
        // Find which digit differs
        let diffPos = -1;
        for (let k = 0; k < 4; k++) {
          if (a[k] !== b[k]) { diffPos = k; break; }
        }
        // Check if it's a 1 vs 7 confusion (common in handwritten text)
        if (diffPos >= 0 && ((a[diffPos] === '1' && b[diffPos] === '7') || (a[diffPos] === '7' && b[diffPos] === '1'))) {
          warnings.push({
            type: 'digit_confusion',
            values: [a, b],
            message: `Years "${a}" and "${b}" differ by one digit (1 vs 7 confusion). This is a common OCR error with handwritten text. Please verify the correct year against the source image.`,
          });
        }
      }
    }
  }

  return warnings;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ═══════════════════════════════════════════════════════════════
// TRAINING DATA COLLECTION
// ═══════════════════════════════════════════════════════════════

async function collectTrainingSample(request, env, corsHeaders) {
  const body = await request.json();
  const { image_hash, raw_ocr, corrected_text, corrections, language, filename } = body;

  if (!raw_ocr) {
    return Response.json({ error: 'raw_ocr required' }, { status: 400, headers: corsHeaders });
  }

  const sample = {
    id: `train_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    image_hash: image_hash || null,
    filename: filename || null,
    language: language || 'hi',
    raw_ocr: raw_ocr,
    corrected_text: corrected_text || raw_ocr,
    corrections: corrections || [],
    source: 'auto_collect',
    verified: false,
    weight: 0.5,  // auto-collected samples get lower weight
  };

  // Store in KV
  const key = `train:${sample.id}`;
  await env.KV.put(key, JSON.stringify(sample), { expirationTtl: 86400 * 365 }); // 1 year

  // Update counter
  const counterKey = `train:count:${sample.language}`;
  const current = parseInt(await env.KV.get(counterKey) || '0');
  await env.KV.put(counterKey, String(current + 1));

  return Response.json({
    status: 'collected',
    sample_id: sample.id,
    total_samples: current + 1,
  }, { headers: corsHeaders });
}

async function verifyTrainingSample(request, env, corsHeaders) {
  const body = await request.json();
  const { sample_id, verified_text, corrections, language } = body;

  if (!sample_id || !verified_text) {
    return Response.json({ error: 'sample_id and verified_text required' }, { status: 400, headers: corsHeaders });
  }

  // Get existing sample
  const existing = await env.KV.get(`train:${sample_id}`, { type: 'json' });

  const sample = {
    id: sample_id,
    timestamp: existing?.timestamp || new Date().toISOString(),
    image_hash: existing?.image_hash || null,
    filename: existing?.filename || null,
    language: language || existing?.language || 'hi',
    raw_ocr: existing?.raw_ocr || '',
    corrected_text: verified_text,
    corrections: corrections || existing?.corrections || [],
    source: 'human_verified',
    verified: true,
    weight: 1.0,  // human-verified samples get full weight
  };

  // Store verified sample
  const key = `train:${sample.id}`;
  await env.KV.put(key, JSON.stringify(sample), { expirationTtl: 86400 * 365 });

  // Update verified counter
  const counterKey = `train:verified:${sample.language}`;
  const current = parseInt(await env.KV.get(counterKey) || '0');
  await env.KV.put(counterKey, String(current + 1));

  // If corrections provided, also store as correction pairs
  if (corrections && corrections.length > 0) {
    for (const c of corrections) {
      if (c.original && c.corrected) {
        const pairKey = `train:pair:${c.original}:${c.corrected}`;
        const existingPair = await env.KV.get(pairKey, { type: 'json' });
        const pair = {
          original: c.original,
          corrected: c.corrected,
          language: language || 'hi',
          count: (existingPair?.count || 0) + 1,
          source: 'human_verified',
        };
        await env.KV.put(pairKey, JSON.stringify(pair));
      }
    }
  }

  return Response.json({
    status: 'verified',
    sample_id: sample.id,
    total_verified: current + 1,
  }, { headers: corsHeaders });
}

async function exportTrainingData(request, env, corsHeaders) {
  const url = new URL(request.url);
  const language = url.searchParams.get('language') || 'hi';
  const limit = parseInt(url.searchParams.get('limit') || '1000');
  const verifiedOnly = url.searchParams.get('verified_only') === 'true';

  // List all training samples
  const list = await env.KV.list({ prefix: 'train:', limit: limit * 2 });
  const samples = [];

  for (const key of list.keys) {
    if (key.name.includes(':pair:') || key.name.includes(':count:') || key.name.includes(':verified:')) {
      continue; // Skip meta keys
    }
    const sample = await env.KV.get(key.name, { type: 'json' });
    if (!sample) continue;
    if (sample.language !== language) continue;
    if (verifiedOnly && !sample.verified) continue;
    samples.push(sample);
    if (samples.length >= limit) break;
  }

  // Format as JSONL for fine-tuning
  const jsonl = samples.map(s => JSON.stringify({
    image: s.filename || s.image_hash || 'unknown',
    raw_ocr: s.raw_ocr,
    target_text: s.corrected_text,
    corrections: s.corrections,
    language: s.language,
    verified: s.verified,
    weight: s.weight,
  })).join('\n');

  return new Response(jsonl, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/jsonl',
      'Content-Disposition': `attachment; filename="paperai-training-${language}-${Date.now()}.jsonl"`,
    },
  });
}

async function getTrainingStats(env, corsHeaders) {
  const languages = ['hi', 'te', 'en'];
  const stats = {};

  for (const lang of languages) {
    const totalCount = parseInt(await env.KV.get(`train:count:${lang}`) || '0');
    const verifiedCount = parseInt(await env.KV.get(`train:verified:${lang}`) || '0');
    stats[lang] = {
      total_samples: totalCount,
      verified_samples: verifiedCount,
      auto_collected: totalCount - verifiedCount,
    };
  }

  // Get correction pair stats
  const pairList = await env.KV.list({ prefix: 'train:pair:', limit: 1000 });
  const topPairs = [];
  for (const key of pairList.keys) {
    const pair = await env.KV.get(key.name, { type: 'json' });
    if (pair) topPairs.push(pair);
  }
  topPairs.sort((a, b) => b.count - a.count);

  return Response.json({
    languages: stats,
    top_correction_pairs: topPairs.slice(0, 20),
    total_samples: Object.values(stats).reduce((sum, s) => sum + s.total_samples, 0),
    total_verified: Object.values(stats).reduce((sum, s) => sum + s.verified_samples, 0),
  }, { headers: corsHeaders });
}
