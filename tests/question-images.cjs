const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('frontend/index.html','utf8');
const worker=fs.readFileSync('worker/src/index.js','utf8');
const gateway=fs.readFileSync('functions/api/[[path]].js','utf8');
assert.match(html,/class="teach-panel" id="picturePanel"/);
assert.match(html,/onclick="addUploadedQuestionPicture\(\)"/);
assert.match(html,/onclick="generateQuestionPicture\(\)"/);
assert(html.includes("lastResult.text=lines.join('\\n')"));
assert.match(html,/\[\[SOURCE_FIGURE: '\+id/);
assert.match(html,/textOut\.innerHTML=formatOutput\(lastResult\.text\)/);
assert.match(html,/docxSourceRun\(item\.id,available,sourceMode\?4400:maxHeight/);
assert.match(gateway,/'\/api\/generate-picture': 'POST'/);
assert.match(gateway,/image:body\.image \|\| null/);

const source=worker.slice(worker.indexOf('async function generateQuestionPicture('),worker.indexOf('\nexport default {'));
assert(source.startsWith('async function generateQuestionPicture('));
let calls=0;const keys=new Map();
const context=vm.createContext({Response,Date,Number,String,JSON,AbortSignal,fetch:async()=>{
  calls++;
  return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'YWJj'}}]}}]});
}});
vm.runInContext(source,context);
const run=(env,prompt='clear textbook diagram of a mango tree')=>context.generateQuestionPicture(new Request('https://example.com/api/generate-picture',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt}),
}),env,{});
const KV={get:async key=>keys.get(key),put:async(key,value)=>keys.set(key,value)};
(async()=>{
  let response=await run({KV,GEMINI_API_KEY:'test'});
  assert.equal(response.status,503,'AI image generation is off by default');
  assert.equal(calls,0,'Disabled feature must not call image provider');
  const env={KV,GEMINI_API_KEY:'test',ENABLE_IMAGE_GENERATION:'true',IMAGE_GENERATION_DAILY_LIMIT:'1'};
  response=await run(env,'short');assert.equal(response.status,400);
  assert.equal(calls,0,'Invalid prompts do not consume budget');
  response=await run(env);assert.equal(response.status,200);
  assert.equal((await response.json()).image,'data:image/png;base64,YWJj');
  assert.equal(calls,1);
  response=await run(env);assert.equal(response.status,429,'Daily quota blocks further provider calls');
  assert.equal(calls,1);
  console.log('Question pictures: source image preview/Word marker, teacher placement, protected generation endpoint and daily budget pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
