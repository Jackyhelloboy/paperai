const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const start=html.indexOf('function sourceCropHasInk('),end=html.indexOf('async function recoverSourceFigures(',start);
assert(start>0&&end>start);
const ctx=vm.createContext({Uint32Array,Math});vm.runInContext(html.slice(start,end),ctx);
const width=120,height=100;
const image=paint=>{
 const data=new Uint8ClampedArray(width*height*4);data.fill(255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(paint(x,y)){
  const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=30;
 }
 return {getImageData:()=>({data})};
};
assert(!ctx.sourceCropHasInk(image(()=>false),width,height),'Blank source must not become a picture');
assert(!ctx.sourceCropHasInk(image((x,y)=>y===50),width,height),'A page ruling alone is not an illustration');
assert(ctx.sourceCropHasInk(image((x,y)=>((x-60)**2+(y-50)**2<20**2)&&((x-60)**2+(y-50)**2>17**2)),width,height),'Real outline drawing remains an image');
assert(ctx.sourceCropHasInk({},width,height),'Unknown pixel access requires review, not silent removal');
console.log('Image crop evidence: blank/ruling-only rejected, drawn outline retained.');
const Layout=require('../frontend/vendor/paper-layout.js');
const recoverStart=html.indexOf('async function recoverSourceFigures('),recoverEnd=html.indexOf('function sourceFigureHtml(',recoverStart);
const blankImage=vm.createContext({PaperAILayout:Layout,sourceCropHasInk:ctx.sourceCropHasInk,
  worksheetCells:s=>s.split(/\s*\|\|\s*/),packSourceFigureRows:s=>s,
  decodeImageSource:async()=>({width:100,height:100,close(){}}),blobToDataURL:async()=> 'data:image/png;base64,AA==',
  document:{createElement:()=>({width:0,height:0,getContext(){return {drawImage(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);data.fill(255);return {data};}};},toDataURL(){return 'data:image/png;base64,AA==';}})},
  crypto:{randomUUID:()=> 'never-used'}});
vm.runInContext(html.slice(recoverStart,recoverEnd),blankImage);
(async()=>{
 const media=[];
 const result=await blankImage.recoverSourceFigures('[[FIGURE: 100,100,100,100| |none]]',{},media);
 assert.equal(result,'[source image needs review]','A blank crop becomes editable review text, not a Word image or missing media ID');
 assert.equal(media.length,0);
})().catch(error=>{console.error(error);process.exitCode=1;});
