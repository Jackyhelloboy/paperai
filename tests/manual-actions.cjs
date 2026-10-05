const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');const tail=html.slice(start);const next=tail.slice(1).search(/\n(?:async )?function /);return (html.slice(Math.max(0,start-6),start)==='async '?'async ':'')+(next<0?tail:tail.slice(0,next+1));}
const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:false,textContent:''});return nodes.get(id);};
const ctx=vm.createContext({$,showingRaw:false});vm.runInContext(fn('updateResultActionsForTab'),ctx);
ctx.updateResultActionsForTab();assert(!$('downloadWordBtn').hidden && $('downloadTxtBtn').hidden);
ctx.showingRaw=true;ctx.updateResultActionsForTab();assert($('downloadWordBtn').hidden && !$('downloadTxtBtn').hidden);
const top=html.slice(html.indexOf('<div class="results-actions">'),html.indexOf('<div class="teach-panel"'));
assert.equal((top.match(/<button\b/g)||[]).length-1,3,'Only three top actions are visible, with one of the two exports hidden');
let calls=0, chips=[];
const editor={value:'flower',selectionStart:0,selectionEnd:6,setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};
const manual=vm.createContext({$,Response,AbortSignal,teachEditor:editor,smartComposition:{source:'flower',start:0,end:6},
 aiSuggestionTimer:null,aiSuggestionSequence:0,aiSuggestionCalls:0,aiSuggestionPending:false,aiSuggestionCache:new Map(),
 teachPanel:{classList:{contains:()=>true}},currentTeachLanguage:()=> 'hi',currentTeachScript:()=> 'devanagari',currentTeachSourceLanguage:()=> 'en',
 uniqueStrings:a=>[...new Set(a)],getTeachContext:()=> 'a flower',getLocalSmartSuggestions:()=> ['फ्लावर'],getLearnedCorrectionSuggestions:()=>[],getCanonicalPhraseOverride:()=>null,
 renderSuggestionChips:(local,ai)=>chips=[...local,...(ai||[])],hideErr(){},showErr:msg=>{throw Error(msg);},clearTimeout(){},loadUsage(){},
 findInputSegmentAtCaret:()=>({source:editor.value,start:0,end:editor.value.length}),
 fetchOcrEndpoint:async()=>{calls++;return Response.json({suggestions:['फूल','फ्लावर']});},
 replaceTeachRange:(a,b,v)=>{editor.value=editor.value.slice(0,a)+v+editor.value.slice(b);return a+v.length;},pushTeachHistory(){},renderTeachPreview(){},
 translitSuggestions:{classList:{remove(){}},innerHTML:''}});
for(const name of ['fetchAiTextSuggestions','showSmartSuggestions','manualSuggestionSegment','requestManualAiSuggestions','chooseSmartSuggestion'])vm.runInContext(fn(name),manual);
(async()=>{
 manual.showSmartSuggestions();assert.equal(calls,0,'Typing and local suggestions use no AI');
 const once=manual.requestManualAiSuggestions(), duplicate=manual.requestManualAiSuggestions();await Promise.all([once,duplicate]);
 assert.equal(calls,1,'Repeated clicks during a pending request make only one AI call');
 assert.equal(editor.value,'flower','AI suggestions never apply themselves');assert(chips.includes('फूल'));
 await manual.requestManualAiSuggestions();assert.equal(calls,1,'Same selected text and language reuse suggestions');
 manual.chooseSmartSuggestion('फूल');assert.equal(editor.value,'फूल','Only choosing a suggestion changes the selected text');
 const batch=vm.createContext({DOMException,localPaperAnalysis:p=>({count:p.length}),fetchOcrEndpoint:()=>{throw Error('Batch sorting must not call AI');}});
 vm.runInContext(fn('analyzePaperBatch'),batch);assert.equal((await batch.analyzePaperBatch([{},{}])).count,2);
 const pageCounts=[0,0];let allowSecond=false;
 const pdfRead=vm.createContext({DOMException,Map,completedPdfReads:new WeakMap(),setProg(){},
  pdfToPages:async()=>[{type:'image',blob:{page:0}},{type:'image',blob:{page:1}}],prefetchPreparedImage(){},
  pageProfileFromText:()=>({}),pageTail:t=>t,combineLocalPageRecords:r=>({text:r.map(p=>p.text).join('\n')}),
  sendToOCR:async blob=>{pageCounts[blob.page]++;if(blob.page===1&&!allowSecond)throw Error('Network offline');return {status:'completed',result:{full_text:'page '+blob.page}};}});
 vm.runInContext(html.slice(html.indexOf('async function extractOneInputFile('),html.indexOf("let extractionView = 'select'")),pdfRead);
 const file={name:'sample.pdf'};await assert.rejects(pdfRead.extractOneInputFile(file),/offline/);
 allowSecond=true;const resumed=await pdfRead.extractOneInputFile(file);assert.equal(resumed.pageCount,2);
 assert.deepEqual(pageCounts,[1,2],'A manual PDF retry reuses completed page reads and only retries the failed page');
 console.log('Tab exports are exclusive; AI Suggestions are manual, cached, single-request and apply only by choice; page ordering uses no AI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
