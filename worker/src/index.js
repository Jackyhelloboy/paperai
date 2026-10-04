import { DurableObject } from 'cloudflare:workers';
import { handleDrafts, purgeExpiredDrafts } from './drafts.js';
import { DICTIONARY, getDictionaryWords, isInDictionary, CONFUSION_PAIRS, autoCorrect, verifyWord, getSuggestions } from './dictionary.js';

const DAILY_FREE_NEURONS = 10000;
// The free allowance is shared by everyone using the site, so one browser must
// not be able to use it all. Each browser gets its own daily share, and the
// shared total stays as the outer ceiling.
const PER_USER_DAILY_NEURONS = 1000;
// Guard against an unbounded owner map in a single day.
const MAX_TRACKED_OWNERS = 600;
const GEMMA4_INPUT_NEURONS_PER_MILLION = 9091;
const GEMMA4_OUTPUT_NEURONS_PER_MILLION = 27273;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-PaperAI-Owner',
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
          'POST /api/analyze-paper',
          'POST /api/suggest-word',
          'GET /api/usage',
          'WS /api/live',
          'GET /health',
        ],
        architecture: 'production-literal-ocr-v26',
      }, { headers: corsHeaders });
    }

    if (url.pathname === '/health') {
      return Response.json({
        status: 'healthy',
        platform: 'cloudflare-workers',
        architecture: 'production-literal-ocr-v26',
        model: '@cf/google/gemma-4-26b-a4b-it',
        ocr_provider: 'cloudflare-ai',
      }, { headers: corsHeaders });
    }

    if (url.pathname === '/api/live') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return Response.json({ error: 'WebSocket upgrade required' }, { status: 426, headers: corsHeaders });
      }
      return getPresenceStub(env).fetch(request);
    }

    // Public daily free-AI quota dashboard. This is a PaperAI-side estimate
    // calculated from Workers AI token usage returned after each OCR request.
