// Exercise provider routing, REST serialization and public error boundaries.
// Fixture credentials only; live secrets must never be stored in this file.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let clock=Date.parse('2026-10-11T22:00:00Z'),primaryCalls=0;
class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const requests=[],queue=[],endpoints=[];
// Model a runtime without AbortSignal.any/timeout; standard AbortController is sufficient.
const ctx=vm.createContext({Date:Clock,URL,Request,Response,Headers,TextDecoder,Uint8Array,btoa,AbortSignal:{},AbortController,setTimeout,clearTimeout,
  console:{log(){}},DurableObject:class{constructor(c,e){this.ctx=c;this.env=e;}},
  PAPER_LAYOUT_RULES:fs.readFileSync('worker/src/paper-layout-rules.js','utf8'),normaliseMarkerRows:s=>s,
  DICTIONARY:{},getDictionaryWords:()=>[],isInDictionary:()=>false,autoCorrect:s=>s,
  verifyWord:()=>({}),getSuggestions:()=>[],CONFUSION_PAIRS:{},
  fetch:async(url,options)=>{
    assert(['gemini-flash-latest','gemini-3.5-flash-lite'].some(model=>url==='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent'));
    endpoints.push(url);
    assert.equal(options.redirect,'manual');assert.equal(options.headers['X-goog-api-key'],'fixture-credential');
    assert(options.signal instanceof AbortSignal);requests.push(JSON.parse(options.body));
    const next=queue.shift();assert(next,'Unexpected upstream submission');return next;
  }});
vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),ctx);
vm.runInContext(fs.readFileSync('worker/src/index.js','utf8').replace(/^import .*;\n/gm,'')
  .replace('export default {','const workerHandler = {').replace('export class UsageTracker','class UsageTracker')+
  '\nthis.handler=workerHandler;this.Tracker=UsageTracker;sleep=async()=>{};',ctx);
function environment(run){
  const memory=new Map(),tracker=new ctx.Tracker({storage:{get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>memory.set(k,structuredClone(v))}},{});
  return {memory,env:{GEMINI_API_KEY:'fixture-credential',AI:{run:async(...args)=>{primaryCalls++;return run(...args);}},
    USAGE_TRACKER:{idFromName:s=>s,get:()=>({fetch:(url,options)=>tracker.fetch(new Request(url,options))})}}};
}
const image=(meta={})=>new Request('https://paperai.test/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({image:'AA==',mimeType:'image/png',filename:'page.png',language:'hi',image_meta:meta})});
const output=text=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Do not expose reasoning.'},{text}]}}],
  usageMetadata:{promptTokenCount:1000,candidatesTokenCount:500}});
