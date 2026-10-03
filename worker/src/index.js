import { DICTIONARY, getDictionaryWords, isInDictionary, CONFUSION_PAIRS, autoCorrect, verifyWord, getSuggestions } from './dictionary.js';

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
  const DOC_EXTS = ['doc','docx','odt','rtf'];
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
    aiResult = await runAI(imageDataBase64, mimeType, env, language);
  } catch (e) {
    aiResult = { text: '', error: e.message };
  }

  const rawOcrText = aiResult.raw || aiResult.text || '';
  const detectedLanguage = detectLanguageFromText(rawOcrText);
  const effectiveLanguage = language === 'auto' ? detectedLanguage : language;

  // Step 1: deterministic cleanup must NEVER rewrite words or facts.
  const regexResult = safeRegexCleanup(rawOcrText, effectiveLanguage);

  // Step 2: visually verify against the source image.
  // The verifier returns patches only; it never regenerates the whole document.
  let llmCorrections = [];
  if (regexResult.text.length > 20) {
    try {
      const llmResult = await llmContextualCorrection(
        regexResult.text,
        imageDataBase64,
        mimeType,
        env,
        effectiveLanguage
      );
      llmCorrections = llmResult.corrections || [];
    } catch (e) {
      console.log('[LLM Verification] Failed:', e.message);
    }
  }

  // Step 3: protect dates, numbers, punctuation and line breaks BEFORE applying patches.
  // Word-only corrections still apply, while risky structure/number changes are blocked.
  const { text: protectedText, map: protectionMap } = protectContent(regexResult.text);
  let correctedText = protectedText;

  for (const patch of llmCorrections) {
    if (!patch.original || !patch.corrected || patch.confidence < 0.97) continue;
    if (patch.original === patch.corrected) continue;

    // If the original text was protected (date/number/punctuation/line break),
    // it will no longer exist verbatim here and therefore cannot be overwritten.
    if (correctedText.includes(patch.original)) {
      correctedText = correctedText.replace(patch.original, patch.corrected);
    }
  }

  // Step 4: restore the exact protected source content.
  correctedText = restoreContent(correctedText, protectionMap);

  // Step 5: only remove model wrapper artifacts; preserve document content.
  correctedText = validateOcrOutput(correctedText, rawOcrText);

  // Merge all corrections
  const allCorrections = [
    ...regexResult.corrections.map(c => ({ ...c, source: 'regex', confidence: 1.0 })),
    ...llmCorrections.filter(c => c.confidence >= 0.97).map(c => ({ ...c, source: 'llm' }))
  ];

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
        mode: 'literal_transcription',
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

  const dataUrl = `data:${mimeType};base64,${base64Image}`;
  const languageHint = {
    auto: 'Detect the language automatically. The page may mix English, Hindi (Devanagari), and Telugu.',
    en: 'The main document language is English, but preserve any other scripts exactly.',
    hi: 'The main document language is Hindi (Devanagari), but preserve English words and numbers exactly.',
    te: 'The main document language is Telugu, but preserve English words and numbers exactly.'
  }[language] || 'Detect the document language and preserve every script exactly.';

  const prompt = `You are PaperAI, a literal document transcription engine.

DOCUMENT LANGUAGE:
${languageHint}

TRANSCRIBE THE IMAGE EXACTLY. You are a PRINTER, not an editor.

RULES:
1. Output ONLY text visible in the image. Do not explain, summarize, correct grammar, or improve spelling.
2. Preserve dates, numbers, names, punctuation, capitalization, mathematical symbols, brackets, and answer blanks exactly.
3. Preserve reading order and line breaks. Do not merge unrelated lines.
4. For exam papers, preserve section labels, question numbers, circled numbers, marks such as 5×2=10, and empty answer areas.
5. For tables/two-column lists, output one visual row per text line and separate columns with " | ".
6. For grids/word-search/crossword boxes, output ONE GRID ROW PER LINE and separate cells with " | ".
7. Text or answer numbers OUTSIDE a grid must stay outside the grid. Never insert side labels into grid cells.
8. Preserve underscores and empty brackets such as _____ and ( ).
9. Mixed-language text must remain in its original script. Never transliterate.
10. If handwriting is unclear, transcribe the closest visible characters; do not infer a more sensible word.
11. Write "No text detected" only if the image is actually blank.

Return only the transcription.`;

  const response = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 8192,
    temperature: 0
  });

  const text = (response.response || '').trim();
  return { text, raw: text };
}

