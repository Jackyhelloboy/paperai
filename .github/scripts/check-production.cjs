// A bounded deployment check, not a maximum-capacity or AI inference benchmark.
// Synthetic text uses the literal reader and consumes no inference allocation.
const fs=require('node:fs'),assert=require('node:assert/strict');
const BASE='https://paperai-5up.pages.dev';
const groups=[],checks=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={started_at:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,
  scope:'Public pages and API; synthetic text only. Maximum 20 concurrent requests. No image-model capacity claim.',groups,checks};
const status=async(state,description)=>{
  if(!process.env.GITHUB_TOKEN||!process.env.GITHUB_SHA)return;
  const res=await fetch('https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/statuses/'+process.env.GITHUB_SHA,{
    method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Content-Type':'application/json',
      'X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({state,context:'PaperAI production verification',description:description.slice(0,140),
        target_url:'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID})});
  if(!res.ok)throw new Error('Could not record production verification status ('+res.status+')');
};
async function read(path,options={}){
  const res=await fetch(BASE+path,{...options,signal:AbortSignal.timeout(15000)});
  const body=await res.text();return {status:res.status,body,headers:res.headers};
}
async function waitForRelease(){
  const expected=process.env.GITHUB_SHA;
  const deadline=Date.now()+90000;
  do {
    const [home,guard]=await Promise.all([read('/',{cache:'no-store'}),read('/local-ocr-check',{cache:'no-store'})]);
    const active=home.status===200&&(!expected||home.body.includes('name="paperai-release" content="'+expected+'"'));
    if(active&&guard.status===404)return home;
    console.log(JSON.stringify({stage:'Waiting for production release',active,guard:guard.status,
      responseTitle:(guard.body.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]?.slice(0,120)}));
    await pause(3000);
  }while(Date.now()<deadline);
  throw new Error('The expected release and route protections did not become active within 90 seconds.');
}
async function runGroup(name,count,concurrency,operation){
  let next=0,failures=0;const times=[],statuses={};const started=performance.now();
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(next<count && failures<3){
      const index=next++,t=performance.now();
      try{const code=await operation(index);statuses[code]=(statuses[code]||0)+1;}
      catch(_){failures++;}
      times.push(performance.now()-t);
      // At most one request per second per lane, even if responses are immediate.
      await pause(Math.max(0,1000-(performance.now()-t)));
    }
  }));
  times.sort((a,b)=>a-b);const percentile=p=>Math.round(times[Math.max(0,Math.ceil(times.length*p)-1)]||0);
  const result={name,requested:count,completed:times.length,concurrency,failures,statuses,
    p50_ms:percentile(.5),p95_ms:percentile(.95),max_ms:percentile(1),seconds:+((performance.now()-started)/1000).toFixed(2)};
  groups.push(result);console.log(JSON.stringify(result));
  assert.equal(failures,0,name+' failed; remaining traffic stopped after three errors');assert.equal(times.length,count);
}
(async()=>{
  await status('pending','Checking public routes and bounded website/API load');
  const home=await waitForRelease();assert.equal(home.status,200);assert(home.body.includes('Ready to scan'));assert(!home.body.includes('id="quotaRemaining"'));assert(!home.body.includes('228 MB'));
  assert(!/Cloudflare|workers\.dev|Gemma|Gemini|Florence|Tesseract|Neurons/i.test(home.body));checks.push('Public dashboard contains no provider labels or backend hostname');
  for(const path of ['/local-ocr-check','/local-ocr-check.html','/api/debug','/api/train/export','/vendor/local-ocr.js','/vendor/local-ocr-layout.js','/vendor/local-reader-worker.js','/vendor/local-runtime/reader.js','/vendor/local-runtime/manifest.json','/vendor/local-runtime/hin.traineddata.gz','/vendor/local-ocr-worker.mjs']){
    assert.equal((await read(path)).status,404,path);checks.push(path+' is unavailable');
  }
  const health=await read('/api/health');assert.equal(health.status,200);assert.deepEqual(JSON.parse(health.body),{status:'healthy'});
  const usage=await read('/api/usage');assert.equal(usage.status,200);
  assert.deepEqual(Object.keys(JSON.parse(usage.body)).sort(),['date_utc','provider_limit_reached','reset_at']);
  for(const path of ['/vendor/document-reader.js','/vendor/document-worker.js','/vendor/archive-reader.js','/vendor/sheet-reader.js']){
    const asset=await read(path);assert.equal(asset.status,200);assert(asset.body.length>10000);checks.push(path+' loads');
  }
  for(const concurrency of [5,10,20])await runGroup('dashboard-'+concurrency,40,concurrency,async()=>{
    const res=await read('/');assert.equal(res.status,200);assert(res.body.includes('Extract text from anything'));return res.status;
  });
  await runGroup('usage',40,10,async()=>{const res=await read('/api/usage');assert.equal(res.status,200);assert.equal(typeof JSON.parse(res.body).provider_limit_reached,'boolean');return res.status;});
  await runGroup('text-upload',20,5,async i=>{
    const text='I. Answer the following. (5)\n1. Name the planet. ______\n2. Add 12 + 6. ______\nPaperAI load fixture '+i;
    const form=new FormData();form.append('file',new Blob([text],{type:'text/plain'}),'synthetic-load-'+i+'.txt');form.append('language','en');
    const res=await read('/api/ocr',{method:'POST',body:form});assert.equal(res.status,200);
    const body=JSON.parse(res.body);assert.equal(body.status,'completed');assert.equal(body.result.full_text,text);
    assert(!body.result.metadata?.engine);assert(!body.result.metadata?.model);return res.status;
  });
  report.finished_at=new Date().toISOString();report.result='passed';
  const total=groups.reduce((n,g)=>n+g.completed,0),p95=Math.max(...groups.map(g=>g.p95_ms));
  await status('success',total+' load requests; 0 failures; up to 20 concurrent; worst group p95 '+p95+' ms');
})().catch(async error=>{
  report.result='failed';report.error=error.message;console.error(error.message);
  try{await status('failure','Production verification failed: '+error.message);}catch(e){console.error(e.message);}
  process.exitCode=1;
}).finally(()=>{
  fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/production-verification.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### PaperAI production verification\n\n```json\n'+JSON.stringify(report,null,2)+'\n```\n');
});
