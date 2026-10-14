// Sparse, out-of-order successes and their source pictures survive a failed peer.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const requests=[],pending=new Map(),progress=[];
let renders=0,id=0,automatic=false;
const ctx=vm.createContext({Map,WeakMap,AbortController,DOMException,setTimeout,clearTimeout,setInterval,clearInterval,
 PaperAIPagePipeline:require('../frontend/vendor/page-pipeline.js'),PaperAILayout:require('../frontend/vendor/paper-layout.js'),docxVisibleText:String,
 crypto:{randomUUID:()=>String(++id)},scanCancelled:false,languageSelect:{value:'auto'},extractedMedia:[],
 pdfToPages:async()=>{renders++;return Array.from({length:6},(_,blob)=>({type:'image',blob}));},
 sendToOCR:async(blob,signal,label,options)=>{
  requests.push({blob,sourceKey:options.sourceKey});
  const complete=()=>{
   const asset={id:'source-'+blob,dataUrl:'original-'+blob,w:30,h:40};options.media.push(asset);
   return {status:'completed',result:{annotated_text:'Question '+blob+'\n[[SOURCE_FIGURE: '+asset.id+'| |none]]',full_text:'Question '+blob}};
  };
  if(automatic)return complete();
  return new Promise((resolve,reject)=>{
   pending.set(blob,{resolve:()=>resolve(complete()),reject});
   signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
  });
 },portableText:String});
vm.runInContext(code.slice(code.indexOf('const scannedPageCache='),code.indexOf('goBtn.onclick = async')),ctx);
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
(async()=>{
 const f={name:'same-name.pdf'};
 const first=ctx.extractOneFile(f,m=>progress.push(m),'');
 await settle();assert.deepEqual(requests.map(r=>r.blob),[0,1],'Two pages start without waiting for page one');
 pending.get(1).resolve();await settle();assert.deepEqual(requests.map(r=>r.blob),[0,1,2]);
 pending.get(0).reject(new Error('Service busy.'));await settle();
 pending.get(2).resolve();
 await assert.rejects(()=>first,/Completed 2\/6 pages are kept/);
 assert.deepEqual(requests.map(r=>r.blob),[0,1,2],'A failure stops new submissions, while its accepted peer can finish');
 assert.equal(ctx.extractedMedia.length,0,'Parallel page media must remain isolated until ordered assembly');
 assert(progress.some(m=>m.includes('1/6 pages complete')&&m.includes('2 pages processing')&&m.includes('s')));
 automatic=true;ctx.extractedMedia=[];
 const output=await ctx.extractOneFile(f,()=>{},'');
 assert.deepEqual(requests.map(r=>r.blob),[0,1,2,0,3,4,5],'Resume skips every sparse completed page');
 assert.equal(requests[0].sourceKey,requests[3].sourceKey,'An unfinished page keeps the accepted request identity');
 assert.equal(renders,1,'The same open file reuses its page descriptors');
 assert.equal(ctx.extractedMedia.length,6);
 assert.equal(new Set(ctx.extractedMedia.map(a=>a.id)).size,6);
 for(let i=0;i<6;i++){
  assert.equal(ctx.extractedMedia[i].dataUrl,'original-'+i);
  assert(output.text.includes('Question '+i+'\n[[SOURCE_FIGURE: '+ctx.extractedMedia[i].id+'|'),'A page must reference only its own picture');
  if(i)assert(output.text.indexOf('Question '+(i-1))<output.text.indexOf('Question '+i),'Completion order must not change source order');
 }
 const restored=ctx.restoreScannedPage({text:'[[SOURCE_FIGURE_ROW: source-1| |none || source-10| |none]]',media:[{id:'source-1'},{id:'source-10'}]});
 assert(restored.text.includes('resume-7|')&&restored.text.includes('resume-8|'),'An image ID must not replace the prefix of another ID');
 ctx.extractedMedia=[];ctx.languageSelect.value='hi';await ctx.extractOneFile(f,()=>{},'');
 assert.equal(renders,2,'A language change starts a separate extraction');
 ctx.extractedMedia=[];await ctx.extractOneFile({name:'same-name.pdf'},()=>{},'');
 assert.equal(renders,3,'Different files with equal names must not share cached questions');
 automatic=false;ctx.extractedMedia=[];pending.clear();
 const cancelledFile={name:'cancel.pdf'},cancelled=ctx.extractOneFile(cancelledFile,()=>{},'');await settle();
 pending.get(1).resolve();await settle();
 ctx.scanCancelled=true;ctx.activeScanController.abort();
 await assert.rejects(()=>cancelled,{name:'AbortError'});
 const before=requests.length;ctx.scanCancelled=false;automatic=true;
 await ctx.extractOneFile(cancelledFile,()=>{},'');
 assert.deepEqual(requests.slice(before).map(r=>r.blob),[0,2,3,4,5],'Resume after cancel keeps an out-of-order completed page');
 assert.equal(ctx.activeScanController,null);
 console.log('Scan resume: bounded parallel pages, sparse cache, stable request identity, ordered page-owned pictures, cancellation, language and file isolation pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
