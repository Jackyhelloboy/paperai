// Public smoke checks use owned test data, no deployment credentials or AI calls.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base = 'https://paperai-5up.pages.dev';
const worker = 'https://paperai-ocr.mdjawaadkhan57.workers.dev';
const owner = randomBytes(24).toString('base64url');
async function call(path, method='GET', body, customHeaders={}) {
  const response = await fetch(base+path, {method, headers:{'Content-Type':'application/json','X-PaperAI-Owner':owner,...customHeaders},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(30000)});
  const raw = await response.text();
  let data;
  try {data=JSON.parse(raw);} catch {data={};}
  return {status:response.status,data,headers:response.headers};
}
const health = await fetch(worker+'/health',{signal:AbortSignal.timeout(30000)});
assert.equal(health.status,200);
assert.equal((await health.json()).model,'@cf/google/gemma-4-26b-a4b-it');
console.log('Worker health: correct Cloudflare model');
const sample = '1. Preserve the source number.\n2. Keep the blank ______.\n3. हिन्दी पाठ।';
const text = await call('/api/ocr','POST',{filename:'owned-smoke-test.txt',mimeType:'text/plain',image:Buffer.from(sample).toString('base64')});
assert.equal(text.status,200);
assert.equal(text.data.result.full_text,sample);
assert.equal(text.data.result.metadata.engine,'text-reader');
console.log('Text extraction: exact numbers, blank and Hindi preserved');
const cors = await call('/api/drafts','OPTIONS',undefined,{'Origin':base,'Access-Control-Request-Method':'PATCH'});
assert.equal(cors.status,204);
assert(cors.headers.get('Access-Control-Allow-Methods').split(',').includes('PATCH'));
console.log('Draft PATCH preflight: accepted');
let id;
try {
  const created = await call('/api/drafts','POST',{title:'Owned production smoke test'});
  assert.equal(created.status,201);
  id=created.data.draft.id;
  const renamed = await call('/api/drafts/'+id,'PATCH',{title:'Owned test verified'});
  assert.equal(renamed.status,200);
  assert.equal(renamed.data.draft.title,'Owned test verified');
  const isolated = await call('/api/drafts/'+id,'GET',undefined,{'X-PaperAI-Owner':randomBytes(24).toString('base64url')});
  assert.equal(isolated.status,404);
  console.log('Draft storage: create, rename and owner isolation passed');
} finally {
  if(id) {
    const deleted = await call('/api/drafts/'+id,'DELETE');
    assert.equal(deleted.status,200);
    assert.equal(deleted.data.deleted,true);
    console.log('Owned test draft removed');
  }
}
console.log('Production smoke checks passed; image inference availability is checked separately.');
