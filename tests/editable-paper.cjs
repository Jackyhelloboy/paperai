const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const JSZip=require('../frontend/node_modules/jszip');
const Layout=require('../frontend/vendor/paper-layout.js');
const {DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const html=fs.readFileSync('frontend/index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const a=inline.indexOf('function xmlEscape('),b=inline.indexOf('async function downloadWord(',a);
const ctx=vm.createContext({PaperAILayout:Layout,JSZip,Blob,
    worksheetCells:(s,n=16)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
    worksheetGridSize:s=>{const m=s.match(/^(\d+)x(\d+)$/);return m?{columns:+m[1],rows:+m[2]}:null;},
    repairLegacyBranchDiagram:s=>s,
    isOutputHeadingLine:s=>/^(?:I|II|III|IV)[. ]/.test(s), circledNumberValue:()=>null,
    fetch:async()=>({ok:false}),setTimeout,clearTimeout
});
vm.runInContext(inline.slice(a,b),ctx);
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
vm.runInContext(`extractedMedia=[{id:'source-1',dataUrl:'data:image/png;base64,${png}',w:300,h:100,widthTwips:1800}]; resolveHeaderBanner=async()=>null;`,ctx);
const fixture=[
    'I. Look at the drawing. 2x1=2M',
    '[[SOURCE_FIGURE_ROW: source-1|1.|box || source-1| |none]]',
    '[[TABLE_WIDTHS: 20,50,30]]',
    '[[TABLE_ROW:  || Raw Materials || Tools]]',
    '[[TABLE_ROW: Basket making || 1. Leaves<br>2. Bamboo || Knife]]',
    '[[GRID_ROW: अ || _ || इ || _]]',
    '[[GRID_ROW: क || _ || ग || _]]',
    '[[GRID: 26x1]]',
    '[[SHAPE_ROW: square || circle || triangle]]',
    '[[PAGE_BREAK]]','[[PAGE_BREAK]]','II. Match the following. 2M',
    '[[MATCH_ROW: E || b]]','[[MATCH_ROW: T || e]]',
    '[[PAGE_BREAK]]'
].join('\n');
(async()=>{
    const blob=await ctx.makeExtractedDocx(fixture);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());
    const xml=await zip.file('word/document.xml').async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    assert.equal(doc.getElementsByTagName('parsererror').length,0);
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const size=doc.getElementsByTagNameNS(ns,'pgSz')[0], margins=doc.getElementsByTagNameNS(ns,'pgMar')[0];
    assert.equal(size.getAttributeNS(ns,'w'),'11906');assert.equal(size.getAttributeNS(ns,'h'),'16838');
    for(const side of ['top','bottom','left','right'])assert.equal(margins.getAttributeNS(ns,side),'720');
    assert(xml.includes('<w:keepNext/>'),'Section must stay attached to its first question');
    assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,1,'Consecutive/trailing breaks made blank pages');
    assert.equal((xml.match(/<wp:inline /g)||[]).length,5,'Original source figure lost');
    assert(xml.includes('cx="1143000" cy="381000"'),'Source picture aspect ratio changed');
    assert(xml.includes('<a:prstGeom prst="triangle">'),'Triangle must be native preset geometry');
    assert(!xml.includes('position:absolute'),'Editable geometry must remain in flow');
    assert(xml.includes('<w:tblHeader/>'),'Table headers must repeat across pages');
    assert(xml.includes('Raw Materials')&&xml.includes('2. Bamboo'));
    assert(!xml.includes('&lt;br&gt;'),'Multiline cells were flattened');
    assert.equal((xml.match(/<w:tbl>/g)||[]).length,10,'Consecutive grid rows should form one native table');
    assert(!Object.keys(zip.files).some(x=>x.includes('default-picture')),'Generic images must not replace source drawings');
    assert.equal((await zip.file('word/media/rIdSource1.png').async('base64')),png,'Source pixels must remain unchanged');
    const rels=await zip.file('word/_rels/document.xml.rels').async('text');
    assert(rels.includes('rIdSource1')&&rels.includes('media/rIdSource1.png'));
    const widths=Layout.tableWidths([['Name','Long detailed materials column','Tool']],10466);
    assert.equal(widths.reduce((a,b)=>a+b),10466);assert(widths[1]>widths[0]);
    for(const invalid of ['-1,0,20,20','950,0,60,20','0,0,1000,1000','x,1,2,3'])assert.equal(Layout.figure(invalid),null);
    assert.deepEqual(Layout.pixels(Layout.figure('100,200,300,400|1.|box'),2000,3000),{x:200,y:600,w:600,h:1200});
    assert.equal(Layout.section('IV. Map pointing. 4x1/2=2').marks,'4x1/2=2');
    assert.equal(Layout.normalise('SECTION_ROW: I. Count || 5M'),'[[SECTION_ROW: I. Count || 5M]]');
    const duplicate='[[FIGURE_ROW: 100,200,200,100|1.|none]]\n1. [[FIGURE: 100,200,200,100| |none]] = _____';
    assert(!Layout.deduplicateFigures(duplicate).includes('FIGURE_ROW'),'Duplicated detached illustration should not print twice');
    assert.equal(Layout.figureRows([{x:10,y:20,w:20,h:20},{x:40,y:22,w:20,h:20},{x:10,y:60,w:20,h:20}]).length,2,'Vertical picture rows must not be flattened horizontally');
    const image={width:600,height:200,data:new Uint8Array(600*200*4).fill(255)};
    const black=(x,y)=>{const n=(y*600+x)*4;image.data[n]=image.data[n+1]=image.data[n+2]=0;};
    for(let n=0;n<=7;n++)for(let y=50;y<=115;y++)black(100+n*35,y);
    assert.deepEqual(Layout.emptyGrids(image),[],'Isolated vertical strokes are not a grid');
    for(let x=100;x<=345;x++){black(x,50);black(x,115);}
    assert.equal(Layout.emptyGrids(image)[0].columns,7,'Count drawn divisions, not expected answers');
    const duplicatedGrids='I. Alphabet\n[[GRID: 13x1]]\n[[GRID: 12x1]]\nII. Small letters\n[[GRID: 24x1]]';
    const reconciled=Layout.reconcileEmptyGrids(duplicatedGrids,[{columns:13,rows:1},{columns:13,rows:1}]);
    assert.equal((reconciled.match(/GRID:/g)||[]).length,2,'Duplicate OCR grids must not add source cells');
    assert(!reconciled.includes('12x1')&&!reconciled.includes('24x1'));
    assert.equal(Layout.reconcileEmptyGrids(duplicatedGrids,[{columns:13,rows:1}]),duplicatedGrids,'An ambiguous geometry mapping must not change output');
    assert(!Layout.normalise('[[FIGURE_ROW: 1,1,10,10| |none]]\n(Note: The above FIGURE_ROW is a conceptual representation.)').includes('FIGURE_ROW'),'Generated conceptual notes are not paper content');
    assert(Layout.normalise('IV. Match the following\n1 E - b\n2 Thirteen 15').includes('[[MATCH_ROW: 2 Thirteen || 15]]'),'Visible matching columns should become native rows without solving');
    assert.equal(Layout.normalise('I. Answer the questions\n1 Thirteen 15'),'I. Answer the questions\n1 Thirteen 15','Ordinary questions must not become matching rows');
    if(process.env.PAPERAI_DOCX_OUT)fs.writeFileSync(process.env.PAPERAI_DOCX_OUT,Buffer.from(await blob.arrayBuffer()));
    console.log('Editable paper: A4 narrow margins, original source pixels, editable grids/shapes/tables, aspect ratio, repeated headers and page-break cleanup pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
