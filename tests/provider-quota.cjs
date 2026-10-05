const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ DurableObject: class {}, Request, Response, URL, console });
const source = fs.readFileSync(path.join(__dirname, '../worker/src/index.js'), 'utf8');
vm.runInContext(source.replace(/^import .*;\s*$/gm, '')
  .replace(/export default /g, 'const workerDefault = ')
  .replace(/export class /g, 'class '), context);
assert.equal(context.isDailyFreeLimitError({ code: 3036 }), true);
assert.equal(context.isDailyFreeLimitError(new Error('AiError: 3036: daily free allocation exhausted')), true);
assert.equal(context.isDailyFreeLimitError({ cause: { code: 3036 } }), true);
assert.equal(context.isDailyFreeLimitError({ code: 3040, message: '429: neuron capacity unavailable' }), false);
assert.equal(context.isDailyFreeLimitError(new Error('Image size 30360 bytes failed')), false);
assert.equal(context.isDailyFreeLimitError({ code: 5035 }), false);
assert.equal(context.getAiProviderErrorCode(new Error('AiError: 3036: account limited')), 3036);

(async () => {
  vm.runInContext('runAI = async () => { throw new Error("AiError: 3036: daily free allocation exhausted"); }', context);
  const worker = vm.runInContext('workerDefault', context);
  const response = await worker.fetch(new Request('https://paperai.example/api/ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'TEST', filename: 'test.png', mimeType: 'image/png' }),
  }), {});
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.code, 'PROVIDER_AI_QUOTA_REACHED');
  assert.equal(body.provider_error_code, 3036);
  assert(Number.isFinite(Date.parse(body.observed_at)));
  assert.equal(body.provider, 'cloudflare-workers-ai');
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  console.log('Provider quota errors report the original code and cannot confuse capacity or unrelated numbers with daily exhaustion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
