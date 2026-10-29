const fs=require('node:fs'),{randomUUID}=require('node:crypto'),{request}=require('./check-worker-scanning.cjs');
async function verifyMathsProduction(){
 const id=randomUUID(),headers={'Content-Type':'application/json','X-PaperAI-Request-ID':id},started=Date.now();
 let response=await request('https://paperai-ocr.mdjawaadkhan57.workers.dev/api/ocr',{method:'POST',headers,body:JSON.stringify({image:fs.readFileSync('tests/fixtures/maths-count-smoke.png').toString('base64'),mimeType:'image/png',filename:'synthetic-six-stars.png',language:'en',image_meta:{parallelProviders:true}}),signal:AbortSignal.timeout(15000)});
 let body=await response.json();
 while(response.status===202&&Date.now()-started<95000){await new Promise(r=>setTimeout(r,1500));response=await request('https://paperai-ocr.mdjawaadkhan57.workers.dev/api/ocr-status',{headers:{'X-PaperAI-Request-ID':id},signal:AbortSignal.timeout(12000)});body=await response.json();}
 const text=String(body.result?.full_text||''),confirmed=/\[\[COUNT_OBJECTS:\s*star,6\|/i.test(text);
 console.log(JSON.stringify({check:'six-star-counting',http:response.status,code:typeof body.code==='string'?body.code:null,completed:body.status==='completed',two_read_quantity_confirmed:confirmed,elapsed_seconds:Math.round((Date.now()-started)/1000)}));
 if(!response.ok||body.status!=='completed'||!confirmed)process.exitCode=1;
}
module.exports={verifyMathsProduction};
if(require.main===module)verifyMathsProduction().catch(()=>{console.error('Synthetic maths verification did not complete.');process.exitCode=1;});
