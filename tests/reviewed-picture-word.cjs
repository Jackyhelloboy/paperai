const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const JSZip=require('../frontend/node_modules/jszip'),P=require('../frontend/vendor/picture-search');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ctx=vm.createContext({PaperAILayout:require('../frontend/vendor/paper-layout'),PaperAIProfessionalPaper:require('../frontend/vendor/professional-paper'),JSZip,Blob,setTimeout,clearTimeout,fetch:async()=>({ok:false}),
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),formatOutputLine:String,repairLegacyBranchDiagram:String,isOutputHeadingLine:()=>false,circledNumberValue:()=>null});
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ctx);
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
const names=['kite','duck','fish','tap','fruits'],pixels=[];
ctx.testMedia=names.map((name,i)=>{const art=P.reviewedArtwork(name),bytes=fs.readFileSync('frontend'+art.assetUrl);pixels.push(bytes);
 return {id:'reviewed-'+i,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),w:bytes.readUInt32BE(16),h:bytes.readUInt32BE(20),widthTwips:1550,webSource:art};});
vm.runInContext('extractedMedia=testMedia;resolveHeaderBanner=async()=>null;',ctx);
const paper='Class: I\nSubject: Hindi\nIII. Look at the pictures and fill in the missing letter.\n'+
 '[[SOURCE_FIGURE_ROW: reviewed-0|1. __ तंग|none || reviewed-1|2. __ तख|none || reviewed-2|3. __ छली|none || reviewed-3|4. __ ल|none || reviewed-4|5. __ ल|none]]';
(async()=>{
 const blob=await ctx.makeExtractedDocx(paper),bytes=Buffer.from(await blob.arrayBuffer()),zip=await JSZip.loadAsync(bytes);
 const xml=await zip.file('word/document.xml').async('text');
 assert.equal((xml.match(/<wp:inline /g)||[]).length,5);assert(xml.includes('CC BY-SA 4.0')&&xml.includes('openmoji.org'));
 assert(xml.includes('तंग')&&xml.includes('छली')&&!xml.includes('[['));
 for(let i=0;i<5;i++)assert.deepEqual(await zip.file('word/media/rIdSource'+(i+1)+'.png').async('nodebuffer'),pixels[i]);
 assert(!(await zip.file('word/_rels/document.xml.rels').async('text')).includes('TargetMode="External"'));
 if(process.env.PAPERAI_REVIEWED_QA_DOCX)fs.writeFileSync(process.env.PAPERAI_REVIEWED_QA_DOCX,bytes);
 console.log('Five reviewed PNGs embed in one editable Word row with literal Hindi labels, original bytes and source/license credits.');
})().catch(e=>{console.error(e);process.exitCode=1});