function detectLanguageFromText(text) {
  if (!text) return 'en';
  const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
  const telugu = (text.match(/[\u0C00-\u0C7F]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;

  if (devanagari >= 4 && devanagari >= telugu) return 'hi';
  if (telugu >= 4 && telugu > devanagari) return 'te';
  if (latin > 0) return 'en';
  return devanagari > telugu ? 'hi' : telugu > 0 ? 'te' : 'en';
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

  // Protect long numbers (roll numbers, application numbers, etc.)
  result = result.replace(/\b(\d{5,})\b/g, (match) => {
    const ph = `<PROT_${idx++}>`;
    map.set(ph, match);
    return ph;
  });

  // Protect all punctuation: । ? ! , ; : " ' ( ) [ ] -
  result = result.replace(/[।?!,;:\"'()\[\]{}-]/g, (match) => {
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

// ═══════════════════════════════════════════════════════════════
// STEP 2: LLM contextual correction — returns only patch list
async function llmContextualCorrection(ocrText, imageBase64, mimeType, env, language = 'en') {
  if (!env.AI) return { corrections: [], confidence: 0.9 };

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const languageName = { en: 'English', hi: 'Hindi', te: 'Telugu' }[language] || 'the detected language';

  const prompt = `You are a visual OCR verifier for ${languageName}. You have the ORIGINAL IMAGE and a first-pass OCR transcription.

Return ONLY a JSON patch list. Do NOT regenerate the document.

STRICT RULES:
1. Correct only characters/words that are visibly misread by OCR.
2. Never improve spelling, grammar, wording, factual content, or historical facts.
3. Never paraphrase.
4. Never add or remove headings, questions, rows, columns, or answer choices.
5. Preserve the student's/source author's mistakes exactly.
6. Treat dates, numbers, names, punctuation and layout as high-risk. Change them only if the image makes the OCR misread unmistakable.
7. A correction's "original" MUST be an exact substring of OCR TEXT.
8. Keep replacements as small as possible: normally one word or one short phrase.
9. If uncertain, return no correction.
10. Confidence >= 0.97 means the image clearly proves the patch.

Return ONLY valid JSON:
{
  "corrections": [
    {
      "original": "exact OCR substring",
      "corrected": "exact text visible in image",
      "confidence": 0.99,
      "reason": "visual OCR misread"
    }
  ],
  "overall_confidence": 0.95
}

If no safe patch is needed:
{"corrections": [], "overall_confidence": 0.98}

OCR TEXT:
${ocrText}`;

  const response = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 4096,
    temperature: 0
  });

  const raw = (response.response || '').trim();
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const fenced = raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
    if (fenced) {
      try { parsed = JSON.parse(fenced[1]); } catch (_) {}
    }
    if (!parsed) {
      const objectMatch = raw.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
      if (objectMatch) {
        try { parsed = JSON.parse(objectMatch[0]); } catch (_) {}
      }
    }
  }

  if (!parsed || !Array.isArray(parsed.corrections)) {
    return { corrections: [], confidence: 0.9 };
  }

  const corrections = parsed.corrections
    .filter(p => p && typeof p.original === 'string' && typeof p.corrected === 'string')
    .filter(p => p.original.length > 0 && p.original !== p.corrected)
    .filter(p => ocrText.includes(p.original))
    .map(p => ({
      original: p.original,
      corrected: p.corrected,
      confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
      reason: p.reason || 'visual OCR verification'
    }));

  return {
    corrections,
    confidence: Math.max(0, Math.min(1, Number(parsed.overall_confidence) || 0.9))
  };
}

function postProcessHindi(text, language) {
  if (!text || text === 'No text detected') return text;
  return text.replace(/\u0000/g, '').normalize('NFC');
}

function getAppliedCorrections(original, corrected) {
  const corrections = [
    ['रेम्युलेटिंग', 'रेग्युलेटिंग'],
    ['विलियम बैटिक', 'विलियम बैंटिक'],
    ['लॉर्ड बैटिक', 'लॉर्ड बैंटिक'],
    ['चारपेकर बंदुओं', 'चापेकर बंधुओं'],
    ['रैड को हत्या', 'रैंड की हत्या'],
    ['जार्ज यूल', 'जॉर्ज यूल'],
    ['मैकले का', 'मैकाले का'],
    ['बैटिक', 'बैंटिक'],
    ['चारपेकर', 'चापेकर'],
    ['बंदुओं', 'बंधुओं'],
    ['रैड', 'रैंड'],
    ['जार्ज', 'जॉर्ज'],
    ['मैकले', 'मैकाले'],
  ];
  
  const applied = [];
  for (const [wrong, correct] of corrections) {
    if (original.includes(wrong)) {
      applied.push({ from: wrong, to: correct });
    }
  }
  return applied;
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

// ── DOC/DOCX text extraction (basic) ──
async function extractDocText(buffer, ext) {
  if (ext === 'docx' || ext === 'odt') {
    // DOCX is a ZIP file, try to extract word/document.xml
    try {
      const unzipResult = await unzipBuffer(buffer);
      for (const [name, content] of Object.entries(unzipResult)) {
        if (name.includes('document.xml') || name.includes('content.xml')) {
          const text = new TextDecoder('utf-8').decode(content);
          return stripXmlTags(text);
        }
      }
    } catch (e) {
      // Fallback: try raw text extraction
    }
  }
  // Fallback: extract readable text from binary
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(buffer);
  const readable = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  return readable || 'Could not extract readable text from this document.';
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
