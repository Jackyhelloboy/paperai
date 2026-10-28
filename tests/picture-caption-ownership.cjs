const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Layout=require('../frontend/vendor/paper-layout.js');
const html=fs.readFileSync('frontend/index.html','utf8'),app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const ctx=vm.createContext({PaperAILayout:Layout,worksheetCells:(s,n=32)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),worksheetGridSize:()=>null,repairLegacyBranchDiagram:String,isOutputHeadingLine:()=>false,circledNumberValue:()=>null,esc:String,formatOutputLine:String});
vm.runInContext(app.slice(app.indexOf('function xmlEscape'),app.indexOf('async function downloadWord')),ctx);
const png=fs.readFileSync('tests/fixtures/scanning-smoke.png').toString('base64');
vm.runInContext(`extractedMedia=Array.from({length:4},(_,i)=>({id:'pic'+i,dataUrl:'data:image/png;base64,${png}',w:300,h:300}));docxMediaUsed=new Map();activeDocxEditingMode='easy';`,ctx);
const options=['थ त द','ध त न','न द थ','द ध न'];
const source='[[SECTION_ROW: V. चित्र को पहचानकर पहले वर्ण पर गोला लगाओ। || 4x1=4]]\n[[SOURCE_FIGURE_ROW: '+options.map((t,i)=>'pic'+i+'|'+t+'|none').join(' || ')+']]';
const packed=ctx.packSourceFigureRows(source);
assert.equal(ctx.packSourceFigureRows(packed),packed,'Numbering must be idempotent');
const cells=packed.split('\n')[1].replace(/^\[\[SOURCE_FIGURE_ROW: /,'').replace(/\]\]$/,'').split(' || ');
for(let i=0;i<4;i++){
 const cell=Layout.source(cells[i]);assert.equal(cell.caption,(i+1)+'. <br>'+options[i]);
 const preview=ctx.sourceFigureHtml(cells[i]);assert(preview.includes('ocr-figure-number">'+(i+1)+'.'));
 assert(preview.includes(options[i]));for(let j=0;j<4;j++)if(i!==j)assert(!preview.includes(options[j]));
}
const xml=ctx.docxSourceRow(cells,4);
assert.equal((xml.match(/<wp:inline /g)||[]).length,4);
assert(!xml.includes('<w:tbl>')&&!xml.includes('txbxContent'));
assert(!xml.includes('<w:r><w:tab/></w:r>'),'Centered picture groups must not depend on tab-stop rendering');
for(const text of [...options,'1.','2.','3.','4.'])assert(xml.includes('>'+text+'</w:t>'));
assert((xml.match(/<w:spacing w:val=/g)||[]).length>=8,'Number/option groups need explicit independent spacing');
console.log('Picture ownership: mandatory per-bit numbers, idempotent assembly, separate Hindi options, preview ownership, independent inline Word spacing and no hidden containers pass.');