if (url.pathname === '/api/usage' && request.method === 'GET') {
      try {
        const usage = await getUsageStatus(env);
        const owner = String(request.headers.get('X-PaperAI-Owner') || '').slice(0, 64);
        const check = /^[A-Za-z0-9_-]{20,64}$/.test(owner)
          ? await checkOwnerAllowance(env, new Request(request.url, { headers: { 'X-PaperAI-Owner': owner } }))
          : null;
        return Response.json({
          ...usage,
          per_user_limit: PER_USER_DAILY_NEURONS,
          owner_remaining: check?.ok === false ? 0 : (check?.status?.owner_remaining ?? PER_USER_DAILY_NEURONS),
          owner_allowed: check ? check.ok : true,
          owner_blocked_reason: check && !check.ok ? (check.code || '') : '',
        }, {
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
          per_user_limit: PER_USER_DAILY_NEURONS,
        }, { status: 503, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/ocr' && request.method === 'POST') {
      try {
        return await handleOCR(request, env, corsHeaders);
      } catch (e) {
        return Response.json({ error: e.message || 'OCR request failed' }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/analyze-paper' && request.method === 'POST') {
      try {
        return await handlePaperAnalysis(request, env, corsHeaders);
      } catch (e) {
        if (isDailyFreeLimitError(e)) {
          try { await markUsageExhausted(env); } catch (_) {}
          return Response.json({ error: 'Daily free AI limit reached', code: 'FREE_AI_LIMIT_REACHED' }, { status: 429, headers: corsHeaders });
        }
        return Response.json({
          status: 'completed',
          analysis: fallbackPaperAnalysis([]),
          warning: 'Paper continuity AI was unavailable: ' + (e?.message || 'unknown error')
        }, { headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/suggest-word' && request.method === 'POST') {
      try {
        return await handleWordSuggestion(request, env, corsHeaders);
      } catch (e) {
        if (isDailyFreeLimitError(e)) {
          try { await markUsageExhausted(env); } catch (_) {}
          return Response.json({ suggestions: [], code: 'FREE_AI_LIMIT_REACHED' }, { status: 429, headers: corsHeaders });
        }
        if (isPaidModelRequiredError(e)) {
          return Response.json({ suggestions: [], code: 'FREE_MODEL_UNAVAILABLE' }, { status: 503, headers: corsHeaders });
        }
        return Response.json({ suggestions: [], error: 'Suggestion service unavailable' }, { status: 503, headers: corsHeaders });
      }
    }

    if ((url.pathname.startsWith('/api/train/') || url.pathname === '/api/debug') && !isAdminRequest(request, env)) {
      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
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

    // Drafts: build one document page by page across many sessions.
    if (url.pathname.startsWith('/api/drafts')) {
      try {
        return await handleDrafts(request, env, corsHeaders, url);
      } catch (e) {
        return Response.json({ error: e?.message || 'Draft request failed' }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },

  // Daily cleanup: R2 lifecycle rules delete page photos after 60 days, and this
  // removes the drafts and rows that pointed at them.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(purgeExpiredDrafts(env).catch(e => console.log('[Drafts] purge failed:', e?.message || e)));
  },
};

export class UsageTracker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  broadcastPresence(exclude = null) {
    const sockets = this.ctx.getWebSockets();
    const active = sockets.filter(ws => ws !== exclude).length;
    const message = JSON.stringify({ type: 'presence', active });

    for (const ws of sockets) {
      if (ws === exclude) continue;
      try { ws.send(message); } catch (_) {}
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/api/live') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return Response.json({ active: this.ctx.getWebSockets().length }, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectedAt: Date.now() });
      this.broadcastPresence();

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

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
        tracking_started_at: now.toISOString(),
      };
    }

    if (request.method === 'POST' && url.pathname === '/add') {
      const body = await request.json();
      const neurons = Number(body.neurons) || 0;
      const owner = String(body.owner || '').slice(0, 64);

      if (Number.isFinite(neurons) && neurons > 0) {
        state.used = Math.min(DAILY_FREE_NEURONS, state.used + neurons);
        state.requests += 1;
        if (owner) {
          const owners = state.owners || (state.owners = {});
          owners[owner] = Math.round(((Number(owners[owner]) || 0) + neurons) * 100) / 100;
          const keys = Object.keys(owners);
          if (keys.length > MAX_TRACKED_OWNERS) {
            // Drop the smallest consumers first, so heavy users stay counted.
            keys.sort((a, b) => (owners[b] || 0) - (owners[a] || 0));
            for (const key of keys.slice(MAX_TRACKED_OWNERS)) delete owners[key];
          }
        }
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

    if (request.method === 'POST' && url.pathname === '/owner-check') {
      const owner = String((await request.json())?.owner || '').slice(0, 64);
      const used = owner ? Number((state.owners || {})[owner]) || 0 : 0;
      const remaining = Math.max(0, PER_USER_DAILY_NEURONS - used);
      const sharedRemaining = Math.max(0, DAILY_FREE_NEURONS - (Number(state.used) || 0));
      return Response.json({
        owner_tracked: Boolean(owner),
        per_user_limit: PER_USER_DAILY_NEURONS,
        owner_used: Math.round(used * 100) / 100,
        owner_remaining: Math.round(remaining * 100) / 100,
        shared_remaining: Math.round(sharedRemaining * 100) / 100,
        // Either ceiling stops the request, so nobody can take the shared pool.
        allowed: Boolean(owner) && remaining > 0 && sharedRemaining > 0,
        reason: remaining <= 0 ? 'PER_USER_LIMIT' : (sharedRemaining <= 0 ? 'SHARED_LIMIT' : ''),
      }, { headers: { 'Cache-Control': 'no-store' } });
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
      tracking_started_at: state.tracking_started_at || null,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }

  webSocketMessage(ws, message) {
    const active = this.ctx.getWebSockets().length;
    try { ws.send(JSON.stringify({ type: 'presence', active })); } catch (_) {}
  }

  webSocketClose(ws) {
    this.broadcastPresence(ws);
  }

  webSocketError(ws) {
    this.broadcastPresence(ws);
  }
}

function isAdminRequest(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}

function getPresenceStub(env) {
  if (!env.USAGE_TRACKER) {
    throw new Error('USAGE_TRACKER Durable Object binding is not configured');
  }
  const id = env.USAGE_TRACKER.idFromName('paperai-live-presence');
  return env.USAGE_TRACKER.get(id);
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

async function recordAiUsage(env, usage, owner) {
  const neurons = estimateGemma4Neurons(usage);
  if (!(neurons > 0)) return;

  await getUsageStub(env).fetch('https://usage.internal/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ neurons, owner: String(owner || '') }),
  });
}

async function markUsageExhausted(env) {
  await getUsageStub(env).fetch('https://usage.internal/exhausted', {
    method: 'POST',
  });
}

// Fair use: the daily allowance is shared, so check the caller's own daily
// share before spending any of it. The browser key is not a security token, it
// simply stops one visitor using up everyone else's allowance.
async function checkOwnerAllowance(env, request) {
  const owner = String(request.headers.get('X-PaperAI-Owner') || '').slice(0, 64);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(owner)) {
    return { ok: false, status: 400, error: 'Missing browser key.', code: 'OWNER_REQUIRED' };
  }

  try {
    const res = await getUsageStub(env).fetch('https://usage.internal/owner-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner }),
    });
    const status = await res.json();
    if (status?.allowed) return { ok: true, owner, status };

    const perUser = status?.reason === 'PER_USER_LIMIT';
    return {
      ok: false,
      owner,
      status,
      status_code: perUser ? 429 : 503,
      error: perUser
        ? 'You have used your ' + PER_USER_DAILY_NEURONS + ' free Neurons for today. The shared daily free limit resets at 00:00 UTC.'
        : 'The shared daily free AI limit has been reached today. It resets at 00:00 UTC.',
      code: perUser ? 'PER_USER_AI_LIMIT_REACHED' : 'FREE_AI_LIMIT_REACHED',
    };
  } catch (e) {
    // If the tracker cannot answer, do not silently spend the shared pool.
    return { ok: false, owner, status_code: 503, error: 'Usage check unavailable. Please try again.', code: 'USAGE_CHECK_FAILED' };
  }
}

const SUGGESTION_LANGUAGES = Object.freeze({
  en: { label: 'English', script: 'Latin' },
  hi: { label: 'Hindi', script: 'Devanagari' },
  mr: { label: 'Marathi', script: 'Devanagari' },
  te: { label: 'Telugu', script: 'Telugu' },
  ta: { label: 'Tamil', script: 'Tamil' },
  kn: { label: 'Kannada', script: 'Kannada' },
  ml: { label: 'Malayalam', script: 'Malayalam' },
  bn: { label: 'Bengali', script: 'Bengali' },
  gu: { label: 'Gujarati', script: 'Gujarati' },
  pa: { label: 'Punjabi', script: 'Gurmukhi' },
  or: { label: 'Odia', script: 'Odia' },
  ur: { label: 'Urdu', script: 'Perso-Arabic' },
  ks: { label: 'Kashmiri', script: 'Perso-Arabic' },
});

function cleanSuggestionArray(value, max = 5) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const candidate = String(item || '').normalize('NFC').trim();
    if (!candidate || candidate.length > 180 || /[\r\n<>]/.test(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

function candidateMatchesSuggestionScript(value, language) {
  const text = String(value || '');
  const patterns = {
    en: /[A-Za-z]/,
    hi: /[\u0900-\u097F]/,
    mr: /[\u0900-\u097F]/,
    bn: /[\u0980-\u09FF]/,
    pa: /[\u0A00-\u0A7F]/,
    gu: /[\u0A80-\u0AFF]/,
    or: /[\u0B00-\u0B7F]/,
    ta: /[\u0B80-\u0BFF]/,
    te: /[\u0C00-\u0C7F]/,
    kn: /[\u0C80-\u0CFF]/,
    ml: /[\u0D00-\u0D7F]/,
    ur: /[\u0600-\u06FF]/,
    ks: /[\u0600-\u06FF]/,
  };
  return patterns[language]?.test(text) ?? true;
}

function parseSuggestionJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.unshift(fenced[1].trim());
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.unshift(objectMatch[0]);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.unshift(arrayMatch[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return cleanSuggestionArray(parsed);
      if (Array.isArray(parsed?.suggestions)) return cleanSuggestionArray(parsed.suggestions);
    } catch (_) {}
  }
  return [];
}

function cleanPaperPage(value, fallbackIndex = 0) {
  const page = value && typeof value === 'object' ? value : {};
  return {
    index: Number.isInteger(Number(page.index)) ? Number(page.index) : fallbackIndex,
    filename: String(page.filename || '').slice(0, 180),
    text: String(page.text || '').slice(0, 7000),
    profile: page.profile && typeof page.profile === 'object' ? page.profile : {},
  };
}

function fallbackPaperAnalysis(pages = []) {
  const clean = Array.isArray(pages) ? pages.map(cleanPaperPage) : [];
  return {
    documents: clean.length ? [{
      label: 'Paper 1',
      class: null,
      subject: null,
      exam: null,
      confidence: 'low',
      page_indices: clean.map(p => p.index),
      sections: [],
      warnings: [],
    }] : [],
    pages: clean.map((p, order) => ({
      index: p.index,
      document: 0,
      order,
      continuation_of_section: null,
      warnings: [],
    })),
    warnings: [],
    source: 'fallback',
  };
}

function parsePaperAnalysisJson(text, pages) {
  const raw = String(text || '').trim();
  const candidates = [raw];
  const fenced = raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i);
  if (fenced) candidates.unshift(fenced[1].trim());
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.unshift(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || !Array.isArray(parsed.documents) || !Array.isArray(parsed.pages)) continue;

      const validIndices = new Set(pages.map(p => p.index));
      const used = new Set();
      const documents = [];

      for (let d = 0; d < parsed.documents.length; d++) {
        const doc = parsed.documents[d] || {};
        const indices = Array.isArray(doc.page_indices)
          ? doc.page_indices.map(Number).filter(i => validIndices.has(i) && !used.has(i))
          : [];
        for (const i of indices) used.add(i);
        if (!indices.length) continue;

        const sections = Array.isArray(doc.sections) ? doc.sections.slice(0, 24).map(section => ({
          label: String(section?.label ?? '').slice(0, 24) || null,
          title: String(section?.title ?? '').slice(0, 240) || null,
          marks: String(section?.marks ?? '').slice(0, 40) || null,
          expected_items: Number.isFinite(Number(section?.expected_items)) ? Number(section.expected_items) : null,
          found_items: Number.isFinite(Number(section?.found_items)) ? Number(section.found_items) : null,
          page_indices: Array.isArray(section?.page_indices)
            ? section.page_indices.map(Number).filter(i => validIndices.has(i))
            : [],
          warnings: Array.isArray(section?.warnings) ? section.warnings.map(x => String(x).slice(0,180)).slice(0,8) : [],
        })) : [];

        documents.push({
          label: String(doc.label || ('Paper ' + (documents.length + 1))).slice(0,80),
          class: doc.class == null ? null : String(doc.class).slice(0,80),
          subject: doc.subject == null ? null : String(doc.subject).slice(0,80),
          exam: doc.exam == null ? null : String(doc.exam).slice(0,80),
          confidence: ['high','medium','low'].includes(doc.confidence) ? doc.confidence : 'low',
          page_indices: indices,
          sections,
          warnings: Array.isArray(doc.warnings) ? doc.warnings.map(x => String(x).slice(0,180)).slice(0,12) : [],
        });
      }

      const unassigned = pages.map(p => p.index).filter(i => !used.has(i));
      if (unassigned.length) {
        documents.push({
          label: 'Unmatched pages',
          class: null,
          subject: null,
          exam: null,
          confidence: 'low',
          page_indices: unassigned,
          sections: [],
          warnings: ['These pages could not be confidently matched to another paper.'],
        });
      }

      const pageRows = [];
      for (let d = 0; d < documents.length; d++) {
        documents[d].page_indices.forEach((index, order) => {
          const supplied = parsed.pages.find(p => Number(p?.index) === index) || {};
          pageRows.push({
            index,
            document: d,
            order,
            continuation_of_section: supplied.continuation_of_section == null
              ? null
              : String(supplied.continuation_of_section).slice(0,80),
            warnings: Array.isArray(supplied.warnings)
              ? supplied.warnings.map(x => String(x).slice(0,180)).slice(0,8)
              : [],
          });
        });
      }

      return {
        documents,
        pages: pageRows,
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.map(x => String(x).slice(0,200)).slice(0,16)
          : [],
        source: 'workers-ai',
      };
    } catch (_) {}
  }

  return fallbackPaperAnalysis(pages);
}

async function handlePaperAnalysis(request, env, corsHeaders) {
  const body = await request.json().catch(() => ({}));
  const pages = Array.isArray(body?.pages)
    ? body.pages.slice(0, 24).map((page, index) => cleanPaperPage(page, index))
    : [];
  const knownPatterns = Array.isArray(body?.known_patterns)
    ? body.known_patterns.slice(0, 8).map(pattern => ({
        class: pattern?.class == null ? null : String(pattern.class).slice(0,80),
        subject: pattern?.subject == null ? null : String(pattern.subject).slice(0,80),
        exam: pattern?.exam == null ? null : String(pattern.exam).slice(0,80),
        sections: Array.isArray(pattern?.sections)
          ? pattern.sections.slice(0,16).map(section => ({
              label: section?.label == null ? null : String(section.label).slice(0,24),
              title: section?.title == null ? null : String(section.title).slice(0,140),
              marks: section?.marks == null ? null : String(section.marks).slice(0,40),
              expected_items: Number.isFinite(Number(section?.expected_items))
                ? Number(section.expected_items)
                : null,
            }))
          : [],
      }))
    : [];

  if (!pages.length) {
    return Response.json({ status: 'completed', analysis: fallbackPaperAnalysis([]) }, {
      headers: { ...corsHeaders, 'Cache-Control': 'no-store, max-age=0' }
    });
  }

  if (!env.AI) {
    return Response.json({ status: 'completed', analysis: fallbackPaperAnalysis(pages) }, {
      headers: { ...corsHeaders, 'Cache-Control': 'no-store, max-age=0' }
    });
  }

  const knownPatternText = knownPatterns.length
    ? [
        '',
        'SAFE HISTORICAL FORMAT HINTS:',
        'These are user-local section skeletons from prior papers. Use them only as weak evidence for section ordering/count expectations when the current OCR visibly supports the same class/subject/exam. Never copy question wording or invent a missing section/item from these hints.',
        JSON.stringify(knownPatterns)
      ].join('\n')
    : '';

  const pageText = pages.map(page => [
    '--- PAGE INDEX ' + page.index + ' ---',
    'Filename: ' + (page.filename || 'unknown'),
    'Page profile: ' + JSON.stringify(page.profile || {}),
    page.text || '[no readable text]'
  ].join('\n')).join('\n\n');

  const prompt = [
    'You are PaperAI Paper Continuity Analyzer.',
    'Analyze the organization of a batch of OCR pages. DO NOT rewrite, correct, translate, solve, or invent any source text.',
    '',
    'GOALS:',
    '1. Decide which pages belong to the same school question paper/answer sheet.',
    '2. Order pages inside each paper using visible header identity and section/question continuity.',
    '3. Identify visible class, subject and exam/test name only when supported by OCR.',
    '4. Detect section/bit sequence such as I, II, III, IV, V, VI and whether a page continues a section from another page.',
    '5. For marks formulas like 3x2=6M or 4×1=4, expected_items is the first number. Count found numbered items literally; if they disagree, report a warning but NEVER delete/add an item.',
    '6. Recognize common school-paper bits: short answers, word meanings, singular/plural, antonyms, fill-in-the-blanks with choices, matching, true/false, word-search/grid.',
    '',
    'GROUPING RULES:',
    '- A shared school name alone is NOT enough to group pages.',
    '- Prefer visible class/subject/exam header identity.',
    '- A continuation page may have no header; attach it only when section numbering/content pattern strongly continues another page.',
    '- Match continuation pages using the open section signature: section label, marks formula, last visible item number on the header page, first visible item number on the continuation page, and the next section label. Item-number continuation is stronger evidence than school name.',
    '- A page beginning with later items of section IV and then sections V/VI is likely a continuation only of a header page whose last open section is IV and whose numbering can continue into those items.',
    '- If two candidate header pages have different exam labels or incompatible open-section/marks signatures, keep their continuation pages separate rather than guessing.',
    '- If two header pages show different exam labels/classes, keep them in separate documents even if both are Hindi and from the same school.',
    '- Every input page index must appear exactly once.',
    '- If uncertain, keep a page separate rather than forcing a match.',
    '',
    'ACCURACY RULES:',
    '- Never reconstruct missing question wording from a class pattern.',
    '- Never use textbook/world knowledge to fill unreadable text.',
    '- Section patterns may be used only for grouping, ordering, count checks and formatting.',
    '- Preserve OCR mistakes as evidence; this endpoint is structural analysis only.',
    '',
    'Return strict JSON only in this schema:',
    '{"documents":[{"label":"Paper 1","class":"V","subject":"Hindi","exam":"FA-IV","confidence":"high","page_indices":[2,0],"sections":[{"label":"I","title":"visible heading","marks":"3x2=6M","expected_items":3,"found_items":3,"page_indices":[2],"warnings":[]}],"warnings":[]}],"pages":[{"index":2,"document":0,"order":0,"continuation_of_section":null,"warnings":[]},{"index":0,"document":0,"order":1,"continuation_of_section":"IV","warnings":[]}],"warnings":[]}',
    knownPatternText,
    '',
    pageText
  ].join('\n');

  let response;
  try {
    response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        { role: 'system', content: 'Return only strict JSON for question-paper grouping and continuity. Never rewrite source text.' },
        { role: 'user', content: prompt },
      ],
      max_completion_tokens: 1800,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    }, { rejectIfBusy: true });
  } catch (e) {
    return Response.json({
      status: 'completed',
      analysis: fallbackPaperAnalysis(pages),
      warning: 'Continuity analysis fell back to upload order.'
    }, { headers: { ...corsHeaders, 'Cache-Control': 'no-store, max-age=0' } });
  }

  try { await recordAiUsage(env, response?.usage || null); } catch (_) {}

  const analysis = parsePaperAnalysisJson(extractAiText(response), pages);
  return Response.json({ status: 'completed', analysis }, {
    headers: { ...corsHeaders, 'Cache-Control': 'no-store, max-age=0' }
  });
}

async function handleWordSuggestion(request, env, corsHeaders) {
  if (!env.AI) return Response.json({ suggestions: [] }, { headers: corsHeaders });

  const body = await request.json().catch(() => ({}));
  const input = String(body?.text ?? body?.word ?? '').replace(/\s+/g, ' ').trim();
  const sourceLanguage = SUGGESTION_LANGUAGES[body?.source_language] ? body.source_language : 'en';
  const language = SUGGESTION_LANGUAGES[body?.language] ? body.language : 'en';
  const sourceMeta = SUGGESTION_LANGUAGES[sourceLanguage];
  const meta = SUGGESTION_LANGUAGES[language];
  const context = String(body?.context || '').replace(/[\r\n]+/g, ' ').slice(0, 260);
  const localSuggestions = cleanSuggestionArray(body?.local_suggestions || [], 5);
  const learnedSuggestions = cleanSuggestionArray(body?.learned_suggestions || [], 5);

  if (!input || input.length > 120 || !/^[\p{L}\p{M}][\p{L}\p{M}'’\- ]*$/u.test(input)) {
    return Response.json({ suggestions: [] }, { headers: corsHeaders });
  }

  const wordCount = input.split(/\s+/).filter(Boolean).length;
  const isPhrase = wordCount >= 2;

  let targetInstruction;
  if (sourceLanguage === language) {
    targetInstruction = [
      'Source and target are both ' + meta.label + '.',
      'Suggest corrected spelling or script form while preserving the same spoken words and meaning.',
      'Do not translate into a different language.'
    ].join('\n');
  } else {
    targetInstruction = [
      'Source language: ' + sourceMeta.label + ' (' + sourceMeta.script + ' script).',
      'Target language/script: ' + meta.label + ' (' + meta.script + ' script).',
      'This feature is PHONETIC TRANSLITERATION, not semantic translation.',
      '- Preserve the spoken words, names, and phrase meaning exactly.',
      '- Change only the writing script so the result sounds like the source when read aloud.',
      '- Never replace an English phrase with its Hindi/Telugu/etc. meaning.',
      '- Use PRONUNCIATION-BASED transliteration for English: transliterate how the English sounds, not how its letters are spelled.',
      '- Example: English "i love you" to Hindi should be "आई लव यू". Do NOT output spelling-based "इ लोवे योउ" and do NOT semantically translate it.',
      '- Example: English "love" to Hindi should be "लव"; "you" should be "यू"; "I" should be "आई".',
      '- Example: English name "jawad" to Hindi should be "जवाद".',
      '- Preserve names, brands, acronyms and technical identifiers phonetically.'
    ].join('\n');
  }

  const prompt = [
    'You are a smart multilingual typing engine inside an OCR correction editor.',
    '',
    targetInstruction,
    '',
    'Input text: "' + input + '"',
    'Nearby document context: "' + (context || 'none') + '"',
    'Local offline candidates: ' + JSON.stringify(localSuggestions),
    'Previously user-corrected candidates: ' + JSON.stringify(learnedSuggestions),
    '',
    'Rules:',
    '- Return 1 to 5 candidate strings only.',
    '- Put the best candidate first.',
    '- Preserve the original pronunciation as closely as the target script allows.',
    '- Preserve the same phrase meaning by keeping the same spoken words; do not semantically translate.',
    '- Treat previously user-corrected candidates as strong personal evidence when they match the same pronunciation.',
    '- Never force a learned correction when it is unrelated to the current spoken form.',
    '- Prefer natural target-script spellings over letter-by-letter Roman spelling.',
    '- Reject candidates written mainly in the wrong script.',
    '- Do not explain your choice.',
    '- Do not add quotation marks around candidates.',
    '- Output strict JSON exactly like {"suggestions":["candidate1","candidate2"]}.',
  ].join('\n');

  const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
    messages: [
      { role: 'system', content: 'Return only compact JSON pronunciation-based transliteration suggestions. For English, convert the actual spoken pronunciation into the target script, not the raw spelling. Preserve the spoken words and never semantically translate them.' },
      { role: 'user', content: prompt },
    ],
    max_completion_tokens: 240,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
  }, { rejectIfBusy: true });

  try { await recordAiUsage(env, response?.usage || null); } catch (_) {}

  const aiSuggestions = parseSuggestionJson(extractAiText(response))
    .filter(candidate => candidateMatchesSuggestionScript(candidate, language));

  const suggestions = cleanSuggestionArray([
    ...learnedSuggestions.filter(candidate => candidateMatchesSuggestionScript(candidate, language)),
    ...aiSuggestions,
    ...localSuggestions.filter(candidate => candidateMatchesSuggestionScript(candidate, language)),
  ], 5);

  return Response.json({
    suggestions,
    source_language: sourceLanguage,
    language,
    mode: isPhrase ? 'phonetic_phrase' : 'phonetic_word',
    source: 'workers-ai',
  }, {
    headers: { ...corsHeaders, 'Cache-Control': 'no-store, max-age=0' },
  });
}
async function handleOCR(request, env, corsHeaders) {
  const contentType = request.headers.get('content-type') || '';

  let fileBuffer = null;
  let imageDataBase64 = '';
  let mimeType = 'image/jpeg';
  let filename = 'unknown';
  let language = 'auto';
  let difficulty = 'auto';
  let imageMeta = {};
  const detailImages = [];
  let learningHints = [];
  let paperContext = {};
  let layoutOptions = {
    preset: 'auto',
    density: 'auto',
    aiLayoutCheck: true,
    titleAlign: 'auto',
    fontScale: 'auto',
    headingWeight: 'auto',
    englishFont: 'Tahoma',
  };

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return Response.json({ error: 'No file in form data' }, { status: 400, headers: corsHeaders });
    }
    filename = file.name;
    mimeType = file.type || 'application/octet-stream';
    for (let index = 0; index < 2; index++) {
      const detail = formData.get('detail_' + index);
      if (detail && typeof detail.arrayBuffer === 'function' && detail.size <= 4 * 1024 * 1024 && /^image\/(?:jpeg|png|webp)$/.test(detail.type)) {
        detailImages.push({ mimeType: detail.type, base64: arrayBufferToBase64(await detail.arrayBuffer()) });
      }
    }
    language = formData.get('language') || 'auto';
    difficulty = normalizeDifficulty(formData.get('difficulty'));
    try {
      imageMeta = JSON.parse(formData.get('image_meta') || '{}');
    } catch (_) {
      imageMeta = {};
    }
    try {
      const hints = JSON.parse(formData.get('learning_hints') || '[]');
      learningHints = sanitizeLearningHints(hints);
    } catch (_) {
      learningHints = [];
    }
    try {
      paperContext = JSON.parse(formData.get('paper_context') || '{}');
      if (!paperContext || typeof paperContext !== 'object') paperContext = {};
    } catch (_) {
      paperContext = {};
    }
    try {
      const requested = JSON.parse(formData.get('layout_options') || '{}');
      layoutOptions = {
        preset: ['auto','question-paper','worksheet','form','table','preserve'].includes(requested?.preset) ? requested.preset : 'auto',
        density: ['auto','compact','normal','spacious'].includes(requested?.density) ? requested.density : 'auto',
        titleAlign: ['auto','left','center','right'].includes(requested?.titleAlign) ? requested.titleAlign : 'auto',
        fontScale: ['auto','small','normal','large'].includes(requested?.fontScale) ? requested.fontScale : 'auto',
        headingWeight: ['auto','bold','normal'].includes(requested?.headingWeight) ? requested.headingWeight : 'auto',
        aiLayoutCheck: requested?.aiLayoutCheck !== false,
        englishFont: 'Tahoma',
      };
    } catch (_) {}
    const buffer = await file.arrayBuffer();
    fileBuffer = buffer;
    imageDataBase64 = arrayBufferToBase64(buffer);
  } else if (contentType.includes('application/json')) {
    const body = await request.json();
    imageDataBase64 = body.image || body.base64 || '';
    mimeType = body.mimeType || body.mime_type || 'image/jpeg';
    filename = body.filename || 'unknown';
    language = body.language || 'auto';
    difficulty = normalizeDifficulty(body.difficulty);
    imageMeta = body.image_meta || {};
    learningHints = sanitizeLearningHints(body.learning_hints || []);
    paperContext = body.paper_context && typeof body.paper_context === 'object' ? body.paper_context : {};
    const requestedLayout = body.layout_options || {};
    layoutOptions = {
      preset: ['auto','question-paper','worksheet','form','table','preserve'].includes(requestedLayout?.preset) ? requestedLayout.preset : 'auto',
      density: ['auto','compact','normal','spacious'].includes(requestedLayout?.density) ? requestedLayout.density : 'auto',
      titleAlign: ['auto','left','center','right'].includes(requestedLayout?.titleAlign) ? requestedLayout.titleAlign : 'auto',
      fontScale: ['auto','small','normal','large'].includes(requestedLayout?.fontScale) ? requestedLayout.fontScale : 'auto',
      headingWeight: ['auto','bold','normal'].includes(requestedLayout?.headingWeight) ? requestedLayout.headingWeight : 'auto',
      aiLayoutCheck: requestedLayout?.aiLayoutCheck !== false,
      englishFont: 'Tahoma',
    };
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

  // Fair use: refuse before spending any shared allowance.
  const allowance = await checkOwnerAllowance(env, request);
  if (!allowance.ok) {
    return Response.json({
      error: allowance.error,
      code: allowance.code,
      per_user_limit: PER_USER_DAILY_NEURONS,
      resets_at: '00:00 UTC daily',
    }, { status: allowance.status_code || 429, headers: corsHeaders });
  }

  let aiResult;
  try {
    aiResult = await runAI(imageDataBase64, mimeType, env, language, difficulty, imageMeta, learningHints, layoutOptions, paperContext, detailImages);
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
    if (isAiTimeoutError(e)) {
      return Response.json({
        error: 'The detailed AI read timed out. Retry this page with the same advanced model.',
        code: 'AI_TIMEOUT',
      }, { status: 408, headers: corsHeaders });
    }
    return Response.json({
      error: 'AI OCR failed: ' + (e?.message || 'unknown error'),
      code: 'AI_OCR_FAILED',
    }, { status: 502, headers: corsHeaders });
  }

  // Record this successful inference for the public daily usage graph.
  // Failure to write analytics must never block the OCR result.
  try {
    await recordAiUsage(env, aiResult.usage || null, allowance.owner);
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
  const profileMatch = correctedText.match(/^\s*\[\[PAGE_PROFILE:\s*([\s\S]*?)\]\]\s*$/mi);
  const layoutProfileRaw = profileMatch ? profileMatch[1].trim() : '';
  const plainText = stripOcrMetadata(correctedText);

  // Compute post-correction confidence
  const highConfCorrections = allCorrections.filter(c => c.confidence >= 0.95);

  return Response.json({
    status: 'completed',
    result: {
      pages: [{
        page: 1,
        text: plainText,
        annotated_text: correctedText,
        regions: countRegions(plainText),
      }],
      full_text: plainText,
      annotated_text: correctedText,
      raw_text: rawOcrText,
      verified_text: plainText,
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
        total_characters: plainText.length,
        engine: aiResult.error ? 'error' : (aiResult.provider || 'cloudflare-ai'),
        error: aiResult.error || null,
        language: effectiveLanguage,
        requested_language: language,
        layout_profile: layoutProfileRaw,
        layout_options: layoutOptions,
        paper_context_used: Boolean(paperContext && (paperContext.previous_page_tail || paperContext.page_index != null)),
        detected_language: detectedLanguage,
        mode: 'free_only_literal_transcription',
        billing_safety: 'free_only_conditional_verification_no_paid_fallback',
        model: aiResult.model || 'unknown',
        architecture: 'production-literal-ocr-v26',
        scan_mode: aiResult.scanMode || difficulty,
        scan_strategy: imageMeta?.scanStrategy || 'full-page',
        detected_lines: Number(imageMeta?.lineCount) || 0,
        verification_pass_used: Boolean(aiResult.rescued),
        image_profile: imageMeta || {},
        learning_hints_used: learningHints.length,
        layout: detectExamLayout(plainText),
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

function sanitizeLearningHints(value) {
  if (!Array.isArray(value)) return [];
  const out = [];

  for (const row of value.slice(0, 20)) {
    const wrong = String(row?.wrong || '').normalize('NFC').trim();
    const right = String(row?.right || '').normalize('NFC').trim();
    if (!wrong || !right || wrong === right) continue;
    if (wrong.length > 40 || right.length > 40) continue;
    if (/[\r\n<>]/.test(wrong + right)) continue;
    out.push({
      wrong,
      right,
      count: Math.max(1, Math.min(99, Number(row?.count) || 1)),
    });
  }

  return out.slice(0, 12);
}

function normalizeDifficulty(value) {
  return value === 'easy' || value === 'hard' ? value : 'auto';
}

function isAiTimeoutError(error) {
  const s = aiErrorText(error);
  return s.includes('3007') ||
    s.includes('3008') ||
    s.includes('request timeout') ||
    s.includes('timed out') ||
    s.includes('timeout') ||
    s.includes('aborted') ||
    s.includes('408');
}

function isTransientAiError(error) {
  const s = aiErrorText(error);
  return s.includes('3040') ||
    s.includes('out of capacity') ||
    s.includes('temporarily unavailable') ||
    s.includes('service unavailable') ||
    s.includes('bad gateway') ||
    s.includes('gateway timeout') ||
    s.includes('502') ||
    s.includes('503') ||
    s.includes('504');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAI(base64Image, mimeType, env, language = 'auto', difficulty = 'auto', imageMeta = {}, learningHints = [], layoutOptions = {}, paperContext = {}, detailImages = []) {
  if (!env.AI) {
    throw new Error('Workers AI not available - check if AI binding is configured');
  }

  const model = '@cf/google/gemma-4-26b-a4b-it';
  const scanStrategy = imageMeta?.scanStrategy || 'full-page';
  const scanMode = 'advanced-detail-preserving';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;
  const imageContent = [
    { type: 'text', text: 'Full source page. Use this frame for reading order, numbering and layout.' },
    { type: 'image_url', image_url: { url: dataUrl } },
    ...detailImages.flatMap((detail, index) => [
      { type: 'text', text: index === 0 ? 'Closer view of the upper part of the SAME page.' : 'Closer view of the lower part of the SAME page. It overlaps the upper view; transcribe each source line only once.' },
      { type: 'image_url', image_url: { url: `data:${detail.mimeType};base64,${detail.base64}` } }
    ])
  ];
  const layoutSection = imageMeta?.structuredLayout
    ? '\nVISUAL LAYOUT HINT:\nThis page contains structured geometry. Preserve rows, columns, long answer lines and connected relationships. Detected multi-column rows: ' +
      (Number(imageMeta?.multiColumnRows) || 0) +
      '; long horizontal rules: ' + (Number(imageMeta?.longHorizontalRules) || 0) +
      '; long vertical rules: ' + (Number(imageMeta?.longVerticalRules) || 0) +
      (imageMeta?.branchingLayout ? '; possible branching/diagram layout detected. Preserve arrows and branch relationships.' : '.') + '\n'
    : '';
  const learnedConfusions = sanitizeLearningHints(learningHints);
  const learningSection = learnedConfusions.length
    ? '\nVISUAL CONFUSION MEMORY (human-corrected examples from this browser):\n' +
      learnedConfusions.map((h, i) =>
        (i + 1) + '. Previously confused "' + h.wrong + '" with "' + h.right + '". Re-check these shapes carefully if a visually similar token appears. NEVER force the corrected form unless the current pixels support it.'
      ).join('\n') + '\n'
    : '';
  const layoutPreset = ['auto','question-paper','worksheet','form','table','preserve'].includes(layoutOptions?.preset)
    ? layoutOptions.preset
    : 'auto';
  const requestedDensity = ['auto','compact','normal','spacious'].includes(layoutOptions?.density)
    ? layoutOptions.density
    : 'auto';
  const aiLayoutCheck = layoutOptions?.aiLayoutCheck !== false;
  const layoutProfileInstruction = aiLayoutCheck
    ? `
AI LAYOUT PROFILE (internal metadata only):
Before the visible transcription, output exactly ONE line in this format:
[[PAGE_PROFILE: kind=<question-paper|worksheet|form|table|general>; orientation=<portrait|landscape>; density=<compact|normal|spacious>; title_align=<left|center|right>; title_weight=<normal|bold>; columns=<1|2|3>; title_size=<12-20>; heading_size=<10-16>; body_size=<9-14>; english_font=Tahoma; confidence=<high|medium|low>]]
Estimate ONLY relative layout/style that is clearly visible. Do not guess an exact source font name. PaperAI always uses Tahoma for English output. Do not put source text inside PAGE_PROFILE.

For a clearly distinctive standalone title or section heading, you MAY preserve its visible typography with:
[[LINE_STYLE: role=<title|heading|body>; align=<left|center|right>; weight=<normal|bold>; size=<small|body|heading|title> || exact visible text]]
Use LINE_STYLE only when alignment/weight/size difference is visually clear. Do not wrap every ordinary body line. The text after || must be a literal transcription of the pixels. Never change wording to improve formatting.
User layout preset: ${layoutPreset}. Requested density: ${requestedDensity}.
Requested title alignment: ${layoutOptions?.titleAlign || "auto"}.
Requested text scale: ${layoutOptions?.fontScale || "auto"}.
Requested heading weight: ${layoutOptions?.headingWeight || "auto"}.
If preset is not "auto", use it as a reconstruction preference unless it contradicts the source geometry.
If density/title alignment/text scale/heading weight are not "auto", treat them as final reconstruction preferences while keeping the visible text literal.
`
    : '';

  const previousPageTail = String(paperContext?.previous_page_tail || '').slice(-1800);
  const paperContextInstruction = previousPageTail || paperContext?.page_index != null
    ? `
MULTI-PAGE PAPER CONTEXT (structural hint only):
Current uploaded page position: ${Number(paperContext?.page_index || 0) + 1} of ${Number(paperContext?.page_total || 1)}.
Previous page OCR tail, if any:
---BEGIN PREVIOUS PAGE TAIL---
${previousPageTail || '[none]'}
---END PREVIOUS PAGE TAIL---
Use this ONLY to notice likely continuation of section numbering/question patterns. Never copy words from the previous page into the current page. If the current page shows a different class/exam/header, ignore previous-page continuity.
Preserve every visible question number, Roman section label, marks formula, option pair and answer blank on the current page.
If a section heading or numbered question is visible, do not omit it merely because ruled notebook lines or faint show-through are nearby.
`
    : '';

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
    ur: 'Main language: Urdu. Preserve English, numbers and mixed scripts exactly.',
    or: 'Main language: Odia. Preserve English, numbers and mixed scripts exactly.',
    ks: 'Main language: Kashmiri. Preserve English, numbers and mixed scripts exactly.'
  }[language] || 'Auto-detect every visible language and preserve the original scripts exactly.';

  const prompt = `Transcribe the full source page faithfully and completely. ${languageHint}
The other images are overlapping close-ups of the SAME source page. They are detail aids, not extra pages. Output each source line exactly once in full-page reading order.

Check the entire page, including small handwritten words and numbers in the left margin. Check printed school names and header fields letter by letter. Do not summarize, shorten a question, solve it, correct its spelling, or fill any answer blank. Keep Hindi in Devanagari and English in English.

For a question paper, preserve EVERY visible Roman section label, item number, instruction, marks formula, option and word. Use ordinary numbered text lines, such as "1. ...", for questions; preserve the source's actual labels and numbering. A missing or unreadable word must be [unclear] in its exact position, never an omitted question. Do not infer a missing item from a marks formula or sequence. Preserve a continuation that starts at item 2 or later.

Copy intentionally written answer blanks as underscores. Notebook ruling, reverse-side show-through, shadows and erased ghosts are background, not text or answer blanks. Preserve deliberate answer space without turning every notebook rule into a separate answer line.

For matching exercises and columns, keep each left entry and its adjacent right entry on the same row using:
[[COLUMN_START]]
[[COLUMN_ROW: actual left text || actual right text]]
[[COLUMN_END]]
Use one COLUMN_ROW per actual source row, including its visible item number. Never pair or solve the entries. For a bordered table, use TABLE_START/TABLE_ROW/TABLE_END with the same row fields and preserve every visible row and column. For a labelled branch diagram, use BRANCH_ROOT, BRANCH_ITEM (left label || right label), and BRANCH_END. Preserve visible mathematics, arrows and editing marks without inventing shapes or labels.

Before the final answer, check that every visible question/item number has its text and that no header, section, short word or option was dropped. Return only the complete transcription, with no discussion, thinking text, duplicate headings, filenames or invented sections.
${learningSection}
${paperContextInstruction}`;

  const requestBody = {
    messages: [
      {
        role: 'system',
        content: 'You are a literal OCR engine for printed and handwritten documents. Accuracy of characters, numbers, mathematics, and symbols is more important than fluency.'
      },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: prompt }
        ]
      }
    ],
    max_completion_tokens: 8192,
    temperature: 0,
    chat_template_kwargs: {
      enable_thinking: true
    }
  };

  let response;
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await env.AI.run(model, requestBody, { rejectIfBusy: true });
      break;
    } catch (e) {
      lastError = e;
      if (isDailyFreeLimitError(e) || isPaidModelRequiredError(e) || !isTransientAiError(e) || attempt === 1) {
        throw e;
      }
      await sleep(attempt === 0 ? 350 : 800);
    }
  }

  if (!response) throw lastError || new Error('AI OCR unavailable');

  let text = extractAiText(response);
  let usage = mergeAiUsage(response.usage || null, null);
  let rescued = false;

  if (shouldVerifyOcr(text, imageMeta)) {
    const rescuePrompt = hasDegenerateOcr(text)
      ? 'Read the attached page again from the image alone. Return only its visible text, line by line, in reading order. Transcribe printed headers and every handwritten Hindi word independently from the pixels. Preserve visible question numbers, Roman section labels, marks, answer blanks and both columns of matching exercises. Never invent alphabet labels, missing words or repeated empty rows. Keep each source line on a separate output line. Use [unclear] only for the unreadable part. Do not copy or reconstruct another page. Do not explain the result.'
      : prompt + `

LITERAL VERIFICATION PASS:
Below is the first OCR transcription. Re-check it against the image line-by-line and return the best literal transcription.

FIRST OCR:
---BEGIN FIRST OCR---
${text}
---END FIRST OCR---

VERIFICATION RULES:
- Keep text unchanged when the pixels support it.
- Resolve [unclear] only when the image gives enough visual evidence.
- Remove [[INSERT]], [[REPLACE]], [[STRIKE]], [[CIRCLED]], [[UNDERLINE]], or other edit markers if the corresponding visual mark is not clearly present.
- Do not turn faint erased writing, reverse-side show-through, indentation, shadows, or paper texture into readable text.
- Do not fill answer blanks from context or options.
- Correct a character only when the image itself supports that correction.
- Preserve mathematics, marks, punctuation, spacing relationships, and mixed scripts exactly.
- Re-check large printed school/exam/header words letter-by-letter; these should not be rewritten from memory or familiarity.
- Re-check every Devanagari grapheme that changed between the first OCR and your proposed result. Only change it when the visible stroke pattern supports the new grapheme.
- On Hindi-dominant pages, inspect every Latin-letter token again. Keep it Latin only when the source itself is visibly English; never romanize a Devanagari word during verification.
- For branch diagrams, remove fake "| |" connector rows and return the exact [[BRANCH_ROOT]], [[BRANCH_ITEM]], [[BRANCH_END]] structure defined above.
- Re-check each branch label independently. Never merge the root/prefix into a branch label; preserve only the characters visibly written on that branch.
- Re-check every bracketed option pair and every two-column row independently from the image. Do not use story/context knowledge to complete an option.
- On question/answer sheets, count every visible numbered question before accepting the verification result. Do not let long ruled answer lines replace or suppress the shorter question text above them.
- Preserve QUESTION_SECTION, QUESTION_ITEM and ANSWER_RULE metadata when the corresponding structure is visibly present. Never add a missing question from expected marks or sequence.
- Prompt/template descriptions are NEVER document text. Remove or replace with [unclear] any accidental phrases such as "visible Roman/section label", "exact visible instruction", "exact visible marks formula", "exact visible question number", or "exact visible question text".
- For a section heading, re-read the actual Roman label from the pixels (I, II, III, IV, V, VI, VII, VIII, etc.). Do not substitute a generic label description.
- When the first OCR and image disagree, the image wins. When the image is ambiguous, keep [unclear] instead of guessing.
- If genuinely unreadable, keep [unclear] instead of guessing.`;

    try {
      const rescueResponse = await env.AI.run(model, {
        messages: [
          {
            role: 'system',
            content: 'You are a forensic literal OCR verifier. Your job is to compare the first transcription to the image and remove hallucinations while recovering only visually supported characters.'
          },
          {
            role: 'user',
            content: [
              ...imageContent,
              { type: 'text', text: rescuePrompt }
            ]
          }
        ],
        max_completion_tokens: 8192,
        temperature: 0,
        chat_template_kwargs: {
          enable_thinking: true
        }
      }, { rejectIfBusy: true });

      const rescueText = extractAiText(rescueResponse);
      usage = mergeAiUsage(usage, rescueResponse.usage || null);

      if (shouldAcceptVerifiedText(text, rescueText, imageMeta)) {
        text = rescueText;
        rescued = true;
      }
    } catch (e) {
      if (!isDailyFreeLimitError(e) && !isPaidModelRequiredError(e)) {
        console.log('[Literal verification] skipped:', e?.message || e);
      }
    }
  }

  if (hasDegenerateOcr(text)) {
    try { await recordAiUsage(env, usage); } catch (_) {}
    throw new Error('The image read produced repetitive empty rows. Please retry with a clearer page image.');
  }
  text = sanitizePromptTemplateLeakage(text);
  return { text, raw: text, model, usage, scanMode, rescued };
}

    function normalizeQuestionMetadata(value) {
        const label = token => String(token || '').trim().replace(/[.)।:;]+$/u, '');
        let out = String(value || '').replace(/\[\[QUESTION_(SECTION|ITEM):\s*([^\n]*?)\]\]/gi, (raw, kind, body) => {
            let fields;
            if (body.includes('|')) fields = body.split(body.includes('||') ? /\s*\|\|\s*/ : /\s*\|\s*/);
            else {
                const first = body.indexOf(','), last = body.lastIndexOf(',');
                if (first < 0 || (kind.toUpperCase() === 'SECTION' && first === last)) return raw;
                fields = kind.toUpperCase() === 'SECTION'
                    ? [body.slice(0, first), body.slice(first + 1, last), body.slice(last + 1)]
                    : [body.slice(0, first), body.slice(first + 1)];
            }
            fields = fields.map(part => part.trim());
            if (fields.length !== (kind.toUpperCase() === 'SECTION' ? 3 : 2)) return raw;
            fields[0] = label(fields[0]);
            return '[[QUESTION_' + kind.toUpperCase() + ': ' + fields.join(' || ') + ']]';
        });
        out = out.replace(/^[ \t]*\[\[ANSWER_RULE(?::[ \t]*_*)?\]\][ \t]*$/gmi, '[[ANSWER_RULE]]');
        out = out.replace(/\[\[ANSWER_RULE:[ \t]*_*[ \t]*\]\]/gi, '\n[[ANSWER_RULE]]\n');
        // The model sometimes prints a heading and immediately repeats it as metadata.
        let previous = '';
        return out.split('\n').filter(line => {
            if (!line.trim()) return true;
            const section = line.match(/^\[\[QUESTION_SECTION: (.*?) \|\| (.*?) \|\| (.*?)\]\]$/i);
            const visible = section ? [section[1] + '.', section[2], section[3]].filter(Boolean).join(' ') : line;
            const key = visible.trim().replace(/^([IVXivx]+)[.)।:;]+\s*/u, '$1. ').replace(/\s+/g, ' ');
            const duplicate = /^(?:[IVXivx]+\.\s|\[\[QUESTION_SECTION:)/.test(visible) && key === previous;
            previous = key;
            return !duplicate;
        }).join('\n');
    }


const FORBIDDEN_OCR_TEMPLATE_PHRASES = [
  'visible Roman/section label',
  'exact visible instruction',
  'exact visible marks formula',
  'exact visible question number',
  'exact visible question text'
];

function containsPromptTemplateLeakage(text) {
  const source = String(text || '').toLowerCase();
  return FORBIDDEN_OCR_TEMPLATE_PHRASES.some(phrase => source.includes(phrase.toLowerCase()));
}

function sanitizePromptTemplateLeakage(text) {
  let out = String(text || '');
  for (const phrase of FORBIDDEN_OCR_TEMPLATE_PHRASES) {
    out = out.replace(new RegExp(phrase, 'gi'), '[unclear]');
  }
  return normalizeQuestionMetadata(out);
}
function expectedItemsFromMarks(value) {
  const m = String(value || '').match(/(\d+|[०-९]+)\s*[x×X]\s*(\d+|[०-९]+)\s*=\s*(\d+|[०-९]+)/);
  if (!m) return null;
  const map = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  const n = Number(String(m[1]).replace(/[०-९]/g, ch => map[ch] || ch));
  return Number.isFinite(n) ? n : null;
}

function questionStructureNeedsVerification(text) {
  const source = normalizeQuestionMetadata(text);
  const questionLike =
    /\[\[(?:QUESTION_SECTION|QUESTION_ITEM):/i.test(source) ||
    /(?:^|\n)\s*[IVX]{1,6}\s*[.)।:-]?\s+/m.test(source) ||
    /\b(?:\d+|[०-९]+)\s*[x×X]\s*(?:\d+|[०-९]+)\s*=\s*(?:\d+|[०-९]+)/i.test(source);

  if (!questionLike) return false;

  const hasStructuredItems = /\[\[QUESTION_ITEM:/i.test(source);
  if (!hasStructuredItems) return true;

  const lines = source.split('\n');
  let expected = null;
  let found = 0;
  let sawSection = false;

  const flush = () => {
    if (!sawSection) return false;
    if (Number.isFinite(expected) && expected > 0 && found !== expected) return true;
    return false;
  };

  for (const line of lines) {
    const section = line.match(/^\s*\[\[QUESTION_SECTION:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i);
    if (section) {
      if (flush()) return true;
      sawSection = true;
      expected = expectedItemsFromMarks(section[3]);
      found = 0;
      continue;
    }

    if (/^\s*\[\[QUESTION_ITEM:/i.test(line)) {
      // A numbered item with no transcribed wording still needs a pixel check,
      // even when its section's item count matches the marks formula.
      if (/^\s*\[\[QUESTION_ITEM:\s*[^|]*\|\|\s*\]\]\s*$/i.test(line)) return true;
      found++;
    }
  }

  return flush();
}

function structuredPageNeedsVerification(text, imageMeta = {}) {
  const source = String(text || '');
  const hasStructuredMetadata =
    /\[\[(?:TABLE_START|COLUMN_START|WORDSEARCH_START|BRANCH_ROOT|QUESTION_SECTION|QUESTION_ITEM):?/i.test(source);

  if (imageMeta?.branchingLayout) return true;
  if (Number(imageMeta?.denseOptionRows || 0) >= 4) return true;
  if (Number(imageMeta?.multiColumnRows || 0) >= 5) return true;

  // If the model returned explicit structure on a clear page, trust the first
  // pass and reserve the expensive verification pass for evidence of risk.
  return !hasStructuredMetadata;
}

function hasDegenerateOcr(text) {
  const source = String(text || '');
  // A runaway alphabet list is a model failure, not a detected table.
  const emptyLabels = source.match(/\[\[(?:TABLE_ROW|COLUMN_ROW):\s*\([a-z]+\)\s*(?:\|\|\s*)?\]\]/gi) || [];
  const repeatedLabels = emptyLabels.filter(row => /\(([a-z])\1{2,}\)/i.test(row));
  return emptyLabels.length > 24 || repeatedLabels.length >= 8;
}

function shouldVerifyOcr(text, imageMeta = {}) {
  if (hasDegenerateOcr(text)) return true;
  const visible = String(text || '').trim();
  const emptyLike =
    !visible ||
    /^no\s+(?:readable\s+)?text\s+detected[.!]?$/i.test(visible) ||
    /^no\s+text\s+found[.!]?$/i.test(visible);

  const plain = visible
    .replace(/\[\[[\s\S]*?\]\]/g, '')
    .replace(/\[unclear(?::[^\]]*)?\]/gi, '')
    .trim();

  const edgeRatio = Number(imageMeta?.edgeRatio) || 0;
  const score = Number(imageMeta?.score) || 0;
  const contrast = Number(imageMeta?.contrast) || 0;
  const likelyInk = edgeRatio >= 0.018 || score >= 1 || contrast >= 28;

  const expectedLines = Number(imageMeta?.lineCount) || 0;
  const actualLines = visible
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean).length;

  const lineMiss =
    imageMeta?.scanStrategy === 'line-mosaic' &&
    expectedLines >= 4 &&
    actualLines < Math.max(2, Math.floor(expectedLines * 0.50));

  const hasUnclear = /\[unclear(?::[^\]]*)?\]/i.test(visible);
  const hasEditMetadata = /\[\[(?:DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|REPLACE|CIRCLED|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE):/i.test(visible);
  const structuredPage =
    Boolean(imageMeta?.structuredLayout) ||
    Number(imageMeta?.multiColumnRows || 0) >= 2 ||
    Number(imageMeta?.denseOptionRows || 0) >= 2;
  // A merely imperfect photo is not evidence of a bad read. Only a severely
  // degraded page (heavy blur/washout) justifies a second full multimodal pass,
  // which doubles image tokens and generation time.
  const severeImageRisk = Number(imageMeta?.score || 0) >= 3;
  const structuredRisk =
    structuredPage &&
    (
      severeImageRisk ||
      lineMiss ||
      hasUnclear ||
      structuredPageNeedsVerification(visible, imageMeta)
    );
  const questionStructureRisk = questionStructureNeedsVerification(visible);
  const templateLeakage = containsPromptTemplateLeakage(visible);

  return emptyLike ||
    lineMiss ||
    hasUnclear ||
    hasEditMetadata ||
    structuredRisk ||
    severeImageRisk ||
    questionStructureRisk ||
    templateLeakage ||
    (plain.length < 12 && likelyInk);
}

function shouldAcceptVerifiedText(first, second, imageMeta = {}) {
  const a = String(first || '').trim();
  const b = String(second || '').trim();
  if (!b) return false;
  if (/^no\s+(?:readable\s+)?text\s+detected[.!]?$/i.test(b)) return false;
  if (hasDegenerateOcr(b)) return false;
  // A fresh image read can legitimately be far shorter than runaway output.
  if (hasDegenerateOcr(a)) return true;
  if (!a || /^no\s+(?:readable\s+)?text\s+detected[.!]?$/i.test(a)) return true;

  const visible = s => stripQuestionPaperMetadata(s)
    .replace(/\[\[(?:PAGE_PROFILE|LINE_STYLE):[^\n]*?\]\]/gi, '')
    .replace(/\[\[(?:TABLE_ROW|COLUMN_ROW):\s*([^\n]*?)\]\]/gi, '$1')
    .replace(/\[\[[^\n]*?\]\]/g, '')
    .replace(/_{3,}/g, ' ');
  const usefulLength = s => visible(s)
    .replace(/\s+/g, '')
    .length;

  const uncertainCount = s => (s.match(/\[unclear(?::[^\]]*)?\]/gi) || []).length;
  const editCount = s => (s.match(/\[\[(?:DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|REPLACE|CIRCLED|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE):/g) || []).length;
  const lineCount = s => s.split(/\n+/).filter(line => line.trim()).length;

  const tokenAgreement = (x, y) => {
    const tokenize = s => visible(s)
      .replace(/[|()[\]{}.,;:!?/\\]+/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean);

    const left = tokenize(x);
    const right = tokenize(y);
    if (!left.length || !right.length) return 0;

    const counts = new Map();
    for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);

    let shared = 0;
    for (const token of right) {
      const n = counts.get(token) || 0;
      if (n > 0) {
        shared++;
        counts.set(token, n - 1);
      }
    }

    return shared / Math.max(left.length, right.length);
  };

  const aLen = usefulLength(a);
  const bLen = usefulLength(b);
  const expectedLines = Number(imageMeta?.lineCount) || 0;
  const bLines = lineCount(b);
  const agreement = tokenAgreement(a, b);
  const blankQuestions = s => /\[\[QUESTION_ITEM:\s*[^|]*\|\|\s*(?:_{3,}|\[unclear\])?\s*\]\]/i.test(normalizeQuestionMetadata(s));
  const firstWasUncertain = uncertainCount(a) > 0 || editCount(a) > 0 || blankQuestions(a);
  const itemNumbers = s => {
    const counts = new Map();
    for (const line of visible(s).split('\n')) {
      const match = line.match(/^\s*([0-9०-९]+)\s*[.)।:-]?\s+/u);
      if (match) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
    return counts;
  };
  const beforeNumbers = itemNumbers(a), afterNumbers = itemNumbers(b);
  for (const [number, count] of beforeNumbers) {
    if ((afterNumbers.get(number) || 0) < count) return false;
  }

  if (bLen < Math.max(4, aLen * 0.68)) return false;
  if (bLen > aLen * 1.55 && aLen > 20 && !firstWasUncertain) return false;
  if (expectedLines >= 4 && bLines < Math.max(2, Math.floor(expectedLines * 0.40))) return false;

  // Verification may fix several characters, but it should not rewrite the
  // entire document into a different same-length answer.
  if (!firstWasUncertain && aLen > 40 && agreement < 0.50) return false;

  if (uncertainCount(b) < uncertainCount(a)) return true;
  if (editCount(b) < editCount(a) && bLen >= aLen * 0.75) return true;

  return bLen >= aLen * 0.88 && (aLen <= 40 || agreement >= 0.50 || firstWasUncertain);
}

function mergeAiUsage(a, b) {
  const left = a || {};
  const right = b || {};
  const keys = ['prompt_tokens', 'completion_tokens', 'input_tokens', 'output_tokens', 'total_tokens'];
  const merged = {};

  for (const key of keys) {
    const value = (Number(left[key]) || 0) + (Number(right[key]) || 0);
    if (value > 0) merged[key] = value;
  }

  return Object.keys(merged).length ? merged : (a || b || null);
}

function extractAiText(response) {
  if (!response) return '';

  if (typeof response === 'string') return response.trim();
  if (typeof response.response === 'string') return response.response.trim();

  const choiceContent = response?.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string') return choiceContent.trim();

  if (Array.isArray(choiceContent)) {
    return choiceContent
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join('')
      .trim();
  }

  if (typeof response?.result?.response === 'string') {
    return response.result.response.trim();
  }

  return '';
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
    ['or', /[\u0B00-\u0B7F]/g],
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
function stripBranchMetadata(text) {
  const lines = String(text || '').split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const rootMatch = lines[i].match(/^\s*\[\[BRANCH_ROOT:\s*([\s\S]*?)\]\]\s*$/i);
    if (!rootMatch) {
      out.push(lines[i]);
      continue;
    }

    const root = rootMatch[1].trim();
    const items = [];
    let j = i + 1;

    while (j < lines.length) {
      if (/^\s*\[\[BRANCH_END\]\]\s*$/i.test(lines[j])) {
        j++;
        break;
      }

      const item = lines[j].match(/^\s*\[\[BRANCH_ITEM:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i);
      if (item) items.push({ left: item[1].trim(), right: item[2].trim() });
      j++;
    }

    if (!items.length) {
      out.push(root);
      i = j - 1;
      continue;
    }

    const center = Math.floor(items.length / 2);
    for (let r = 0; r < items.length; r++) {
      const item = items[r];
      const relation = r < center ? '↗' : r > center ? '↘' : '→';
      const rootPart = r === center ? '○ ' + root + ' ' : '     ';
      const right = item.right ? ' ───────── ' + item.right : '';
      out.push(rootPart + relation + ' ' + item.left + right);
    }

    i = j - 1;
  }

  return out.join('\n');
}

function stripQuestionPaperMetadata(text) {
  return normalizeQuestionMetadata(text)
    .replace(/^\s*\[\[QUESTION_SECTION:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/gmi,
      (_, label, instruction, marks) => [String(label || '').trim() + '.', String(instruction || '').trim(), String(marks || '').trim()].filter(Boolean).join(' '))
    .replace(/^\s*\[\[QUESTION_ITEM:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/gmi,
      (_, number, question) => String(number || '').trim() + '. ' + String(question || '').trim())
    .replace(/^\s*\[\[ANSWER_RULE\]\]\s*$/gmi,
      '___________________________________________________________________________');
}

function stripLineStyleMetadata(text) {
  return String(text || '')
    .replace(/^\s*\[\[LINE_STYLE:\s*[^\]]*?\s*\|\|\s*([\s\S]*?)\]\]\s*$/gmi, (_, visibleText) =>
      String(visibleText || '').trim()
    );
}

function stripPageProfileMetadata(text) {
  return String(text || '')
    .split('\n')
    .filter(line => !/^\s*\[\[PAGE_PROFILE:\s*[\s\S]*?\]\]\s*$/i.test(line))
    .join('\n');
}

function stripStructuredMetadata(text) {
  const lines = String(text || '').split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[\[WORDSEARCH_START\]\]\s*$/i.test(lines[i])) {
      const rows = [];
      const answers = [];
      let j = i + 1;

      while (j < lines.length && !/^\s*\[\[WORDSEARCH_END\]\]\s*$/i.test(lines[j])) {
        const row = lines[j].match(/^\s*\[\[WORDSEARCH_ROW:\s*([\s\S]*?)\]\]\s*$/i);
        if (row) {
          rows.push(row[1].split(/\s*\|\|\s*/).map(s => s.trim()));
          j++;
          continue;
        }

        const answer = lines[j].match(/^\s*\[\[WORDSEARCH_ANSWER:\s*([^\]]+?)\s*\]\]\s*$/i);
        if (answer) answers.push(answer[1].trim());
        j++;
      }

      const maxRows = Math.max(rows.length, answers.length);
      for (let r = 0; r < maxRows; r++) {
        const gridText = rows[r] ? rows[r].join(' | ') : '';
        const answerText = answers[r] ? answers[r] + '. ____________________' : '';
        out.push([gridText, answerText].filter(Boolean).join('    '));
      }

      i = j < lines.length ? j : lines.length - 1;
      continue;
    }

    if (/^\s*\[\[TABLE_START\]\]\s*$/i.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !/^\s*\[\[TABLE_END\]\]\s*$/i.test(lines[j])) {
        const row = lines[j].match(/^\s*\[\[TABLE_ROW:\s*([\s\S]*?)\]\]\s*$/i);
        if (row) out.push(row[1].split(/\s*\|\|\s*/).map(s => s.trim()).join(' | '));
        j++;
      }
      i = j < lines.length ? j : lines.length - 1;
      continue;
    }

    if (/^\s*\[\[COLUMNS_START\]\]\s*$/i.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !/^\s*\[\[COLUMNS_END\]\]\s*$/i.test(lines[j])) {
        const row = lines[j].match(/^\s*\[\[COLUMN_ROW:\s*([\s\S]*?)\]\]\s*$/i);
        if (row) out.push(row[1].split(/\s*\|\|\s*/).map(s => s.trim()).join('    '));
        j++;
      }
      i = j < lines.length ? j : lines.length - 1;
      continue;
    }

    out.push(lines[i]);
  }

  return out.join('\n');
}

function stripOcrMetadata(text) {
  if (!text) return '';

  return stripBranchMetadata(stripStructuredMetadata(stripPageProfileMetadata(stripLineStyleMetadata(stripQuestionPaperMetadata(String(text))))))
    .replace(/\[\[REPLACE:\s*([\s\S]*?)\s*(?:->|→|=>)\s*([\s\S]*?)\]\]/gi, (_, oldText, newText) => {
      return [oldText.trim(), newText.trim()].filter(Boolean).join(' ');
    })
    .replace(/\[\[(?:DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|CIRCLED|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE):\s*([\s\S]*?)\]\]/gi, (_, content) => content.trim())
    .replace(/\[unclear:\s*([^\]]+)\]/gi, '[unclear]')
    .normalize('NFC')
    .trim();
}

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
