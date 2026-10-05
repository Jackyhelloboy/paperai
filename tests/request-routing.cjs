const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const requests = [];
let reply;
const context = vm.createContext({
  Response, Request, Headers,
  API_DIRECT: 'https://worker.example', API_LOCAL: 'https://pages.example',
  draftOwnerKey: () => 'owner-test-key',
  fetch: async url => { requests.push(url); return reply(url); },
});
vm.runInContext(html.slice(html.indexOf('async function fetchOcrEndpoint('), html.indexOf('const LEARNING_KEY')), context);

(async () => {
  for (const [status, code] of [[502, 'AI_OCR_FAILED'], [503, 'FREE_MODEL_UNAVAILABLE'], [429, 'PROVIDER_AI_QUOTA_REACHED']]) {
    requests.length = 0;
    reply = () => Response.json({ code, error: 'Provider rejected request' }, { status });
    const response = await context.fetchOcrEndpoint('/api/ocr', { method: 'POST' });
    assert.equal(requests.length, 1, code + ' must not start duplicate inference through the proxy');
    assert.equal((await response.json()).code, code, 'Inspection must not consume the response body');
  }
  requests.length = 0;
  reply = url => url.startsWith('https://worker.example')
    ? new Response('<html>Gateway error</html>', { status: 502 }) : Response.json({ status: 'completed' });
  assert.equal((await context.fetchOcrEndpoint('/api/ocr', { method: 'POST' })).status, 502);
  assert.equal(requests.length, 1, 'An uncertain transport failure must not start duplicate inference');

  requests.length = 0;
  reply = url => Response.json({ suggestions: ['सुझाव'], route: url });
  const suggestionOk = await context.fetchOcrEndpoint('/api/suggest-word', { method: 'POST' });
  assert.equal(requests.length, 1, 'Suggestions use one request when the Pages proxy is healthy');
  assert(requests[0].startsWith('https://pages.example/api/suggest-word'), 'Suggestions prefer the same-origin Pages proxy');

  requests.length = 0;
  reply = url => url.startsWith('https://pages.example')
    ? Response.json({ error: 'proxy unreachable' }, { status: 502, headers: { 'X-PaperAI-Proxy-Error': '1' } })
    : Response.json({ suggestions: ['सुझाव'] });
  const suggestionFallback = await context.fetchOcrEndpoint('/api/suggest-word', { method: 'POST' });
  assert.equal(suggestionFallback.status, 200);
  assert.equal(requests.length, 2, 'Suggestions fall back to the direct Worker only when the Pages proxy itself fails');

  requests.length = 0;
  reply = () => Response.json({ code: 'FREE_MODEL_UNAVAILABLE', suggestions: [] }, { status: 503 });
  const suggestionProviderError = await context.fetchOcrEndpoint('/api/suggest-word', { method: 'POST' });
  assert.equal(suggestionProviderError.status, 503);
  assert.equal(requests.length, 1, 'A provider AI rejection must not duplicate the suggestion inference through the direct route');

  requests.length = 0;
  reply = () => { throw new Error('aborted'); };
  await assert.rejects(context.fetchOcrEndpoint('/api/ocr', { signal: { aborted: true } }), /aborted/);
  assert.equal(requests.length, 1, 'Cancellation must not restart work');

  let networkCalls = 0;
  const proxy = vm.createContext({ Request, Response, Headers, URL,
    fetch: () => { networkCalls++; throw new Error('Preflight must not reach the upstream'); } });
  vm.runInContext(fs.readFileSync(path.join(root, 'functions/api/[[path]].js'), 'utf8').replace(/export /g, ''), proxy);
  const preflight = await proxy.onRequest({ request: new Request('https://pages.example/api/drafts/id', { method: 'OPTIONS' }) });
  assert.equal(preflight.status, 204);
  assert(preflight.headers.get('Access-Control-Allow-Methods').split(',').includes('PATCH'));
  assert.equal(networkCalls, 0);

  const preparations = [];
  let attempts = 0;
  const retry = vm.createContext({
    FormData: class { append() {} },
    languageSelect: { value: 'en' }, getLayoutOptions: () => ({}), appendLearningHints: () => {},
    takePreparedImage: async () => ({ blob: {}, meta: {}, difficulty: 'hard' }),
    prepareImageForOCR: async (_, safe) => { preparations.push(safe); return { blob: {}, meta: { safeRetry: safe }, difficulty: 'hard' }; },
    linkedAttemptSignal: () => ({ signal: undefined, cleanup() {}, timedOut: () => false }),
    wait: async () => {},
    fetchOcrEndpoint: async () => ++attempts === 1
      ? Response.json({ code: 'AI_OUTPUT_TRUNCATED' }, { status: 422 })
      : Response.json({ status: 'completed', result: { full_text: 'Complete page' } }),
  });
  vm.runInContext(html.slice(html.indexOf('async function sendToOCR('), html.indexOf('function publicPlainTextFromStructured(')), retry);
  await assert.rejects(retry.sendToOCR({}), /Press Retry/);
  assert.equal(attempts,1);assert.deepEqual(preparations,[], 'Truncation does not rescan automatically');

  attempts = 0;
  retry.fetchOcrEndpoint = async () => { attempts++; return Response.json({ code: 'FREE_MODEL_UNAVAILABLE', error: 'Free model unavailable' }, { status: 503 }); };
  await assert.rejects(retry.sendToOCR({}), /Free model unavailable/);
  assert.equal(attempts, 1, 'Paid-plan errors must not be retried');
  console.log('AI and transport failures never repeat inference automatically; cancellation and draft preflight passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
