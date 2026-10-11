// One synthetic image check through the real production backend, not a provider-only check.
// Tail data stays in memory; print only our fixed, sanitized transport records.
const fs=require('node:fs'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function objects(text){
  const found=[];let start=-1,depth=0,quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(start<0){if(c==='{'){start=i;depth=1;}continue;}
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{found.push(JSON.parse(text.slice(start,i+1)));}catch(_){}start=-1;}
  }return found;
}
(async()=>{
  const tail=spawn('npx',['--yes','wrangler@4','tail','paperai-ocr','--format=json','--search=[Scan transport]'],
    {cwd:'worker',detached:true,stdio:['ignore','pipe','pipe']});
  let logs='';tail.stdout.on('data',chunk=>{if(logs.length<1024*1024)logs+=chunk.toString();});
  tail.stderr.on('data',()=>{});tail.on('error',()=>{});
  try{
    await sleep(6000);
    const image=fs.readFileSync('tests/fixtures/scanning-smoke.png').toString('base64');
    const response=await fetch('https://paperai-ocr.mdjawaadkhan57.workers.dev/api/ocr',{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image,mimeType:'image/png',filename:'synthetic-smoke.png',language:'en'}),signal:AbortSignal.timeout(140000)});
    const body=await response.json();
    const text=String(body.result?.full_text||'');
    console.log(JSON.stringify({check:'production-image',http:response.status,completed:body.status==='completed',
      code:['AI_BUSY','AI_TIMEOUT','OCR_OUTPUT_INVALID','FREE_AI_LIMIT_REACHED','SCAN_SERVICE_UNAVAILABLE'].includes(body.code)?body.code:null,
      literalQuestion:/12\s*\+\s*6/.test(text),extraAnswer:/\b18\b/.test(text)}));
    if(!response.ok||body.status!=='completed'||!/12\s*\+\s*6/.test(text)||/\b18\b/.test(text))process.exitCode=1;
    await sleep(2000);
  }catch(_){console.error('Production image check did not complete.');process.exitCode=1;}
  finally{
    try{process.kill(-tail.pid,'SIGTERM');}catch(_){}
    tail.stdout.destroy();tail.stderr.destroy();
    // Fixed marker + known endpoint + HTTP code/error class only. Never dump the tail.
    for(const event of objects(logs))for(const entry of event.logs||[]){
      const m=entry.message||[];
      if(m[0]!=='[Scan transport]'||!['gemini-flash-latest','gemini-3.5-flash-lite'].includes(m[1]))continue;
      if(m[2]==='http'&&Number.isInteger(m[3])&&m[3]>=100&&m[3]<=599)console.log(JSON.stringify({transport:m[1],http:m[3]}));
      else if(m[2]==='exception'&&['TypeError','AbortError','TimeoutError','Error'].includes(m[3]))console.log(JSON.stringify({transport:m[1],exception:m[3]}));
    }
  }
})().catch(()=>{console.error('Production image verification failed.');process.exitCode=1;});
