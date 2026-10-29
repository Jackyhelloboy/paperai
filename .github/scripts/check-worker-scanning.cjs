// One synthetic image check through the real production backend, not a provider-only check.
// Tail data stays in memory; print only our fixed, sanitized transport records.
const fs=require('node:fs'),https=require('node:https'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
function request(url,options={},requestImpl=https.request){
  return new Promise((resolve,reject)=>{
    const req=requestImpl(url,{method:options.method||'GET',family:4,headers:options.headers||{},signal:options.signal},res=>{
      if(res.statusCode>=300&&res.statusCode<400){res.resume();reject(new Error('Redirect rejected.'));return;}
      const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){req.destroy();reject(new Error('Response too large.'));}else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300,json:async()=>JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    });req.on('error',reject);req.end(options.body||null);
  });
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function objects(text){
  const found=[];let start=-1,depth=0,quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(start<0){if(c==='{'){start=i;depth=1;}continue;}
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{found.push(JSON.parse(text.slice(start,i+1)));}catch(_){}start=-1;}
  }return found;
}
function matchesSettings(body,expected){return body?.success===true&&Array.isArray(body.result?.bindings)&&body.result.bindings.some(binding=>binding.type==='plain_text'&&binding.name==='PAPERAI_RELEASE_SHA'&&binding.text===expected);}
async function deploymentDiagnostics(){
  const account=process.env.CLOUDFLARE_ACCOUNT_ID||'',token=process.env.CLOUDFLARE_API_TOKEN;
  if(!/^[a-f0-9]{32}$/i.test(account)||!token)return;
  const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/paperai-ocr/';
  const headers={Authorization:'Bearer '+token};
  try{
    const response=await request(base+'deployments',{headers,signal:AbortSignal.timeout(10000)});
    const body=await response.json();
    const deployments=Array.isArray(body.result?.deployments)?body.result.deployments:Array.isArray(body.result)?body.result:[];
    // Version IDs and traffic percentages are safe to log; no bindings or credentials.
    const active=deployments.sort((a,b)=>String(b.created_on||'').localeCompare(String(a.created_on||'')))[0];
    console.log(JSON.stringify({check:'active-worker-deployment',http:response.status,
      versions:Array.isArray(active?.versions)?active.versions.map(v=>({id:v.version_id,percentage:v.percentage})):[]}));
    if(active?.versions?.length){
      const id=active.versions.find(v=>v.percentage===100)?.version_id||active.versions[0].version_id;
      if(/^[a-f0-9-]{36}$/i.test(id)){
        const version=await request(base+'versions/'+id,{headers,signal:AbortSignal.timeout(10000)});
        const data=await version.json();
        const bindings=data.result?.resources?.bindings;
        console.log(JSON.stringify({check:'active-worker-version',http:version.status,id,
          releaseBindingPresent:Array.isArray(bindings)&&bindings.some(b=>b.name==='PAPERAI_RELEASE_SHA')}));
      }
    }
  }catch(_){console.log(JSON.stringify({check:'active-worker-deployment',available:false}));}
}
async function verifyProduction(){
  const expected=process.env.GITHUB_SHA;
  if(expected){
    let active=false,lastHealth={http:null,revisionPresent:false,networkCode:null};
    for(let attempt=0;attempt<20;attempt++){
      try{const response=await request('https://paperai-ocr.mdjawaadkhan57.workers.dev/health',{redirect:'error',signal:AbortSignal.timeout(5000)});
        const body=await response.json();active=body.revision===expected||(!body.revision&&body.source_fingerprint===require('./worker-fingerprint.cjs').expected());lastHealth={http:response.status,revisionPresent:Boolean(body.revision),networkCode:null};}catch(error){lastHealth.networkCode=['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH'].includes(error.code)?error.code:['AbortError','TimeoutError','SyntaxError'].includes(error.name)?error.name:'REQUEST_FAILED';}
      if(!active&&attempt===0&&lastHealth.http===200&&!lastHealth.revisionPresent&&/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID||'')&&process.env.CLOUDFLARE_API_TOKEN){
        try{const settings=await request('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/paperai-ocr/settings',{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(10000)});
          active=settings.ok&&matchesSettings(await settings.json(),expected);
          console.log(JSON.stringify({check:'private-deployment-revision',http:settings.status,matched:active}));
        }catch(_){console.log(JSON.stringify({check:'private-deployment-revision',matched:false}));}
      }
      if(active)break;await sleep(3000);
    }
    if(!active){await deploymentDiagnostics();console.error(JSON.stringify({check:'backend-revision',...lastHealth,matched:false}));throw new Error('Production backend revision did not become active.');}
    console.log('Production backend matches the deployment revision or exact source fingerprint.');
  }
  const tail=spawn('npx',['--yes','wrangler@4','tail','paperai-ocr','--format=json'],
    {cwd:'worker',detached:true,stdio:['ignore','pipe','pipe']});
  let logs='',stderrBytes=0,tailExit=null;tail.stdout.on('data',chunk=>{if(logs.length<1024*1024)logs+=chunk.toString();});
  tail.stderr.on('data',chunk=>{stderrBytes+=chunk.length;});tail.on('error',()=>{});tail.on('exit',code=>{tailExit=code;});
  try{
    await sleep(6000);
    const image=fs.readFileSync('tests/fixtures/scanning-smoke.png').toString('base64');
    const started=Date.now(),scanId=randomUUID();
    const headers={'Content-Type':'application/json','X-PaperAI-Request-ID':scanId};
    let response=await request('https://paperai-ocr.mdjawaadkhan57.workers.dev/api/ocr',{
      method:'POST',redirect:'error',headers,
      body:JSON.stringify({image,mimeType:'image/png',filename:'synthetic-smoke.png',language:'en'}),signal:AbortSignal.timeout(30000)});
    const acknowledgementMs=Date.now()-started;
    if(response.status!==202)throw new Error('Scan upload was not acknowledged.');
    let body=await response.json(),polls=0;
    while(response.status===202&&Date.now()-started<95000){
      await sleep(1500);polls++;
      response=await request('https://paperai-ocr.mdjawaadkhan57.workers.dev/api/ocr-status',{
        headers:{'X-PaperAI-Request-ID':scanId},signal:AbortSignal.timeout(12000)});
      body=await response.json();
    }
    console.log(JSON.stringify({check:'resumable-scan',acknowledgement_ms:acknowledgementMs,elapsed_ms:Date.now()-started,polls}));
    const collected=await request('https://paperai-ocr.mdjawaadkhan57.workers.dev/api/ocr-status',{
      headers:{'X-PaperAI-Request-ID':scanId},signal:AbortSignal.timeout(12000)});
    const saved=await collected.json();
    if(collected.status!==response.status||saved.result?.full_text!==body.result?.full_text)throw new Error('Saved page result changed.');
    const text=String(body.result?.full_text||'');
    console.log(JSON.stringify({check:'production-image',http:response.status,completed:body.status==='completed',
      code:['AI_BUSY','AI_TIMEOUT','OCR_OUTPUT_INVALID','FREE_AI_LIMIT_REACHED','SCAN_SERVICE_UNAVAILABLE'].includes(body.code)?body.code:null,
      literalQuestion:/12\s*\+\s*6/.test(text),extraAnswer:/\b18\b/.test(text)}));
    if(!response.ok||body.status!=='completed'||!/12\s*\+\s*6/.test(text)||/\b18\b/.test(text))process.exitCode=1;
    if(process.env.PAPERAI_CHECK_MATHS==='1')await require('./check-maths-scanning.cjs').verifyMathsProduction();
    await sleep(2000);
  }catch(_){console.error('Production image check did not complete.');process.exitCode=1;}
  finally{
    try{process.kill(-tail.pid,'SIGTERM');}catch(_){}
    tail.stdout.destroy();tail.stderr.destroy();
    console.log(JSON.stringify({tail_stdout_bytes:logs.length,tail_stderr_bytes:stderrBytes,tail_exit:tailExit}));
    for(const match of logs.matchAll(/\[Scan transport\] (gemini-(?:flash-latest|3\.5-flash-lite)) (http ([1-5]\d\d)|exception (TypeError|AbortError|TimeoutError|Error))/g))
      console.log(JSON.stringify({transport:match[1],http:match[3]?Number(match[3]):null,exception:match[4]||null}));
    for(const match of logs.matchAll(/\[Scan routing\] credential (present|absent)/g))console.log('Production backup credential: '+match[1]);
    for(const match of logs.matchAll(/exception (?:TypeError|AbortError|TimeoutError|Error) reason (redirect-mode|signal|header|network|runtime)/g))console.log('Transport reason: '+match[1]);
    // Fixed marker + known endpoint + HTTP code/error class only. Never dump the tail.
    for(const event of objects(logs))for(const entry of event.logs||[]){
      const m=entry.message||[];
      if(m[0]!=='[Scan transport]'||!['gemini-flash-latest','gemini-3.5-flash-lite'].includes(m[1]))continue;
      if(m[2]==='http'&&Number.isInteger(m[3])&&m[3]>=100&&m[3]<=599)console.log(JSON.stringify({transport:m[1],http:m[3]}));
      else if(m[2]==='exception'&&['TypeError','AbortError','TimeoutError','Error'].includes(m[3]))console.log(JSON.stringify({transport:m[1],exception:m[3]}));
    }
  }
}
module.exports={request,objects,verifyProduction,matchesSettings};
if(require.main===module)verifyProduction().catch(()=>{console.error('Production image verification failed.');process.exitCode=1;});
