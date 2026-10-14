// Exercise the production PDF preparation and page scheduler at the render/OCR
// boundaries. No document is uploaded; this does not assess OCR recognition accuracy.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Pipeline=require('../frontend/vendor/page-pipeline.js');
const Layout=require('../frontend/vendor/paper-layout.js');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const contexts=[];
const scan=()=>({text:'',artwork:true});
const textPage=(text,extra={})=>({text,artwork:false,supported:true,...extra});

function setup(specs){
 const documents=[],renders=[],canvases=[],requests=[],pending=new Map(),progress=[];
 let opened=0,destroyed=0,active=0,maxActive=0,identifier=0,automatic=false;
 const file={name:'twenty-one-pages.pdf',arrayBuffer:async()=>new ArrayBuffer(1)};
 const pdfjsLib={GlobalWorkerOptions:{},OPS:{paintImageXObject:1,constructPath:2},
  getDocument(){
   opened++;
   const source={numPages:specs.length,closed:false,async destroy(){this.closed=true;destroyed++;},async getPage(number){
    assert(!this.closed,'A closed PDF must reopen before an unfinished page renders');
    const spec=specs[number-1];
    return {number,spec,cleaned:0,
     getTextContent:async()=>({items:spec.text?[{str:spec.text},{str:''},{str:''}]:[]}),
     getViewport:({scale})=>({width:600*scale,height:800*scale,scale}),
     getOperatorList:async()=>({fnArray:spec.artwork?[1]:[]}),
     cleanup(){this.cleaned++;},
     render({canvasContext,viewport}){
      const record={number,viewport,context:canvasContext,cancelled:false};renders.push(record);
      canvasContext.canvas.page=number;
      const task=spec.renderGate||{promise:spec.renderError?Promise.reject(spec.renderError):Promise.resolve()};
      return {promise:task.promise,cancel(){record.cancelled=true;task.reject?.(new Error('RenderingCancelledException'));}};
     }};
   }};
   documents.push(source);return {promise:Promise.resolve(source)};
  }};
 const ctx=vm.createContext({Map,WeakMap,AbortController,DOMException,setTimeout,clearTimeout,setInterval,clearInterval,
  PaperAIPagePipeline:Pipeline,PaperAILayout:Layout,pdfjsLib,crypto:{randomUUID:()=>String(++identifier)},
  PaperAIPdfEditable:{scene:async page=>({supported:page.spec.supported!==false,width:600,height:800,
   texts:[{text:page.spec.text,x:10,y:20,w:200,h:12}],images:[],shapes:[]})},
  document:{createElement(type){assert.equal(type,'canvas');const canvas={width:0,height:0,
   getContext(kind,options){assert.equal(kind,'2d');assert.equal(options.alpha,false);return {canvas};},
   toBlob(callback,mime,quality){canvas.mime=mime;canvas.quality=quality;callback({page:canvas.page});}};
   canvases.push(canvas);return canvas;}},
  reconstructPdfText:content=>content.items.map(item=>item.str).join('').trim(),
  portableText:String,docxVisibleText:String,scanCancelled:false,activeScanController:null,languageSelect:{value:'auto'},extractedMedia:[],
  sendToOCR:async(blob,signal,label,options)=>{
   assert(!signal.aborted);requests.push({page:blob.page,sourceKey:options.sourceKey});active++;maxActive=Math.max(maxActive,active);
   const gate=deferred();pending.set(blob.page,gate);
   const abort=()=>gate.reject(new DOMException('Cancelled','AbortError'));
   signal.addEventListener('abort',abort,{once:true});
   if(automatic)gate.resolve();
   try {await gate.promise;return {status:'completed',result:{annotated_text:'Question '+blob.page+'. Keep the exact original words.',full_text:'Question '+blob.page+'. Keep the exact original words.'}};}
   finally{signal.removeEventListener('abort',abort);active--;pending.delete(blob.page);}
  }});
 vm.runInContext(slice('async function pdfToPages(','async function extractSpreadsheetFile(')+slice('const scannedPageCache=','goBtn.onclick = async'),ctx);
 contexts.push(ctx);
 return {ctx,file,documents,renders,canvases,requests,pending,progress,stats:()=>({opened,destroyed,active,maxActive}),
  auto:()=>{automatic=true;},run:()=>{const result=ctx.extractOneFile(file,message=>progress.push(message),'');result.catch(()=>{});return result;},
  finish:async page=>{assert(pending.has(page),'Expected an active page '+page);pending.get(page).resolve();await tick();}};
}

