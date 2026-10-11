// A quota failure on page two must not discard page one or its source image.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
let requests=[],fail=true,renders=0,id=0;
const ctx=vm.createContext({Map,WeakMap,AbortController,setTimeout,clearTimeout,
 crypto:{randomUUID:()=>String(++id)},scanCancelled:false,languageSelect:{value:'auto'},extractedMedia:[],
 pdfToPages:async()=>{renders++;return [0,1,2].map(blob=>({type:'image',blob}));},
 sendToOCR:async(blob)=>{
  requests.push(blob);
  if(blob===1&&fail){fail=false;throw new Error('Daily free AI OCR limit reached.');}
  const asset={id:'source-'+(ctx.extractedMedia.length+1),dataUrl:'original-'+blob,w:30,h:40};ctx.extractedMedia.push(asset);
  return {status:'completed',result:{annotated_text:'Question '+blob+'\n[[SOURCE_FIGURE: '+asset.id+'| |none]]',full_text:'Question '+blob}};
 },portableText:String});
vm.runInContext(code.slice(code.indexOf('const scannedPageCache='),code.indexOf('goBtn.onclick = async')),ctx);
(async()=>{
 const f={name:'same-name.pdf'};
 await assert.rejects(()=>ctx.extractOneFile(f,()=>{},''),/Completed 1\/3 pages are kept/);
 ctx.extractedMedia=[];
 const output=await ctx.extractOneFile(f,()=>{},'');
 assert.deepEqual(requests,[0,1,1,2],'Resume must not submit the completed page twice');
 assert.equal(renders,1,'The same open file need not render again');
 assert.equal(ctx.extractedMedia.length,3);
 assert.equal(new Set(ctx.extractedMedia.map(a=>a.id)).size,3);
 assert(output.text.includes('resume-1'));
 const restored=ctx.restoreScannedPage({text:'[[SOURCE_FIGURE_ROW: source-1| |none || source-10| |none]]',media:[{id:'source-1'},{id:'source-10'}]});
 assert(restored.text.includes('resume-2|')&&restored.text.includes('resume-3|'),'An image ID must not replace the prefix of another ID');
 ctx.extractedMedia=[];ctx.languageSelect.value='hi';
 await ctx.extractOneFile(f,()=>{},'');
 assert.equal(renders,2,'A language change starts a separate extraction');
 ctx.extractedMedia=[];
 await ctx.extractOneFile({name:'same-name.pdf'},()=>{},'');
 assert.equal(renders,3,'Different files with equal names must not share cached questions');
 console.log('Scan resume: completed pages and pictures retained; language and file identity isolated.');
})().catch(error=>{console.error(error);process.exitCode=1;});
