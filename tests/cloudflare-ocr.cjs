const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'worker/src/index.js'), 'utf8');
const context = vm.createContext({
  DurableObject: class {}, Request, Response, URL, console, setTimeout, atob, TextDecoder,
  fetch: () => { throw new Error('OCR must use the Cloudflare AI binding'); },
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
let truncationCalls = 0;
const uncertainText = text + ' [unclear] [unclear] [unclear]';
const env = {
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
    if (mode === 'truncated') {
      truncationCalls++;
      const cut = Math.floor(text.length * 0.55);
      return truncationCalls === 1
        ? { choices: [{ message: { content: text.slice(0, cut) }, finish_reason: 'length' }], usage: { prompt_tokens: 100, completion_tokens: 50 } }
        : { choices: [{ message: { content: text.slice(cut) }, finish_reason: 'stop' }], usage: { prompt_tokens: 80, completion_tokens: 40 } };
    }
    if (mode === 'always-truncated') {
      return { choices: [{ message: { content: text.slice(0, Math.floor(text.length * 0.5)) }, finish_reason: 'length' }],
        usage: { prompt_tokens: 100, completion_tokens: 50 } };
    }
    return { choices: [{ message: { content: text }, finish_reason: 'stop' }],
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
  const documentText = '1. हिन्दी पाठ।\n2. Preserve this blank: ______';
  for (const image of [Buffer.from(documentText).toString('base64'), 'data:text/plain;base64,' + Buffer.from(documentText).toString('base64')]) {
    const doc = await worker.fetch(new Request('https://paperai.example/api/ocr', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image,filename:'sample.txt',mimeType:'text/plain'})}), env);
    assert.equal(doc.status,200);
    assert.equal((await doc.json()).result.full_text,documentText);
  }
  const invalid = await worker.fetch(new Request('https://paperai.example/api/ocr', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({image:'***invalid***',filename:'sample.txt',mimeType:'text/plain'})}), env);
  assert.equal(invalid.status,400);
  assert.equal(calls.length,0,'Text documents must not call AI');
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  const result = (await response.json()).result;
  assert.equal(result.metadata.model, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(result.metadata.engine, 'cloudflare-ai');
  assert.equal(result.full_text, text);
  assert.equal(calls.length, 1);
  assert(telemetry.every(url => url.endsWith('/provider-status')), 'Provider observation must never consult a local allowance');

  mode = 'truncated';
  truncationCalls = 0;
  const before = calls.length;
  const rescuedResponse = await worker.fetch(request(), env);
  assert.equal(rescuedResponse.status, 200);
  const rescuedBody = await rescuedResponse.json();
  assert.equal(rescuedBody.result.full_text, text, 'A token-limited OCR read should continue automatically');
  assert.equal(rescuedBody.result.metadata.rescued, true);
  assert.equal(calls.length, before + 2, 'Truncated OCR should use one continuation read when it completes the page');

  mode = 'always-truncated';
  const persistentBefore = calls.length;
  const truncated = await worker.fetch(request(), env);
  assert.equal(truncated.status, 422);
  assert.equal((await truncated.json()).code, 'AI_OUTPUT_TRUNCATED');
  assert.equal(calls.length, persistentBefore + 3, 'Persistent truncation should stop after two continuation attempts');
  assert.equal(truncated.headers.get('Cache-Control'), 'no-store, max-age=0');

  mode = 'verification-truncated';
  assert.equal(context.shouldAcceptVerifiedText(uncertainText, uncertainText.replaceAll('[unclear]', 'visible')), true);
  const verified = await worker.fetch(request(), env);
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).result.full_text, uncertainText, 'A token-limited verification must not replace a complete first read');
  assert.equal(verificationCalls, 1, 'Unclear words never trigger another inference');

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
  console.log('Cloudflare OCR automatically continues token-limited reads, caps persistent truncation retries, records provider observations and permits draft PATCH.');
})().catch(error => { console.error(error); process.exitCode = 1; });
