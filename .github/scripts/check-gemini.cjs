// A minimal live credential/model check. Never print keys or upstream bodies.
const key=String(process.env.GEMINI_API_KEY||'').trim();
if(!key){console.log('Live backup check skipped: no deployment secret supplied. Routing regression tests use fixtures.');process.exit(0);}
(async()=>{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',{
    method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-goog-api-key':key},
    body:JSON.stringify({contents:[{parts:[{text:'Return exactly this text, with no explanation: PaperAI connection verified'}]}],
      generationConfig:{temperature:0,maxOutputTokens:4096}}),signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error('Backup credential/model check failed (HTTP '+response.status+'). Check the secret, API access and account limits.');
  const body=await response.json(),candidate=body.candidates?.[0];
  const text=(candidate?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
  if(candidate?.finishReason!=='STOP'||!text.includes('PaperAI connection verified'))throw new Error('Backup returned an incomplete connection check.');
  console.log('Live backup credential and configured model verified. No source documents uploaded by this check.');
})().catch(error=>{console.error(error.name==='TimeoutError'?'Backup connection check timed out.':error.message);process.exitCode=1;});
