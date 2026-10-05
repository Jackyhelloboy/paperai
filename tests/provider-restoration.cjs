const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'worker/src/index.js'), 'utf8');
const context = vm.createContext({
  DurableObject: class {}, Request, Response, URL, console, setTimeout,
  fetch: () => { throw new Error('Restored OCR must never contact the removed GPU server'); },
});
vm.runInContext(source.replace(/^import .*;\s*$/gm, '')
  .replace(/export default /g, 'const workerDefault = ')
  .replace(/export class /g, 'class '), context);
const worker = vm.runInContext('workerDefault', context);
const text = 'TEST OCR\n1. Preserve the complete source question and answer blank ____.';
const calls = [];
const telemetry = [];
let mode = 'ok';
let verificationCalls = 0;
const uncertainText = text + ' [unclear] [unclear] [unclear]';
const env = {
  // These dashboard variables could survive the experiment's removal.
  OCR_PROVIDER: 'unlimited-ocr',
  UNLIMITED_OCR_BASE_URL: 'https://removed-gpu.example/v1',
  UNLIMITED_OCR_API_KEY: 'test-only-unused-secret',
  USAGE_TRACKER: {
    idFromName: value => value,
    get: () => ({ fetch: async url => { telemetry.push(String(url)); return Response.json({ allowed: false, exhausted: true }); } }),
  },
  AI: { run: async (model, body) => {
    calls.push({ model, body });
    if (mode === 'quota') throw new Error('4006: you have used up your daily free allocation of 10,000 neurons');
    if (mode === 'verification-truncated') {
      const second = ++verificationCalls === 2;
      return { choices: [{ message: { content: second ? uncertainText.replaceAll('[unclear]', 'visible') : uncertainText },
        finish_reason: second ? 'length' : 'stop' }] };
    }
    return { choices: [{ message: { content: text }, finish_reason: mode === 'truncated' ? 'length' : 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 50 } };
  } },
};
function request() {
  return new Request('https://paperai.example/api/ocr', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'OWNED_TEST_IMAGE', filename: 'page.png', mimeType: 'image/png', difficulty: 'easy' }),
  });
}

(async () => {
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  const result = (await response.json()).result;
  assert.equal(result.metadata.model, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(result.metadata.engine, 'cloudflare-ai');
  assert.equal(result.full_text, text);
  assert.equal(calls.length, 1);
  assert(telemetry.every(url => url.endsWith('/add')), 'Local exhaustion cannot block inference');

  mode = 'truncated';
  const before = calls.length;
  const truncated = await worker.fetch(request(), env);
  assert.equal(truncated.status, 422);
  assert.equal((await truncated.json()).code, 'AI_OUTPUT_TRUNCATED');
  assert.equal(calls.length, before + 1, 'Do not repeat an exhausted output budget in a verification pass');
  assert.equal(truncated.headers.get('Cache-Control'), 'no-store, max-age=0');

  mode = 'verification-truncated';
  assert.equal(context.shouldAcceptVerifiedText(uncertainText, uncertainText.replaceAll('[unclear]', 'visible')), true);
  const verified = await worker.fetch(request(), env);
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).result.full_text, uncertainText, 'A token-limited verification must not replace a complete first read');
  assert.equal(verificationCalls, 2);

  mode = 'quota';
  const quota = await worker.fetch(request(), env);
  assert.equal(quota.status, 429);
  const quotaBody = await quota.json();
  assert.equal(quotaBody.provider_error_code, 4006);
  assert.equal(quotaBody.code, 'PROVIDER_AI_QUOTA_REACHED');
  assert.equal(context.isDailyFreeLimitError({ code: 4006, message: 'Unrelated failure' }), false);

  const preflight = await worker.fetch(new Request('https://paperai.example/api/drafts/example', { method: 'OPTIONS' }), env);
  assert(preflight.headers.get('Access-Control-Allow-Methods').split(',').includes('PATCH'));
  assert(calls.every(call => call.model === '@cf/google/gemma-4-26b-a4b-it'));
  console.log('Cloudflare-only restoration ignores old GPU settings, keeps local quotas advisory, reports truncation/4006 and permits draft PATCH.');
})().catch(error => { console.error(error); process.exitCode = 1; });
