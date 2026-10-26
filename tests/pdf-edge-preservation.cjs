// Regression: scanned PDFs are already full pages, so the browser must never
// auto-crop their top bit, last line or source figure coordinates on retries.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const segment=code.slice(code.indexOf('async function sendToOCR('),code.indexOf('function publicPlainTextFromStructured('));
const preparation=code.slice(code.indexOf('async function prepareImageForOCR('),code.indexOf('function ' ,code.indexOf('async function prepareImageForOCR(')+10));
assert(preparation.includes('preservePageEdges ? null : detectPaperBounds('),'PDF page rectangles must bypass potentially destructive autocrop');
assert(preparation.includes('prepareImageForOCR(source, true, preservePageEdges)'),'Size retries must retain full PDF edges');

(async()=>{
 const calls=[],responses=[];
 const source=new Blob(['original image bytes'],{type:'image/jpeg'});
 const ctx=vm.createContext({Blob,FormData,Number,JSON,DOMException,
  prepareImageForOCR:async(blob,safe,preserve)=>{calls.push({blob,safe,preserve});return {blob,difficulty:'hard',meta:{lineCount:17}};},
  scanClient:{request:async()=>responses.shift()},
  languageSelect:{value:'hi'},appendLearningHints:()=>{},setProg:()=>{},
  wait:async()=>{},PaperAIQuota:{isDailyError:()=>false},
  PaperAILayout:{reconcileEmptyGrids:x=>x,normalise:x=>x},
  recoverSourceFigures:async x=>x,portableText:x=>x,docxVisibleText:x=>x
 });
 vm.runInContext(segment,ctx);
 const complete=()=>({ok:true,status:200,json:async()=>({status:'completed',result:{annotated_text:'[[SECTION_ROW: I. प्रश्न लिखिए। || 6M]]\n1. पहला प्रश्न'}})});
 responses.push(complete());
 const result=await ctx.sendToOCR(source,null,'',{pageNumber:1,pageCount:2,media:[]});
 assert.equal(result.status,'completed');
 assert.equal(calls[0].preserve,true,'The first PDF page must retain top and bottom margins');
 assert.equal(calls[0].safe,false);
 responses.push({ok:false,status:408,json:async()=>({code:'AI_TIMEOUT'})},complete());
 await ctx.sendToOCR(source,null,'',{pageNumber:2,pageCount:2,media:[]});
 assert.deepEqual(calls.slice(1).map(c=>[c.safe,c.preserve]),[[false,true],[true,true]],'A retry must not reintroduce cropping');
 responses.push(complete());
 await ctx.sendToOCR(source,null,'',{media:[]});
 assert.equal(calls.at(-1).preserve,false,'Standalone photographs can still detect paper edges');
 console.log('PDF edge preservation: complete source pages and timeout retries bypass photo-only cropping.');
})().catch(e=>{console.error(e);process.exitCode=1;});
