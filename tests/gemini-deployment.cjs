const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {check,requestJson}=require('../.github/scripts/check-gemini.cjs');
(async()=>{
  const log=[],calls=[];
  await check('',{request:()=>{throw new Error('Unexpected network');},log:s=>log.push(s)});
  const fixture='fixture-secret';
  await check(fixture,{log:s=>log.push(s),request:async(url,key,payload,timeout)=>{
    calls.push({url,key,payload,timeout});return payload?{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'PaperAI connection verified'}]}}]}:{supportedGenerationMethods:['generateContent']};
  }});
  assert.equal(calls.length,3);assert.equal(calls[0].timeout,15000);assert.equal(calls[2].timeout,25000);
  assert(!JSON.stringify(calls[2].payload).includes(fixture));assert(!log.join('\n').includes(fixture));
  assert(!log.join('\n').includes('private reasoning'));
  let metadataCalls=0;
  await check(fixture,{phase:'metadata',log:()=>{},request:async(u,k,p)=>{assert.equal(p,null);metadataCalls++;return {supportedGenerationMethods:['generateContent']};}});
  assert.equal(metadataCalls,2,'Install gate validates both model endpoints without waiting for capacity');
  let generationCalls=0;
  await check(fixture,{phase:'generation',log:()=>{},request:async(u,k,p)=>{assert(p);generationCalls++;return {candidates:[{finishReason:'STOP',content:{parts:[{text:'PaperAI connection verified'}]}}]};}});
  assert.equal(generationCalls,1);
  let capacityCalls=0;
  await check(fixture,{phase:'generation',log:()=>{},request:async(url)=>{
    capacityCalls++;if(url.includes('gemini-flash-latest')){const error=new Error('HTTP 503');error.transient=true;throw error;}
    assert(url.includes('gemini-3.5-flash-lite'));return {candidates:[{finishReason:'STOP',content:{parts:[{text:'PaperAI connection verified'}]}}]};
  }});assert.equal(capacityCalls,2);
  await assert.rejects(check(fixture,{log:()=>{},request:async()=>{throw new Error('Connection timed out.');}}),/metadata check: Connection timed out/);
  await assert.rejects(check(fixture,{log:()=>{},request:async(u,k,p)=>p?{candidates:[{finishReason:'MAX_TOKENS'}]}:{supportedGenerationMethods:['generateContent']}}),/generation check: Incomplete/);
  function transport(status,data){return(url,options,callback)=>{
    assert.equal(options.family,4);assert.equal(options.headers['X-goog-api-key'],fixture);assert(!url.includes(fixture));
    const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
      const response=new EventEmitter();response.statusCode=status;callback(response);response.emit('data',Buffer.from(data));response.emit('end');
    });return req;
  };}
  assert.deepEqual(await requestJson('https://example.test/',fixture,null,1000,transport(200,'{"ok":true}')),{ok:true});
  for(const status of [302,403,429,503]){
    await assert.rejects(requestJson('https://example.test/',fixture,null,1000,transport(status,'private '+fixture)),error=>
      error.message.includes('HTTP '+status)&&!error.message.includes(fixture)&&!error.message.includes('private')&&error.transient===(status===429||status>=500));
  }
  await assert.rejects(requestJson('https://example.test/',fixture,null,1000,transport(200,'private '+fixture)),/Invalid check response/);
  const {request:productionRequest,matchesSettings}=require('../.github/scripts/check-worker-scanning.cjs');
  assert(matchesSettings({success:true,result:{bindings:[{type:'plain_text',name:'PAPERAI_RELEASE_SHA',text:'fixture-release'}]}},'fixture-release'));
  assert(!matchesSettings({success:true,result:{bindings:[{type:'plain_text',name:'PAPERAI_RELEASE_SHA',text:'previous-release'}]}},'fixture-release'));
  assert(!matchesSettings({success:true,result:{bindings:[{type:'secret_text',name:'PAPERAI_RELEASE_SHA',text:'fixture-release'}]}},'fixture-release'));
  const productionTransport=status=>(url,options,callback)=>{
    assert.equal(options.family,4,'Production check must use bounded IPv4 transport');
    assert(options.signal instanceof AbortSignal);
    const req=new EventEmitter();req.end=body=>queueMicrotask(()=>{
      const res=new EventEmitter();res.statusCode=status;res.resume=()=>{};callback(res);
      res.emit('data',Buffer.from('{"status":"healthy","revision":"fixture-release"}'));res.emit('end');
    });req.destroy=()=>{};return req;
  };
  const productionResponse=await productionRequest('https://example.test/health',{signal:AbortSignal.timeout(1000)},productionTransport(200));
  assert.equal(productionResponse.status,200);assert.equal((await productionResponse.json()).revision,'fixture-release');
  await assert.rejects(productionRequest('https://example.test/health',{signal:AbortSignal.timeout(1000)},productionTransport(302)),/Redirect rejected/);
  console.log('Deployment check: bounded IPv4 metadata/generation checks, secret-header isolation, redirect rejection, sanitized failures and incomplete-output detection verified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
