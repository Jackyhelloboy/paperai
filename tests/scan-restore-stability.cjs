const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+1));
let serial=0,opens=0,destroys=0;const requests=[];
const ctx=vm.createContext({Uint8Array,Map,crypto:{randomUUID:()=>String(++serial)},extractedMedia:[],pageReviewGeneration:0,sourceReviewPdfFile:null,sourceReviewPdfPromise:null,
 pdfjsLib:{getDocument(options){requests.push(options);opens++;return {promise:opens===1?Promise.reject(Error('Temporary load failure')):Promise.resolve({destroy:async()=>{destroys++;}})};}}});
vm.runInContext(slice('function restoreScannedPage','async function extractOneFile'),ctx);
vm.runInContext(slice('async function getSourceReviewPdf','function currentExportText'),ctx);
const source={text:'Visible source-1| must stay literal.\n[[SOURCE_FIGURE_ROW: source-1|source-1|none || pdf-source-1|pdf-source-1|none]]\n[[SOURCE_BANNER: source-banner]]',plain:'source-1|',media:[{id:'source-1'},{id:'pdf-source-1'},{id:'source-banner'}]};
const restored=ctx.restoreScannedPage(source);
assert(restored.text.includes('Visible source-1| must stay literal.'));
assert(restored.text.includes('[[SOURCE_FIGURE_ROW: resume-1|source-1|none || resume-2|pdf-source-1|none]]'));
assert(restored.text.includes('[[SOURCE_BANNER: resume-3]]'));
assert.equal(source.media[0].id,'source-1');assert.equal(restored.plain,source.plain);
(async()=>{
 const first={arrayBuffer:async()=>new ArrayBuffer(4)},second={arrayBuffer:async()=>new ArrayBuffer(5)};
 await assert.rejects(()=>ctx.getSourceReviewPdf(first),/Temporary/);
 await ctx.getSourceReviewPdf(first);assert.equal(opens,2,'Retry must reopen a failed PDF rather than reuse the rejected promise');
 await ctx.getSourceReviewPdf(first);assert.equal(opens,2,'A loaded review PDF should be reused');
 await ctx.getSourceReviewPdf(second);await Promise.resolve();assert.equal(destroys,1,'Switching source files releases the old PDF');
 ctx.releaseSourceReviewPdf(true);await Promise.resolve();assert.equal(destroys,2);assert.equal(ctx.pageReviewGeneration,1);
 assert(requests.every(r=>r.isEvalSupported===false&&r.cMapUrl&&r.standardFontDataUrl),'Every review load uses safe parsing and local language/font data');
 Object.assign(ctx,{processingUpload:false,fileBatch:[],file:null,scannedPageCache:new WeakMap(),scanCheckpointStore:{clear:async()=>null},showErr:message=>{ctx.storageMessage=message;}});
 vm.runInContext(slice('async function clearSavedScans','async function rescanSelectedPdf'),ctx);
 const button={textContent:'Clear saves'};assert.equal(await ctx.clearSavedScans(button),false);assert.equal(button.textContent,'Clear saves');assert(ctx.storageMessage.includes('could not be cleared'),'Storage failure must not be reported as Cleared');
 console.log('Source review and restore: failed-load retry, reader release, safe parsing, marker-only renaming and literal captions pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
