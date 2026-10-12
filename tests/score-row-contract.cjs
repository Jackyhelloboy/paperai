// Reproduce the three-field headings and leaked empty-mark flags observed in
// the real Hindi PDF. Verify canonical data, preview placement and Word cells.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Layout=require('../frontend/vendor/paper-layout.js'),JSZip=require('../frontend/node_modules/jszip');
const {DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const worker=vm.createContext({});vm.runInContext(fs.readFileSync('worker/src/paper-layout-rules.js','utf8').replace(/export /g,''),worker);
const source='[[SECTION_ROW: I || अ से श्र तक वर्णमाला लिखो। || 25M]]\n[[SECTION_ROW: II || मात्राएँ लिखो। || 6x1=6M]]\n[[QUESTION_ROW: 1. च :- || none]]\n[[TABLE_REGION: 100,350,700,30]]\n[[GRID: 13x1]]\n[[MATCH_ROW: 5. क - ______ || none]]\n[[CHOICE_ROW: All || None]]';
const clean=Layout.normalise(source);
assert(clean.includes('[[SECTION_ROW: I अ से श्र तक वर्णमाला लिखो। || 25M]]'));
assert(clean.includes('[[SECTION_ROW: II मात्राएँ लिखो। || 6x1=6M]]'));
assert(clean.includes('1. च :-\n[[TABLE_REGION:'));
assert(!clean.includes('|| none')&&clean.includes('[[CHOICE_ROW: All || None]]'),'Geometry placeholders must disappear while genuine None options remain');
assert.equal(worker.normaliseMarkerRows(source),clean,'Server and browser must agree on the row contract');
const nested='[[SECTION_ROW: III || [[UNDERLINE: कहानी || शब्द]] || 2M]]';
assert(Layout.normalise(nested).includes('[[SECTION_ROW: III [[UNDERLINE: कहानी || शब्द]] || 2M]]'),'Only top-level cells may be combined');
const header=fs.readFileSync('tests/fixtures/school-header.pgm','utf8').trim().split(/\s+/);
assert.equal(header.shift(),'P2');const width=+header.shift(),height=+header.shift();assert.equal(+header.shift(),255);
const rgba=new Uint8ClampedArray(width*height*4);header.forEach((value,i)=>{rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=+value;rgba[i*4+3]=255;});
const bounds=Layout.bannerInkBounds(rgba,width,height);
assert(bounds&&bounds.h<height*.6&&bounds.w<width*.96&&bounds.w>width*.75,'Full header evidence must isolate the school title/address from editable fields');
const html=fs.readFileSync('frontend/index.html','utf8'),code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ctx=vm.createContext({PaperAILayout:Layout,JSZip,Blob,repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:()=>false,circledNumberValue:()=>null,
    fetch:async()=>({ok:false}),setTimeout,clearTimeout,esc:String,formatOutputLine:String});
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ctx);
(async()=>{
    const preview=ctx.formatStructuredWorksheetLine(clean.split('\n')[0]);
    assert(preview.includes('<span>I अ से श्र तक वर्णमाला लिखो।</span>'));
    assert(preview.includes('ocr-section-marks">25M</span>'),'The instruction must not enter the marks column');
    const zip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(clean)).arrayBuffer()),xml=await zip.file('word/document.xml').async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const allText=Array.from(doc.getElementsByTagName('w:t')).map(n=>n.textContent).join('');
    assert(!allText.includes('none')&&!allText.includes('||')&&allText.includes('None'));
    const mark=Array.from(doc.getElementsByTagName('w:p')).find(p=>p.textContent==='25M');
    assert(mark&&mark.getElementsByTagName('w:jc')[0]?.getAttribute('w:val')==='right');
    assert.equal(doc.getElementsByTagName('w:tc').length,21,'Section cells, the source grid and genuine options must remain native');
    console.log('Row contract: three-field Hindi headings, correct right marks, removed empty-mark flags, intact None choices/nested cues and measured school-banner bounds pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
