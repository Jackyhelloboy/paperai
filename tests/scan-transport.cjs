const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Client=require('../frontend/vendor/scan-client.js');
const context=vm.createContext({Request,Response,URL,Date});
vm.runInContext(fs.readFileSync('worker/src/scan-jobs.js','utf8').replace('export async function','async function'),context);
function owner(storage=new Map()){
  const waits=[];
  return {waits,storage,ctx:{waitUntil:p=>waits.push(p),storage:{get:async k=>storage.get(k),put:async(k,v)=>storage.set(k,structuredClone(v)),setAlarm:async time=>storage.set('alarm',time)}}};
}
const post=()=>new Request('https://test/api/ocr',{method:'POST',body:'image',headers:{'Content-Type':'image/jpeg'}});
const get=()=>new Request('https://test/api/ocr-status');
const completed=()=>Response.json({status:'completed',result:{full_text:'1. Write your name. ______'}});
(async()=>{
  const job=owner();let calls=0,finish;
  const run=async request=>{calls++;assert.equal(await request.text(),'image');return new Promise(resolve=>finish=resolve);};
  assert.equal((await context.handleScanJob(job,post(),run)).status,202,'Upload must acknowledge before AI finishes');
  assert.equal((await context.handleScanJob(job,post(),run)).status,202);
  assert.equal((await context.handleScanJob(job,get(),run)).status,202);
  assert.equal(calls,1,'Duplicate submissions and polls share the same inference');
  finish(completed());await Promise.all(job.waits);
  assert.equal((await context.handleScanJob(job,get(),run)).status,200);
  assert.equal(calls,1);
  const restored=owner(job.storage);
  assert.equal((await context.handleScanJob(restored,get(),run)).status,200,'Result survives object eviction');
  assert.equal(calls,1);
  assert(job.storage.get('alarm')>Date.now()&&job.storage.get('alarm')<=Date.now()+600000);
  assert.equal((await context.handleScanJob(owner(),get(),run)).status,404,'A different ID cannot collect this result');
  const saved=job.storage.get('scan-result');saved.expiresAt=Date.now()-1;
  assert.equal((await context.handleScanJob(owner(job.storage),get(),run)).status,404,'Expired results are not returned');

  let clock=0,id=0,uploads=0,polls=0;const source={};
  const client=Client.create({now:()=>clock,pause:async ms=>{clock+=ms;},randomId:()=>String(++id),fetcher:async(path,options)=>{
    assert.equal(options.headers['X-PaperAI-Request-ID'],'1');
    if(path==='/api/ocr'){uploads++;throw new TypeError('Connection dropped after upload');}
    assert.equal(options.method,'GET');assert.equal(options.body,undefined);polls++;
    if(polls===1)throw new TypeError('Temporary disconnection');
    if(polls===2)return Response.json({status:'processing'},{status:202});
    return completed();
  }});
  const res=await client.request({source,language:'hi',body:'image'});
  assert.equal(res.status,200);assert.equal(uploads,1);assert.equal(polls,3);

  clock=0;uploads=0;polls=0;let offline=true;const usedIds=[];
  const resume=Client.create({now:()=>clock,pause:async ms=>{clock+=ms;},randomId:()=>String(++id),fetcher:async(path,options)=>{
    usedIds.push(options.headers['X-PaperAI-Request-ID']);
    if(path==='/api/ocr')uploads++;else polls++;
    if(offline)throw new TypeError('offline');return completed();
  }});
  await assert.rejects(()=>resume.request({source,language:'hi',body:'image'}),/interrupted/);
  offline=false;assert.equal((await resume.request({source,language:'hi',body:'image'})).status,200);
  assert.equal(uploads,1,'Manual resume collects the old job instead of reuploading');assert.equal(new Set(usedIds).size,1);
  await resume.request({source,language:'en',body:'image'});assert.equal(uploads,2,'Language changes start a distinct scan');

  clock=0;let submissions=0,checks=0;
  const missing=Client.create({now:()=>clock,pause:async ms=>{clock+=ms;},randomId:()=>String(++id),fetcher:async path=>{
    if(path==='/api/ocr'){if(++submissions===1)throw new TypeError('Never arrived');return Response.json({status:'processing'},{status:202});}
    if(++checks===1)return Response.json({code:'SCAN_NOT_FOUND'},{status:404});return completed();
  }});
  assert.equal((await missing.request({source,language:'hi',body:'image'})).status,200);assert.equal(submissions,2);

  clock=0;let network=0;
  const cancel=new AbortController();cancel.abort();
  const bounded=Client.create({now:()=>clock,pause:async ms=>{clock+=ms;},randomId:()=>String(++id),fetcher:async()=>{network++;return Response.json({status:'processing'},{status:202});}});
  await assert.rejects(()=>bounded.request({source,language:'hi',body:'image',signal:cancel.signal}),{name:'AbortError'});assert.equal(network,0);
  await assert.rejects(()=>bounded.request({source,language:'hi',body:'image'}),/taking longer/);assert(clock<=182000,'Polling cannot continue indefinitely');
  clock=0;uploads=0;polls=0;
  const slow=Client.create({now:()=>clock,pause:async ms=>{clock+=ms;},fetcher:async path=>{if(path==='/api/ocr')uploads++;else polls++;return clock<120000?Response.json({status:'processing'},{status:202}):completed();}});
  assert.equal((await slow.request({source:{},language:'auto',body:'image'})).status,200);assert.equal(uploads,1);assert(polls>0);
  console.log('Scan transport: immediate acknowledgement, one inference per ID, durable result recovery, expiry, network reconnect, resume, bounded polling and cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