(async()=>{
 assert.equal(Pipeline.DEFAULT_CONCURRENCY,2,'Use two conservative provider slots by default');
 assert.equal(Pipeline.recommendedConcurrency({}),2,'Missing capacity hints retain conservative concurrency');
 assert.equal(Pipeline.recommendedConcurrency({deviceMemory:2,hardwareConcurrency:8}),1,'Low-memory devices render only one scan at a time');
 assert.equal(Pipeline.recommendedConcurrency({deviceMemory:8,hardwareConcurrency:4}),3,'Capable devices can overlap three full-quality pages');
 assert.equal(Pipeline.recommendedConcurrency({deviceMemory:8,hardwareConcurrency:4,connection:{saveData:true}}),2,'Respect reduced-data devices');
 assert.equal(Pipeline.recommendedConcurrency({deviceMemory:4,hardwareConcurrency:16}),2,'Many CPU cores do not imply sufficient bitmap memory');
 const isolated=await Pipeline.run({items:[0,1,2,3],concurrency:1,process:async(_,i)=>{if(i===1)throw new Error('This page is taking longer than expected.');return {page:i};}});
 assert.equal(isolated.completed,3);assert.equal(isolated.errors.length,1);assert.deepEqual(isolated.results.filter(Boolean).map(r=>r.page),[0,2,3]);
 const fastGates=Array.from({length:5},deferred),fastStarted=[];
 const fastRun=Pipeline.run({items:[0,1,2,3,4],concurrency:Pipeline.recommendedConcurrency({deviceMemory:8,hardwareConcurrency:8}),
  process:async(_,index)=>{fastStarted.push(index);await fastGates[index].promise;return {page:index};}});
 assert.deepEqual(fastStarted,[0,1,2],'Capable-device selection must reach three OCR slots');
 fastGates[1].resolve();await tick();
 assert.deepEqual(fastStarted,[0,1,2,3],'A finished page immediately refills a capable-device slot');
 fastGates.forEach(gate=>gate.resolve());await tick();
 const fastResult=await fastRun;
 assert.deepEqual(fastResult.results.map(result=>result.page),[0,1,2,3,4],'Three slots retain source order');
 assert(html.includes('<script src="./vendor/page-pipeline.js"></script>'),'The scheduler must load before the upload script');
 const pdf=setup(Array.from({length:21},scan)),running=pdf.run();
 await tick();
 assert.deepEqual(pdf.requests.map(r=>r.page),[1,2],'Two pages must reach OCR before either finishes');
 assert.equal(pdf.renders.length,2,'Preparing a long PDF must not render all its pages eagerly');
 assert.equal(pdf.stats().active,2);
 const snapshots=[];
 // Finish the second member first on every wave. Source order must not depend
 // on provider latency, and the freed slot must immediately accept another page.
 while(pdf.pending.size){
  const next=Math.max(...pdf.pending.keys());
  snapshots.push([...pdf.pending.keys()]);await pdf.finish(next);
 }
 const result=await running;
 assert.equal(pdf.requests.length,21);assert.equal(new Set(pdf.requests.map(r=>r.page)).size,21);
 assert.equal(pdf.stats().maxActive,2,'Provider concurrency must stay bounded for a 21-page scan');
 assert(snapshots.length>2&&snapshots.slice(0,-1).every(pages=>pages.length===2),'Each completed page must immediately free an OCR slot');
 assert.equal(pdf.renders.length,21);assert.equal(pdf.stats().destroyed,1);
 const pageNumbers=[...result.text.matchAll(/Question (\d+)\./g)].map(match=>Number(match[1]));
 assert.deepEqual(pageNumbers,Array.from({length:21},(_,index)=>index+1),'Out-of-order OCR must assemble in source order');
 assert(pdf.progress.some(message=>message.includes('21/21 pages complete')));
 for(const render of pdf.renders){
  assert.equal(render.viewport.scale,2.5,'Parallel processing must not reduce raster detail');
  assert.equal(render.context.imageSmoothingEnabled,true);assert.equal(render.context.imageSmoothingQuality,'high');
 }
 for(const canvas of pdf.canvases){
  assert.equal(canvas.mime,'image/jpeg');assert.equal(canvas.quality,0.94,'JPEG quality must remain unchanged');
  assert.equal(canvas.width,0);assert.equal(canvas.height,0,'Release each render surface after producing its page blob');
 }
 for(const request of pdf.requests)assert(!('blob' in request.sourceKey),'Successful pages must not retain source bitmaps');
 assert.equal(pdf.ctx.activeScanController,null);

 const resume=setup(Array.from({length:5},scan)),cancelled=resume.run();await tick();
 await resume.finish(2); // Page 2 finishes before page 1; page 3 replaces it.
 assert.deepEqual(resume.requests.map(r=>r.page),[1,2,3]);
 resume.ctx.scanCancelled=true;resume.ctx.activeScanController.abort();
 await assert.rejects(cancelled,{name:'AbortError'});
 assert.equal(resume.stats().destroyed,1);assert.equal(resume.stats().active,0);
 resume.ctx.scanCancelled=false;resume.auto();
 const resumed=await resume.run();
 assert.deepEqual(resume.requests.map(r=>r.page),[1,2,3,1,3,4,5],'Resume must skip an out-of-order success');
 assert.equal(resume.requests[0].sourceKey,resume.requests[3].sourceKey,'An accepted request keeps its identity after cancellation');
 assert.equal(resume.requests[2].sourceKey,resume.requests[4].sourceKey);
 assert.equal(resume.stats().opened,2,'Later unrendered pages must reopen the released PDF');
 assert.equal(resume.stats().destroyed,2);assert.equal(resume.renders.length,5,'Retry must reuse unfinished rendered pages');
 assert.equal((resumed.text.match(/Question /g)||[]).length,5);

 const words='Read these original words without calling the OCR service.';
 const native=setup([textPage(words),textPage('Second native page retains every word.')]);
 const nativeResult=await native.run();
 assert.equal(native.requests.length,0);assert.equal(native.renders.length,0);
 assert.equal(nativeResult.nativePdfPages.length,2);assert(nativeResult.text.includes(words));assert.equal(native.stats().destroyed,1);
 const mixed=setup([textPage(words,{supported:false}),scan()]);mixed.auto();
 const mixedResult=await mixed.run();
 assert.deepEqual(mixed.requests.map(r=>r.page),[2],'Reliable native text must bypass OCR even in a mixed document');
 assert(mixedResult.text.indexOf(words)<mixedResult.text.indexOf('Question 2.'));
 assert(mixed.progress.some(message=>message.includes('1/2 pages complete')));
 const brokenText=setup([textPage('वणŊमाला िलखो। यह टूटी हुई पाठ परत है।')]);brokenText.auto();
 await brokenText.run();assert.deepEqual(brokenText.requests.map(r=>r.page),[1],'Broken Indic font maps still require full-quality OCR');

 const renderGate=deferred(),renderCancel=setup([{...scan(),renderGate},scan()]);
 const renderRun=renderCancel.run();await tick();
 renderCancel.ctx.scanCancelled=true;renderCancel.ctx.activeScanController.abort();
 await assert.rejects(renderRun,{name:'AbortError'});
 assert(renderCancel.renders[0].cancelled,'Cancel must stop an active PDF render task');
 assert(renderCancel.canvases.every(canvas=>canvas.width===0&&canvas.height===0));
 assert.equal(renderCancel.stats().destroyed,1);
 const preCancelled=setup([scan()]),controller=new AbortController();controller.abort();
 await assert.rejects(()=>preCancelled.ctx.pdfToPages(preCancelled.file,controller.signal,()=>{}),{name:'AbortError'});
 assert.equal(preCancelled.stats().opened,0,'A cancelled run must not start opening a PDF');

 const renderFailure=setup([{...scan(),renderError:new Error('Broken page pixels')},scan(),scan()]);renderFailure.auto();
 await assert.rejects(()=>renderFailure.run(),/Broken page pixels.*Completed 1\/3 pages are kept/);
 assert.deepEqual(renderFailure.requests.map(r=>r.page),[2],'A render failure stops new pages but retains an accepted peer');
 assert.equal(renderFailure.stats().destroyed,1);assert.equal(renderFailure.ctx.activeScanController,null);
 console.log('PDF page pipeline: 21 ordered pages, two busy slots, lazy full-quality renders, bitmap cleanup, cancel/resume/reopen, sparse success retention, native-text bypass and render failures pass.');
})().catch(error=>{for(const ctx of contexts)ctx.activeScanController?.abort();console.error(error);process.exitCode=1;});