const good={response:'1. Write your name. ______',usage:{prompt_tokens:100,completion_tokens:20}};
const limit=()=>{throw new Error('3036: daily free allocation reached');};
(async()=>{
  const test=environment(limit);queue.push(output('१. अपना नाम लिखिए। ______'));
  let response=await ctx.handler.fetch(image(),test.env),body=await response.json();
  assert.equal(response.status,200);assert(body.result.full_text.includes('अपना नाम'));assert(!body.result.full_text.includes('reasoning'));
  assert.equal(primaryCalls,1);assert.equal(requests.length,1);
  const request=requests[0];assert.deepEqual(request.contents[0].parts[0],{inline_data:{mime_type:'image/png',data:'AA=='}});
  assert(request.contents[0].parts[1].text.includes('Never solve'));assert(request.contents[0].parts[1].text.includes('FIGURE'));
  assert(request.contents[0].parts[1].text.includes('TABLE_ROW'));assert(request.contents[0].parts[1].text.includes('marks'));
  assert(request.systemInstruction.parts[0].text.includes('literal OCR'));assert.equal(request.generationConfig.temperature,0);
  assert(!(JSON.stringify(request).includes('fixture-credential')),'Credential belongs only in the request header');
  let status=await ctx.getUsageStatus(test.env);assert(status.provider_limit_reached);assert.equal(status.estimated_used,0);
  queue.push(output('१. अपना नाम लिखिए। ______'));
  assert.equal((await ctx.handler.fetch(image(),test.env)).status,200);assert.equal(primaryCalls,1,'Known daily block skips primary');
  clock=Date.parse('2026-10-12T00:00:00Z');test.env.AI.run=async()=>{primaryCalls++;return good;};
  assert.equal((await ctx.handler.fetch(image(),test.env)).status,200);assert.equal(primaryCalls,2,'Primary is restored automatically at reset');
  assert.equal(requests.length,2);assert(!(await ctx.getUsageStatus(test.env)).provider_limit_reached);
  clock=Date.parse('2026-10-11T22:00:00Z');
  const structured=environment(limit);const table='I. Fill in the blanks. (5)\n[[TABLE_ROW: a || b]]\n[[TABLE_ROW: c || d]]';
  queue.push(output(table),output(table));let before=primaryCalls;
  response=await ctx.handler.fetch(image({structuredLayout:true}),structured.env);body=await response.json();
  assert.equal(response.status,200);assert(body.result.annotated_text.includes('TABLE_ROW'));assert.equal(primaryCalls,before+1);
  assert(requests.at(-1).contents[0].parts[1].text.includes('LITERAL VERIFICATION PASS'));
  assert.equal((await ctx.getUsageStatus(structured.env)).estimated_used,0,'Backup verification does not add primary neurons');
  let verifierCalls=0;const verification=environment(()=>++verifierCalls===1?{...good,response:'1. Name the [unclear] object. ______'}:limit());
  queue.push(output('1. Name the [unclear] object. ______'));
  response=await ctx.handler.fetch(image(),verification.env);assert.equal(response.status,200);assert.equal(verifierCalls,2);
  status=await ctx.getUsageStatus(verification.env);assert(status.provider_limit_reached);assert(status.estimated_used>0 && status.estimated_used<2);
  const busy=environment(()=>{throw new Error('3040: Capacity temporarily exceeded');});queue.push(output(good.response));
  assert.equal((await ctx.handler.fetch(image(),busy.env)).status,200);assert(!(await ctx.getUsageStatus(busy.env)).provider_limit_reached);
  queue.push(new Response('PRIVATE PROVIDER MESSAGE fixture-credential',{status:403}));
  response=await ctx.handler.fetch(image(),structured.env);body=await response.json();assert.equal(response.status,503);
  assert.equal(body.code,'SCAN_SERVICE_UNAVAILABLE');assert(!/PRIVATE|credential|Gemini|Google/i.test(JSON.stringify(body)));
  const beforeRedirect=endpoints.length;queue.push(new Response('PRIVATE REDIRECT',{status:302,headers:{Location:'https://untrusted.test/'}}));
  response=await ctx.handler.fetch(image(),structured.env);assert.equal((await response.json()).code,'SCAN_SERVICE_UNAVAILABLE');
  assert.equal(endpoints.length,beforeRedirect+1,'Redirects never forward credentials or start another submission');
  queue.push(new Response('PRIVATE QUOTA MESSAGE',{status:429}),new Response('PRIVATE BUSY MESSAGE',{status:503}));response=await ctx.handler.fetch(image(),structured.env);
  assert.equal(response.status,503);assert.equal((await response.json()).code,'AI_BUSY');
  const capacity=environment(limit);
  queue.push(new Response('PRIVATE BUSY MESSAGE',{status:503}),output(table),output(table));
  response=await ctx.handler.fetch(image({structuredLayout:true}),capacity.env);body=await response.json();
  assert.equal(response.status,200);assert(body.result.annotated_text.includes('TABLE_ROW'));
  assert(endpoints.at(-3).includes('gemini-flash-latest'));assert(endpoints.at(-2).includes('gemini-3.5-flash-lite'));
  assert(endpoints.at(-1).includes('gemini-3.5-flash-lite'),'Verification stays on the successful capacity endpoint');
  assert.equal((await ctx.getUsageStatus(capacity.env)).estimated_used,0);
  queue.push(output(good.response));assert.equal((await ctx.handler.fetch(image(),capacity.env)).status,200);
  assert(endpoints.at(-1).includes('gemini-flash-latest'),'New requests restore the preferred Gemini endpoint');
  queue.push(Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'Partial question'}]}}]}));
  response=await ctx.handler.fetch(image(),structured.env);assert.equal((await response.json()).code,'OCR_OUTPUT_INVALID');
  const noKey=environment(limit);delete noKey.env.GEMINI_API_KEY;
  response=await ctx.handler.fetch(image(),noKey.env);assert.equal(response.status,429,'Missing backup credentials fail without exposing configuration');
  assert.equal((await response.json()).code,'FREE_AI_LIMIT_REACHED');
  const suggestion=environment(limit);queue.push(output('{"suggestions":["uncommonphrase"]}'));
  response=await ctx.handler.fetch(new Request('https://paperai.test/api/suggest-word',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:'uncommonphrase',language:'en'})}),suggestion.env);
  assert.equal(response.status,200);assert((await response.json()).suggestions.includes('uncommonphrase'));
  assert.equal(queue.length,0);assert.equal((await ctx.getUsageStatus(suggestion.env)).estimated_used,0);
  const html=fs.readFileSync('frontend/index.html','utf8'),packages=fs.readFileSync('frontend/package-lock.json','utf8');
  assert(!/PaperAILocalOCR|scanOnDevice|local-ocr|tesseract|gemini|generativelanguage/i.test(html));assert(!/tesseract|transformers/i.test(packages));
  for(const path of ['frontend/vendor/local-ocr.js','frontend/vendor/local-reader-worker.js','.github/scripts/stage-reader.cjs'])assert(!fs.existsSync(path));
  console.log('Gemini fallback: image payload and literal layout rules, sticky verification, primary recovery, isolated accounting, suggestions, sanitized errors and complete browser-reader removal verified. Live credential validation is separate.');
})().catch(error=>{console.error(error);process.exitCode=1;});
