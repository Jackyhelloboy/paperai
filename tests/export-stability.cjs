const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const JSZip=require('../frontend/node_modules/jszip');
const html=fs.readFileSync('frontend/index.html','utf8'),code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ctx=vm.createContext({PaperAILayout:require('../frontend/vendor/paper-layout'),JSZip,Blob,setTimeout,clearTimeout,fetch:async()=>({ok:false}),repairLegacyBranchDiagram:String,isOutputHeadingLine:()=>false,circledNumberValue:()=>null});
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ctx);
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
const pictures=['kite','duck'].map(name=>fs.readFileSync('frontend/images/worksheet-reviewed/'+name+'.png'));
const gates=[];ctx.resolveHeaderBanner=(text,media)=>new Promise(resolve=>gates.push({resolve,media}));
const setPicture=index=>{ctx.asset={id:'same-id',dataUrl:'data:image/png;base64,'+pictures[index].toString('base64'),w:640,h:640};vm.runInContext('extractedMedia=[asset]',ctx);};
(async()=>{
 setPicture(0);const first=ctx.makeExtractedDocx('I. First paper.\n[[SOURCE_FIGURE: same-id|1.|none]]');
 setPicture(1);vm.runInContext("activeDocxEditingMode='source'",ctx);const second=ctx.makeExtractedDocx('II. Second paper.\n[[SOURCE_FIGURE: same-id|2.|none]]');
 assert.notEqual(gates[0].media[0].dataUrl,gates[1].media[0].dataUrl,'Each export captures its own media before awaiting a header');
 gates[1].resolve(null);gates[0].resolve(null);
 for(const [index,blob] of (await Promise.all([first,second])).entries()){
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  assert.deepEqual(await zip.file('word/media/rIdSource1.png').async('nodebuffer'),pictures[index],'A later upload must not replace an earlier export picture');
 }
 ctx.resolveHeaderBanner=async()=>null;
 await assert.rejects(()=>ctx.makeExtractedDocx('[[SOURCE_FIGURE: missing| |none]]'),/source picture is missing/i);
 assert(ctx.sourceAsset('same-id'),'A failed export must release its media snapshot');
 vm.runInContext("activeDocxEditingMode='easy'",ctx);
 const arithmetic=ctx.buildDocxBody('[[ARITHMETIC_ROW: 12<br>+ 6<br>___ || 20<br>- 3<br>___]]');
 assert.equal((arithmetic.match(/>_{3,}<\/w:t>/g)||[]).length,2,'Both arithmetic answer rules survive ordinary paragraph layout');
 assert(!arithmetic.includes('<w:tbl>')&&!arithmetic.includes('>18<'),'Do not add invisible layout cells or solve arithmetic');
 console.log('Word export stability: overlapping exports keep their own images, missing media rejects clearly, snapshot cleanup and arithmetic answer rules pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
