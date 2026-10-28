const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const {createClient,evaluate,resultURL}=await import('../scripts/evaluate-baidu-unlimited.mjs');
 assert.throws(()=>createClient({}),/BAIDU_API_KEY/);
 for(const url of ['http://result.bcebos.com/a','https://result.bcebos.com.evil.test/a','https://user:pass@result.bcebos.com/a','https://127.0.0.1/a'])assert.throws(()=>resultURL(url));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperai-uocr-'));
 try{
  const input=path.join(dir,'source.pdf'),out=path.join(dir,'evaluation');await fs.writeFile(input,'%PDF-1.7\nSynthetic test only');
  let submissions=0,queries=0,downloads=0;
  const original={file_name:'source.pdf',pages:[{page_num:0,layouts:[{type:'text',text:'प्रश्न 1. किताब — (     )'}]},{page_num:1,layouts:[{type:'text',text:'తెలుగు ప్రశ్న 2. పుస్తకం'}]}]};
  const client=createClient({apiKey:'test-key',secretKey:'test-secret',fetcher:async(url,options)=>{
   const u=new URL(url);
   if(u.pathname==='/oauth/2.0/token'){assert.equal(u.searchParams.get('client_secret'),'test-secret');return Response.json({access_token:'test-token'});}
   if(u.hostname==='test-result.bcebos.com'){downloads++;assert(!options.headers,'Never forward credentials to result storage');return Response.json(original);}
   assert.equal(u.hostname,'aip.baidubce.com');assert.equal(u.searchParams.get('access_token'),'test-token');assert.equal(options.redirect,'error');
   const body=new URLSearchParams(options.body);
   if(u.pathname.endsWith('/query')){queries++;assert.equal(body.get('task_id'),'task-test');return Response.json({error_code:0,result:queries===1?{status:'running'}:{status:'success',parse_result_url:'https://test-result.bcebos.com/result.json'}});}
   submissions++;assert.equal(body.get('erase_watermark'),'false');assert.equal(body.get('file_name'),'source.pdf');return Response.json({error_code:0,result:{task_id:'task-test'}});
  }});
  const pending=await evaluate({input,out,expectedPages:2,client,maxPolls:1,pause:async()=>{}});assert.equal(pending.status,'pending');
  const done=await evaluate({input,out,expectedPages:2,client,maxPolls:2,pause:async()=>{}});assert.equal(done.status,'completed');assert(done.resumed);
  assert.equal(submissions,1,'Resume must not resubmit a completed upload');assert.equal(downloads,1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(out,'result.json'),'utf8')),original,'Never rewrite multilingual source output during evaluation');
  assert(!String(await fs.readFile(path.join(out,'checkpoint.json'))).includes('test-token'));
  await evaluate({input,out,expectedPages:2,client,maxPolls:0});assert.equal(submissions,1);
  await fs.unlink(path.join(out,'result.json'));await evaluate({input,out,expectedPages:2,client,maxPolls:1,pause:async()=>{}});assert.equal(downloads,2,'Recover a missing result using the saved task');
  await assert.rejects(evaluate({input,out,expectedPages:1,client}),/different source PDF or page count/);
  const wrong=path.join(dir,'wrong');
  await assert.rejects(evaluate({input,out:wrong,expectedPages:2,client:{submit:async()=> 'task-wrong',query:async()=>({status:'success',parse_result_url:'https://test-result.bcebos.com/a'}),result:async()=>({pages:[{page_num:1},{page_num:0}]})},maxPolls:1,pause:async()=>{}}),/out of order/);
  const errorClient=createClient({apiKey:'test-key',secretKey:'test-secret',fetcher:async()=>{throw Error('https://example.test/?secret=test-secret')}});
  await assert.rejects(errorClient.submit(Buffer.from('%PDF-test'),'test.pdf'),error=>!error.message.includes('test-secret')&&!error.message.includes('http'));
  await assert.rejects(client.submit(Buffer.from('not a pdf'),'source.pdf'),/file bytes/);
  console.log('Unlimited OCR evaluation: no-key isolation, official async flow, page coverage/order, preserved scripts, secret redaction and resumable task checkpoints pass. No real model inference was run.');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
