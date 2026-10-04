const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const requests = [];
let reply = { choices: [{ message: { content: '<|ref|>text<|/ref|><|det|>[[1,2,3,4]]<|/det|>\nI. उत्तर लिखिए।\n<|det|>text [0,0,100,100]<|/det|>1. तीन मित्रों के क्या नाम थे?\n2. बया खेतों से क्या लाती है?<|endoftext|>' }, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 99 } };
let upstreamStatus = 200;
const context = vm.createContext({
  console, URL, Response, Request, Headers, AbortController, setTimeout, clearTimeout,
  DurableObject: class {},
  fetch: async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return Response.json(reply, { status: upstreamStatus });
  },
});
const adapter = fs.readFileSync(path.join(root, 'worker/src/unlimited-ocr.js'), 'utf8');
vm.runInContext(adapter.replace(/export /g, ''), context);
const worker = fs.readFileSync(path.join(root, 'worker/src/index.js'), 'utf8');
vm.runInContext(worker.replace(/^import .*;\s*$/gm, '').replace(/export default /g, 'const workerDefault = ').replace(/export class /g, 'class '), context);
const env = { UNLIMITED_OCR_BASE_URL: 'https://model.example/v1/', UNLIMITED_OCR_API_KEY: 'test-key' };

(async () => {
  assert.equal(context.getOCRProvider({}), 'cloudflare-ai');
  assert.equal(context.getOCRProvider(env), 'unlimited-ocr');
  assert.equal(context.getOCRProvider({ ...env, OCR_PROVIDER: 'cloudflare-ai' }), 'cloudflare-ai');
  const result = await context.runOCR('FULL_FRAME', 'image/jpeg', env, 'hi', 'easy', {}, [], {}, {}, [{ base64: 'DETAIL' }]);
  assert.equal(result.model, 'baidu/Unlimited-OCR');
  assert(result.text.includes('1. तीन मित्रों के क्या नाम थे?\n2. बया'));
  assert(!result.text.includes('<|'));
  const sent = requests.at(-1);
  assert.equal(sent.url, 'https://model.example/v1/chat/completions');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-key');
  assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.body.messages[0].content.length, 2); // Full frame, not repeated crop-pages.
  assert.equal(sent.body.messages[0].content[0].text, '<image>document parsing.');
  assert.equal(sent.body.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,FULL_FRAME');
  assert.equal(sent.body.skip_special_tokens, false);
  assert.equal(sent.body.vllm_xargs.ngram_size, 35);
  assert.equal(sent.body.vllm_xargs.window_size, 128);

  await assert.rejects(context.runOCR('X', 'image/jpeg', { OCR_PROVIDER: 'unlimited-ocr' }), error => error.code === 'UNLIMITED_OCR_CONFIGURATION');
  await assert.rejects(context.runOCR('X', 'image/jpeg', { ...env, UNLIMITED_OCR_BASE_URL: 'http://model.example/v1' }), error => error.code === 'UNLIMITED_OCR_CONFIGURATION');
  await assert.rejects(context.runOCR('X', 'application/pdf', env), error => error.code === 'UNLIMITED_OCR_IMAGE_REQUIRED');
  await assert.rejects(context.runOCR('X', 'image/jpeg', { OCR_PROVIDER: 'typo' }), error => error.code === 'OCR_PROVIDER_CONFIGURATION');
  upstreamStatus = 401;
  env.AI = { run: () => { throw new Error('Must never fall back to Gemma'); } };
  await assert.rejects(context.runOCR('X', 'image/jpeg', env), error => error.code === 'UNLIMITED_OCR_UPSTREAM' && !error.message.includes('test-key'));
  upstreamStatus = 200;
  reply = { choices: [{ message: { content: '' }, finish_reason: 'stop' }] };
  await assert.rejects(context.runOCR('X', 'image/jpeg', env), error => error.code === 'UNLIMITED_OCR_EMPTY');
  reply = { choices: [{ message: { content: '1. partial' }, finish_reason: 'length' }] };
  await assert.rejects(context.runOCR('X', 'image/jpeg', env), error => error.code === 'UNLIMITED_OCR_TRUNCATED');
  reply = { choices: [{ message: { content: 'I. उत्तर लिखिए।\n1. तीन मित्रों के क्या नाम थे?\n2. बया खेतों से क्या लाती है?' }, finish_reason: 'stop' }], usage: { prompt_tokens: 42, completion_tokens: 99 } };

  // Exercise the actual public Worker route, including quota and result metadata.
  let cloudflareUsageCalls = 0;
  context.recordAiUsage = async () => { cloudflareUsageCalls++; };
  const response = await context.handleOCR(new Request('https://paperai.example/api/ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'FULL_FRAME', filename: 'paper.jpg', language: 'hi' }),
  }), env, {});
  assert.equal(response.status, 200);
  const output = await response.json();
  assert.equal(output.result.metadata.engine, 'unlimited-ocr');
  assert.equal(output.result.metadata.model, 'baidu/Unlimited-OCR');
  assert.equal(output.result.metadata.billing_safety, 'external_gpu_host_billing');
  assert.equal(cloudflareUsageCalls, 0);
  assert(output.result.full_text.includes('1. तीन मित्रों'));
  assert(!output.result.full_text.includes('<|det|>'));

  upstreamStatus = 503;
  const failure = await context.handleOCR(new Request('https://paperai.example/api/ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'X', filename: 'paper.jpg' }),
  }), env, {});
  assert.equal(failure.status, 502);
  assert.equal((await failure.json()).code, 'UNLIMITED_OCR_UPSTREAM');
  console.log('Unlimited-OCR request recipe, source numbering, routing, errors and quota separation passed. Real GPU inference is not covered.');
})().catch(error => { console.error(error); process.exitCode = 1; });
