const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {check,requestJson}=require('../.github/scripts/check-gemini.cjs');
(async()=>{
  const log=[],calls=[];
  await check('',{request:()=>{throw new Error('Unexpected network');},log:s=>log.push(s)});
  const fixture='fixture-secret';
  await check(fixture,{log:s=>log.push(s),request:async(url,key,payload,timeout)=>{
    calls.push({url,key,payload,timeout});return payload?{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'PaperAI connection verified'}]}}]}:{supportedGenerationMethods:['generateContent']};
  }});
  assert.equal(calls.length,2);assert.equal(calls[0].timeout,15000);assert.equal(calls[1].timeout,90000);
  assert(!JSON.stringify(calls[1].payload).includes(fixture));assert(!log.join('\n').includes(fixture));
  assert(!log.join('\n').includes('private reasoning'));
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
      error.message.includes('HTTP '+status)&&!error.message.includes(fixture)&&!error.message.includes('private'));
  }
  await assert.rejects(requestJson('https://example.test/',fixture,null,1000,transport(200,'private '+fixture)),/Invalid check response/);
  console.log('Deployment check: bounded IPv4 metadata/generation checks, secret-header isolation, redirect rejection, sanitized failures and incomplete-output detection verified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
