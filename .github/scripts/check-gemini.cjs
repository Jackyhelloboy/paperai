// Deployment-only check. Credentials stay in headers; never print upstream bodies.
const https=require('node:https');
const origin='https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest';
const networkCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH']);
function failure(message,transient=false){const error=new Error(message);error.transient=transient;return error;}
function requestJson(url,key,payload,timeoutMs,requestImpl=https.request){
  return new Promise((resolve,reject)=>{
    // The deployment runner uses IPv4 explicitly; Workers use their own fetch.
    const body=payload?JSON.stringify(payload):null;
    const req=requestImpl(url,{method:body?'POST':'GET',family:4,
      headers:{'X-goog-api-key':key,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})},
      signal:AbortSignal.timeout(timeoutMs)},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){req.destroy();reject(new Error('Invalid check response.'));}else chunks.push(chunk);});
      response.on('error',()=>reject(failure('Check response interrupted.',true)));
      response.on('end',()=>{
        // Do not follow redirects carrying the credential header.
        if(response.statusCode<200||response.statusCode>=300){reject(failure('Credential/model check failed (HTTP '+response.statusCode+'). Check API access, key restrictions and account limits.',
          response.statusCode===408||response.statusCode===429||response.statusCode>=500));return;}
        try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(_){reject(new Error('Invalid check response.'));}
      });
    });
    req.on('error',error=>reject(failure(error.name==='AbortError'?'Connection timed out.':
      'Connection failed'+(networkCodes.has(error.code)?' ('+error.code+')':'')+'.',true)));
    req.end(body);
  });
}
async function check(key,{request=requestJson,log=console.log,phase='all'}={}){
  key=String(key||'').trim();
  if(!key){log('Live backup check skipped: no deployment secret supplied. Routing regression tests use fixtures.');return;}
  if(phase!=='generation')try{
    const model=await request(origin,key,null,15000);
    if(!model.supportedGenerationMethods?.includes('generateContent'))throw new Error('Configured model does not support generation.');
    log('Backup credential and model metadata verified.');
  }catch(error){throw failure('Backup metadata check: '+error.message,error.transient);}
  if(phase==='metadata')return;
  try{
    const result=await request(origin+':generateContent',key,{contents:[{parts:[{text:'Return exactly this text, with no explanation: PaperAI connection verified'}]}],
      generationConfig:{temperature:0,maxOutputTokens:4096}},90000);
    const candidate=result.candidates?.[0];
    const text=(candidate?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
    if(result.promptFeedback?.blockReason||candidate?.finishReason!=='STOP'||!text.includes('PaperAI connection verified'))throw new Error('Incomplete connection check.');
    log('Live backup credential and configured model verified. No source documents uploaded by this check.');
  }catch(error){throw failure('Backup generation check: '+error.message,error.transient);}
}
if(require.main===module)check(process.env.GEMINI_API_KEY,{phase:process.argv.includes('--metadata-only')?'metadata':process.argv.includes('--generation-only')?'generation':'all'})
  .catch(error=>{console.error(error.message);process.exitCode=error.transient?2:1;});
module.exports={check,requestJson};
