const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('frontend/index.html', 'utf8');
function element() {
  const classes = new Set();
  return {hidden:false,disabled:false,style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},scrollIntoView(){}};
}
const elements = new Map();
const $ = id => {if(!elements.has(id))elements.set(id,element());return elements.get(id);};
let resolvePending, seenSignal, calls = 0, errors = [], mode = 'pending', clears = 0;
const ctx = vm.createContext({$,AbortController,DOMException,WeakMap,files:[{name:'page.txt',size:40}],
  goBtn:$('goBtn'),resBox:$('resBox'),prog:$('prog'),teachPanel:$('teachPanel'),textOut:$('textOut'),
  preparedImageCache:new WeakMap(),lastResult:null,showingRaw:false,
  resetSmartExtraction:()=>clears++,startSmartExtractionForFiles:()=>calls++,updateSmartExtractionUI(){},
  hideErr(){},showErr:e=>errors.push(e),setProg(){},loadUsage(){},
  getSmartExtractionResult:async(f,i,n,signal)=>{seenSignal=signal;if(mode==='pending')return new Promise(r=>resolvePending=r);if(mode==='error')throw new Error('Network offline');return {pages:[{text:'1. Hindi worksheet',plain:'1. Hindi worksheet'}],pageCount:1};},
  analyzePaperBatch:async()=>({documents:[{}]}),saveQuestionPatternsFromAnalysis(){},
  assemblePaperPages:p=>({text:p[0].text,plain:p[0].plain,raw:p[0].text,ordered:p}),repairLegacyBranchDiagram:s=>s,
  esc:s=>s,getLayoutOptions:()=>({}),updateResultActionsForTab(){},applyLayoutOverridesToStructuredText:s=>s,
  formatOutput:s=>s,updateLayoutAudit(){},applyOutputProfile(){},setTimeout:fn=>{fn();return 1;},
  window:{matchMedia:()=>({matches:false}),PaperAIDocumentModel:{parse:()=>({profile:{}})}}});
vm.runInContext(html.slice(html.indexOf("let extractionView = 'select'"),html.indexOf('\nfunction dlBlob(')),ctx);
(async()=>{
  const first = ctx.startExtraction();
  assert($('uploadControls').hidden && !$('extractionNav').hidden,'Processing hides uploads and shows Back');
  assert.equal(calls,1);
  ctx.goBackToUpload();
  assert(seenSignal.aborted,'Back aborts the active request');
  assert(!$('uploadControls').hidden && $('extractionNav').hidden);
  assert.equal(ctx.files.length,1,'Back preserves selected files for replacement or retry');
  resolvePending({pages:[{text:'STALE RESULT'}]});await first;
  assert.equal(ctx.lastResult,null,'A cancelled run cannot overwrite the result');
  assert(!ctx.resBox.classList.contains('show'));
  assert.equal(errors.length,0,'Cancellation does not show a timeout error');
  mode='done';await ctx.startExtraction();
  assert.equal(ctx.lastResult.text,'1. Hindi worksheet');
  assert($('uploadControls').hidden && ctx.resBox.classList.contains('show'),'Results retain focused mode');
  ctx.goBackToUpload();mode='error';await ctx.startExtraction();
  assert(!$('extractionRetry').hidden && !ctx.prog.classList.contains('show'),'Failures stop progress and offer Retry');
  assert.equal(errors[0],'Network offline');
  mode='done';await ctx.startExtraction();assert.equal(ctx.lastResult.text,'1. Hindi worksheet');
  assert(clears>=3,'Temporary extraction jobs are released on Back and success');
  // Exercise real queue cancellation: a queued job must settle without starting OCR or retrying.
  let aiCalls=0;
  const jobs=vm.createContext({AbortController,DOMException,Map,Promise,navigator:{},files:[], $:()=>null,
    extractOneInputFile:async()=>{aiCalls++;},setTimeout});
  vm.runInContext(html.slice(html.indexOf('const SMART_MAX_IMAGES'),html.indexOf('let teachOriginalText')),jobs);
  vm.runInContext('smartExtractionWorkers=2',jobs);
  const file={name:'queued.png',size:100};
  const queued=jobs.getSmartExtractionResult(file,0,1,new AbortController().signal);
  jobs.cancelSmartJob(file);
  await assert.rejects(queued,{name:'AbortError'});
  assert.equal(aiCalls,0,'Cancelled jobs must never fall through to an inference retry');
  const selectSource=html.slice(html.indexOf('function setFiles('),html.indexOf('\nfunction setFile('));
  assert(!selectSource.includes('startSmartExtractionForFiles('),'Selection prepares images without consuming AI quota');
  let destroyed = 0, cleaned = 0;
  const pdfController = new AbortController();
  let cancelPDF = false;
  const pdf = vm.createContext({DOMException,Promise,setProg(){},reconstructPdfText:()=> 'Readable embedded PDF content',
    pdfjsLib:{GlobalWorkerOptions:{},getDocument:()=>({destroy:async()=>{destroyed++;},promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>{if(cancelPDF)pdfController.abort();return {items:[{},{},{}]};},getViewport:()=>({width:600}),cleanup:()=>cleaned++})})})}});
  vm.runInContext(html.slice(html.indexOf('async function pdfToPages('),html.indexOf('async function extractSpreadsheetFile(')),pdf);
  const digital=await pdf.pdfToPages({arrayBuffer:async()=>new ArrayBuffer(1)});
  assert.equal(digital[0].type,'text');assert.equal(cleaned,1);assert.equal(destroyed,1,'PDF worker is freed after reading');
  cancelPDF=true;
  await assert.rejects(pdf.pdfToPages({arrayBuffer:async()=>new ArrayBuffer(1)},pdfController.signal),{name:'AbortError'});
  assert(destroyed>=2,'PDF cancellation destroys the loading task');
  let previewDestroyed = 0, previewCleaned = 0;
  const preview = vm.createContext({Promise,Math,Number,String,$:()=>null,fmtSize:()=> '1 KB',
    document:{createDocumentFragment:()=>({appendChild(){}}),createElement:tag=>tag==='canvas'?{getContext:()=>({fillRect(){}}),toDataURL:()=> 'preview-image'}:{}},
    pdfjsLib:{GlobalWorkerOptions:{},getDocument:()=>({destroy:async()=>previewDestroyed++,promise:Promise.resolve({numPages:10,getPage:async()=>({getViewport:()=>({width:100,height:200}),render:()=>({promise:Promise.resolve()}),cleanup:()=>previewCleaned++})})})}});
  vm.runInContext(html.slice(html.indexOf('async function renderPdfPreviewCard('),html.indexOf('function openPreviewLightbox(')),preview);
  await preview.renderPdfPreviewCard({arrayBuffer:async()=>new ArrayBuffer(1),size:100},{isConnected:true,id:'pdfPreview_0',appendChild(){}});
  assert.equal(previewCleaned,3,'Only first three preview pages render and release resources');
  assert.equal(previewDestroyed,1,'Preview PDF worker is released after rendering');
  await preview.renderPdfPreviewCard({arrayBuffer:async()=>new ArrayBuffer(1)},{isConnected:false});
  assert.equal(previewCleaned,3,'Removed preview cards must abandon rendering');
  assert.equal(previewDestroyed,2,'Abandoned preview jobs still release their worker');
  console.log('Extraction hides uploads, cancels safely, ignores stale results, retains selected files and recovers through Retry.');
})().catch(error=>{console.error(error);process.exitCode=1;});
