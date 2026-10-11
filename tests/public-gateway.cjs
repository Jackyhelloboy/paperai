const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('functions/api/[[path]].js','utf8');
const context=vm.createContext({URL,Request,Response,Headers,fetch});
vm.runInContext(source.replace('export async function','async function'),context);
const request=(path,options={})=>new Request('https://paperai.test'+path,options);
let calls=0,upstreamRequest;
async function gateway(path,upstream,options={}){
  return context.onRequest({request:request(path,options),fetcher:async req=>{calls++;upstreamRequest=req;return upstream;}});
}
(async()=>{
  const paper='1. Explain Cloudflare and the Gemma model. (5)';
  let res=await gateway('/api/ocr',Response.json({status:'completed',result:{full_text:paper,annotated_text:paper,
    metadata:{language:'en',model:'private-model',engine:'private-engine',image_profile:{secret:1}},model:'private-model'}}),
    {method:'POST',headers:{Authorization:'do-not-forward', 'Content-Type':'application/json'},body:'{"image":"AA=="}'});
  let body=await res.json();assert.equal(body.result.full_text,paper);assert.equal(body.result.annotated_text,paper);
  assert.deepEqual(body.result.metadata,{language:'en'});assert(!body.result.model);assert.equal(upstreamRequest.headers.get('Authorization'),null);
  assert.equal(await upstreamRequest.text(),'{"image":"AA=="}');
  assert.equal(new URL(upstreamRequest.url).pathname,'/api/ocr');
  for(const code of ['AI_BUSY','AI_TIMEOUT','FREE_AI_LIMIT_REACHED','AI_OCR_FAILED','UNKNOWN_INTERNAL_ERROR']){
    res=await gateway('/api/ocr',Response.json({code,error:'Cloudflare Gemma stack trace private-backend.workers.dev',
      detail:'private-model',reset_at:'2026-10-12T00:00:00Z'},{status:code==='FREE_AI_LIMIT_REACHED'?429:503,
      headers:{'Retry-After':'5','X-Model':'secret','Server':'private-host'}}),{method:'POST',body:'test'});
    body=await res.json();assert(!/Cloudflare|Gemma|workers\.dev|stack|private/i.test(JSON.stringify(body)));
    assert.equal(res.headers.get('X-Model'),null);assert.equal(res.headers.get('Server'),null);assert.equal(res.headers.get('Retry-After'),'5');
    if(code==='FREE_AI_LIMIT_REACHED')assert.equal(body.reset_at,'2026-10-12T00:00:00Z');
  }
  res=await gateway('/api/usage',Response.json({date_utc:'2026-10-11',provider_limit_reached:true,
    reset_at:'2026-10-12T00:00:00Z',free_limit:10000,estimated_used:5000,platform:'private'}));
  assert.deepEqual(await res.json(),{date_utc:'2026-10-11',provider_limit_reached:true,reset_at:'2026-10-12T00:00:00Z'});
  res=await gateway('/api/health',Response.json({status:'healthy',model:'private-model'}));assert.deepEqual(await res.json(),{status:'healthy'});
  assert.equal(new URL(upstreamRequest.url).pathname,'/health');
  const before=calls;
  assert.equal((await gateway('/api/debug',null)).status,404);
  assert.equal((await gateway('/api/train/export',null)).status,404);
  assert.equal((await gateway('/api/ocr',null)).status,405);
  assert.equal((await gateway('/api/ocr',null,{method:'POST',headers:{'Content-Length':String(52*1024*1024)}})).status,413);
  assert.equal(calls,before,'Unknown, invalid and oversized requests never reach the backend');
  res=await gateway('/api/ocr',new Response('<h1>Private provider error</h1>',{status:502}),{method:'POST'});
  assert.equal((await res.json()).code,'OCR_PROXY_UNREACHABLE');
  const upgrade={status:101,webSocket:{connected:true}};
  assert.equal(await gateway('/api/live',upgrade,{headers:{Upgrade:'websocket'}}),upgrade,'Preserve upgrade response and socket');
  res=await context.onRequest({request:request('/api/usage'),fetcher:async()=>{throw new Error('secret provider failure');}});
  assert.equal(res.status,502);assert(!JSON.stringify(await res.json()).includes('secret'));
  const html=fs.readFileSync('frontend/index.html','utf8');
  assert(!/Cloudflare|Neurons|workers\.dev|Gemma|Gemini|Tesseract|Florence|API_DIRECT/i.test(html));
  assert(!/Cloudflare|Gemma|Gemini|Tesseract|Florence/i.test(fs.readFileSync('frontend/vendor/ai-quota.js','utf8')));
  const snapshot=JSON.parse(fs.readFileSync('frontend/usage.json','utf8'));
  assert.equal(snapshot.source,'paperai-usage');assert(!snapshot.scope);assert(!snapshot.reported_used);
  const build=fs.readFileSync('.github/scripts/build-pages.cjs','utf8');
  assert(build.includes("'local-ocr-check.html'"));assert(build.includes("'_worker.js'"));assert(build.includes("include:['/api/*'"));
  console.log('Public gateway: same-origin uploads, literal content preserved, private metadata/errors removed, socket upgrade retained, unknown routes blocked, diagnostic excluded.');
})().catch(error=>{console.error(error);process.exitCode=1;});

assert(fs.readFileSync('.github/scripts/build-pages.cjs','utf8').includes('/vendor/local-ocr-worker.mjs'), 'Retired reader route must return 404 rather than the default dashboard fallback');

// A competing raw frontend deployment must not override the tested production build.
(async()=>{
 const {ensureConfig}=require('../.github/scripts/ensure-pages-config.cjs');
 let config={source:{type:'github',config:{owner:'Jackyhelloboy',repo_name:'paperai',production_deployments_enabled:true,preview_deployment_setting:'all'}},build_config:{build_command:'',destination_dir:'frontend',root_dir:'',build_caching:true}};
 const methods=[];
 const fetcher=async(url,options)=>{methods.push(options.method);if(options.method==='PATCH')config={...config,...JSON.parse(options.body)};return Response.json({success:true,result:config});};
 await ensureConfig({fetcher,token:'test-only',account:'test-only',repository:'Jackyhelloboy/paperai',log(){}});
 assert.deepEqual(methods,['GET','PATCH','GET']);assert.equal(config.source.config.production_deployments_enabled,false);
 assert.equal(config.source.config.preview_deployment_setting,'all');assert.equal(config.build_config.build_caching,true);
 assert.equal(config.build_config.destination_dir,'build/cloudflare-pages');
 methods.length=0;await ensureConfig({fetcher,repository:'Jackyhelloboy/paperai',log(){}});assert.deepEqual(methods,['GET'],'Configured builds must be idempotent');
 await assert.rejects(()=>ensureConfig({fetcher,repository:'another/repository',log(){}}),/does not match/);
 console.log('Production configuration: repository verified, competing trigger disabled, preview recipe aligned, unrelated settings preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
