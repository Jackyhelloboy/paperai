// Exercise the production Word builder, including real embedded pixels and credits.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const JSZip=require('../frontend/node_modules/jszip');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ctx=vm.createContext({PaperAILayout:require('../frontend/vendor/paper-layout.js'),PaperAIProfessionalPaper:require('../frontend/vendor/professional-paper.js'),
 JSZip,Blob,setTimeout,clearTimeout,fetch:async()=>({ok:false}),
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 formatOutputLine:String,repairLegacyBranchDiagram:String,isOutputHeadingLine:()=>false,circledNumberValue:()=>null});
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ctx);
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
const png=fs.readFileSync(process.argv[2]||'tests/fixtures/scanning-smoke.png');
const second=fs.readFileSync(process.argv[3]||'tests/fixtures/scanning-smoke.png');
const asset=(id,bytes,name)=>({id,dataUrl:'data:image/png;base64,'+bytes.toString('base64'),
 w:bytes.readUInt32BE(16),h:bytes.readUInt32BE(20),widthTwips:2000,
 webSource:{label:name,creator:'Textbook artist',license:'Public domain',sourceUrl:'https://commons.wikimedia.org/wiki/File:'+name}});
ctx.testMedia=[asset('online-1',png,'Duck'),asset('online-2',second,'Apple')];
vm.runInContext('extractedMedia=testMedia;resolveHeaderBanner=async()=>null;',ctx);
const text='Class I · Picture worksheet\nI. Look at the pictures and write their names.\n'+
 '[[SOURCE_FIGURE_ROW: online-1|1.|box || online-2|2.|box]]\n'+
 'II. Answer the question.\n3. Where do birds live? ______';
(async()=>{
 const blob=await ctx.makeExtractedDocx(text),bytes=Buffer.from(await blob.arrayBuffer());
 const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('text');
 assert(!xml.includes('[['));assert(xml.includes('3. Where do birds live?'));
 assert.equal((xml.match(/<wp:inline /g)||[]).length,2);
 assert(xml.includes('Public domain')&&xml.includes('commons.wikimedia.org'));
 assert(!xml.includes('w:pageBreakBefore'),'Pictures stay in continuous body flow');
 assert.deepEqual(await zip.file('word/media/rIdSource1.png').async('nodebuffer'),png);
 assert.deepEqual(await zip.file('word/media/rIdSource2.png').async('nodebuffer'),second);
 assert(!(await zip.file('word/_rels/document.xml.rels').async('text')).includes('TargetMode="External"'));
 if(process.argv[4])fs.writeFileSync(process.argv[4],bytes);
 // Replacing a picture must keep its caption and answer box, and must invalidate
 // the native-document shortcut that would otherwise export the old image.
 const nodes={pictureQuestion:{value:'asset:online-1'},tabVerified:{classList:{add(){}}},tabRaw:{classList:{remove(){}}}};
 ctx.$=id=>nodes[id];ctx.lastResult={text,native_docx_file:{old:true},native_pdf_pages:[{old:true}]};
 ctx.textOut={};ctx.formatOutput=String;ctx.portableText=String;ctx.docxVisibleText=String;
 ctx.updateResultActionsForTab=()=>{};ctx.openPicturePanel=()=>{};ctx.pictureStatus=()=>{};
 ctx.prepareQuestionPicture=async()=>{const {id,...prepared}=asset('ignored',second,'Replacement');return prepared;};
 await ctx.insertQuestionPicture(new Blob([second]),{target:'asset:online-1'});
 assert.equal(ctx.lastResult.text,text);assert(!ctx.lastResult.native_docx_file);assert(!ctx.lastResult.native_pdf_pages);
 // The helper prepares pixels, but the selected asset owns its stable identifier.
 assert(ctx.sourceAsset('online-1'),'Replacement must preserve its marker ID');
 console.log('Word export: original online pixels embedded offline, two editable answer cells, question numbering, credits and continuous flow passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
