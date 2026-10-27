const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Layout=require('../frontend/vendor/paper-layout.js');
const html=fs.readFileSync('frontend/index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const a=inline.indexOf('function xmlEscape('),b=inline.indexOf('async function downloadWord(',a);
const ctx=vm.createContext({PaperAILayout:Layout,Blob,fetch:async()=>({ok:false}),setTimeout,clearTimeout,
  worksheetCells:(s,n=16)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
  repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:s=>/^[IVX]+[.)]/.test(s),circledNumberValue:()=>null});
vm.runInContext(inline.slice(a,b),ctx);
const png=fs.readFileSync('tests/fixtures/scanning-smoke.png').toString('base64');
vm.runInContext(`extractedMedia=Array.from({length:5},(_,i)=>({id:'img'+i,dataUrl:'data:image/png;base64,${png}',w:400,h:i%2?800:220}));docxMediaUsed=new Map();activeDocxEditingMode='easy';`,ctx);
const make=n=>ctx.docxSourceRow(Array.from({length:n},(_,i)=>'img'+i+'| |none'),5);
const three=make(3),five=make(5);
function widths(xml){return [...xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(x=>Number(x[1]));}
assert.equal(widths(three).length,3,'Three pictures require three equal cells, not five mostly empty columns');
assert.equal(widths(three).reduce((a,b)=>a+b,0),10466,'Short row spans the full printable width');
assert(Math.max(...widths(three))-Math.min(...widths(three))<=2);
assert.equal(widths(five).length,5);
assert.equal(widths(five).reduce((a,b)=>a+b,0),10466);
assert(three.includes('<w:tblLayout w:type="fixed"/>')&&five.includes('<w:cantSplit/>'),'Pictures need stable fixed rows');
assert(three.includes('<w:left w:w="110" w:type="dxa"/>'),'Adjacent pictures need a visible gutter');
for(const [xml,limit] of [[three,2250],[five,1750]]){
  const sizes=[...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)];
  assert.equal(sizes.length,xml===three?3:5);
  for(const [index,[,width,height]] of sizes.entries()){
    assert(Number(height)<=limit*635,'A tall crop must fit inside the row height budget');
    const ratio=index%2?0.5:400/220;
    assert(Math.abs(Number(width)/Number(height)-ratio)<0.003,'The source illustration must keep its aspect ratio');
  }
}
const layoutSnippet=inline.slice(inline.indexOf('function compactLayoutEvidence('),inline.indexOf('async function runAiBitLayout(',inline.indexOf('function compactLayoutEvidence(')));
const prompt=vm.createContext({layoutBitHeading:line=>/^\[\[SECTION_ROW:/.test(line)?line.match(/\[\[SECTION_ROW: ([^|]+)/)[1].trim():''});
vm.runInContext(layoutSnippet,prompt);
const packStart=inline.indexOf('function layoutBitHeading('),packEnd=inline.indexOf('function blobToDataURL(',packStart);
const pack=vm.createContext({lastResult:null,PaperAILayout:Layout,worksheetCells:(s)=>s.split(/\s*\|\|\s*/)});
vm.runInContext(inline.slice(packStart,packEnd),pack);
const sourceRows=['[[SECTION_ROW: IV. Name the pictures || 4M]]',
 '[[SOURCE_FIGURE_ROW: img0| |none || img1| |none]]',
 '[[SOURCE_FIGURE_ROW: img2| |none || img3| |none]]'].join('\n');
const packed=pack.packSourceFigureRows(sourceRows,[]);
assert.equal((packed.match(/SOURCE_FIGURE_ROW/g)||[]).length,2,'Explicit 2 by 2 source picture arrangement must remain two rows');
assert.equal(packed.split('\n')[1].split('||').length,2);
assert.equal(packed.split('\n')[2].split('||').length,2);
const evidence=prompt.compactLayoutEvidence(['[[SECTION_ROW: I. Identify pictures || 5M]]',...Array.from({length:12},(_,i)=>(i+1)+'. Label'),
  '[[SOURCE_FIGURE_ROW: one|1|none || two|2|none || three|3|none]]'].join('\n'));
assert(evidence.includes('SOURCE_FIGURE_ROW'),'Later source drawings must be visible to the AI planner without sending whole pages');
console.log('Word image rows: full-width 3/5 cells, bounded height, fixed table and late image evidence pass.');
