const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const canvases=[];
let bounds={x:100,y:150,width:800,height:1400,confidence:0.8};
const ctx=vm.createContext({document:{createElement:()=>{
  const canvas={draws:[],getContext:()=>({fillRect(){},drawImage:(...args)=>canvas.draws.push(args)}),
    toBlob:callback=>callback({size:2000})};canvases.push(canvas);return canvas;
}},decodeImageSource:async()=>({width:1000,height:1800,close(){}}),
detectPaperBounds:()=>bounds,analyzeCanvasDifficulty:()=>({difficulty:'easy',score:0}),
detectTextLineLayout:()=>({structured:false,lineCount:2})});
vm.runInContext(html.slice(html.indexOf('async function prepareImageForOCR('),html.indexOf('\nfunction ',html.indexOf('async function prepareImageForOCR('))),ctx);
(async()=>{
  const prepared=await ctx.prepareImageForOCR({size:20000});
  assert.equal(prepared.meta.pageAutoCropped,false,'The complete source remains authoritative');
  assert.equal(prepared.meta.detailPageFocused,true);assert.equal(prepared.detailImages.length,2);
  assert.deepEqual(canvases[0].draws[0].slice(1),[0,0,1000,1800]);
  assert.equal(canvases[1].draws[0][1],100);assert.equal(canvases[1].draws[0][2],150);
  const lowerTop=canvases[2].draws[0][2];
  assert(lowerTop<150+canvases[1].height,'Close-ups overlap rather than omit source rows');
  canvases.length=0;bounds={...bounds,confidence:0.2};
  const uncertain=await ctx.prepareImageForOCR({size:20000});assert.equal(uncertain.detailImages.length,0);
  canvases.length=0;bounds={...bounds,confidence:0.8};
  const safe=await ctx.prepareImageForOCR({size:20000},true);assert.equal(safe.detailImages.length,0);
  console.log('Handwriting detail aids focus confident page bounds, retain every full-frame pixel, and keep lighter retries bounded.');
})().catch(error=>{console.error(error);process.exitCode=1;});
