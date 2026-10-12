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
    '[[TABLE_HEADER: 1]]',
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
    assert.equal((xml.match(/<w:tbl>/g)||[]).length,12,'Consecutive grid rows should form one native table');
    assert(!Object.keys(zip.files).some(x=>x.includes('default-picture')),'Generic images must not replace source drawings');
    assert.equal((await zip.file('word/media/rIdSource1.png').async('base64')),png,'Source pixels must remain unchanged');
    vm.runInContext("extractedMedia[0].widthTwips=1814;extractedMedia[0].align='right';",ctx);
    const edited=ctx.buildDocxBody('[[MATCH_ROW: [[SOURCE_FIGURE: source-1| |none]] || ______]]');
    assert(edited.includes('cx="1151890"'),'A teacher-selected picture width must survive inside a matching cell');
    assert(/<w:jc w:val="right"\/>[\s\S]*?<wp:inline/.test(edited),'A standalone picture in a matching cell must honor its alignment');
    const countRow=ctx.buildDocxBody('[[TABLE_WIDTHS: 5,50,45]]\n[[MATCH_ROW: 1. || [[SOURCE_FIGURE: source-1| |none]] || = ______]]');
    assert(countRow.includes('<w:gridCol w:w="523"/>'),'Observed narrow number columns must retain their proportions');
    assert.equal((countRow.match(/<w:vAlign w:val="center"\/>/g)||[]).length,3,'Question numbers and blank answers must align vertically with their picture');
    const rels=await zip.file('word/_rels/document.xml.rels').async('text');
    assert(rels.includes('rIdSource1')&&rels.includes('media/rIdSource1.png'));
    const widths=Layout.tableWidths([['Name','Long detailed materials column','Tool']],10466);
    assert.equal(widths.reduce((a,b)=>a+b),10466);assert(widths[1]>widths[0]);
    for(const invalid of ['-1,0,20,20','950,0,60,20','0,0,1000,1000','x,1,2,3'])assert.equal(Layout.figure(invalid),null);
    assert.deepEqual(Layout.pixels(Layout.figure('100,200,300,400|1.|box'),2000,3000),{x:200,y:600,w:600,h:1200});
    assert.equal(Layout.section('IV. Map pointing. 4x1/2=2').marks,'4x1/2=2');
    const answerRow=ctx.buildDocxBody('7.     Labour fought for these?                     (                         )');
    assert(answerRow.includes('<w:cantSplit/>')&&answerRow.includes('w:w="1520"'),'Answer brackets must stay in a fixed column with their question');
    assert.equal((answerRow.match(/<w:tc>/g)||[]).length,2);
    assert.equal(Layout.questionAnswer('1. Explain (or) describe the process.'),null,'Meaningful parentheses are question content');
    assert(!ctx.docxFooterXml('Name: Formative Assessment - I Class: UKG\nSub: English MARKS').includes('Formative Assessment'),'Body metadata must not be guessed into the footer');
    assert(ctx.docxFooterXml('[[FOOTER: FA - I || English]]').includes('FA - I'),'Explicit source footer must be retained');
    assert.equal(Layout.normalise('SECTION_ROW: I. Count || 5M'),'[[SECTION_ROW: I. Count || 5M]]');
    // Exact pixels from the two curved blank strips in the Hindi training PDF.
    const curvedBytes=fs.readFileSync('tests/fixtures/hindi-curved-grids.pgm');
    const pgm=curvedBytes.toString('ascii',0,64).match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
    assert(pgm,'Training grid fixture must be an 8-bit PGM');
    const curved={width:Number(pgm[1]),height:Number(pgm[2]),data:new Uint8Array(Number(pgm[1])*Number(pgm[2])*4)};
    for(let i=0;i<curved.width*curved.height;i++){
        curved.data[4*i]=curved.data[4*i+1]=curved.data[4*i+2]=curvedBytes[pgm[0].length+i];curved.data[4*i+3]=255;
    }
    const curvedGrids=Layout.emptyGrids(curved);
    assert.deepEqual(curvedGrids.map(g=>[g.columns,g.rows]),[[13,1],[13,1]],'Curved source strips must not become eight-cell or eleven-cell OCR guesses');
    assert(Layout.normalise('5. न:- [[TABLE_REGION: 121,50,767,34]] [[GRID: 13x1]]').includes('5. न:- \n[[TABLE_REGION:'),'Inline geometry hints must become hidden layout blocks');
    const curvedFixed=Layout.reconcileEmptyGrids('5. न:-\n[[GRID: 8x1]]\n6. प:-\n[[GRID: 11x1]]',curvedGrids);
    assert.equal((curvedFixed.match(/GRID: 13x1/g)||[]).length,2);
    const interleaved='5. न:-\n[[TABLE_REGION: 119,50,769,35]]\n[[GRID: 13x1]]\n[[TABLE_REGION: 119,50,769,35]]\n[[GRID: 13x1]]\n6. प:-\n[[TABLE_REGION: 120,118,767,34]]\n[[GRID: 13x1]]\n[[TABLE_REGION: 120,118,767,34]]\n[[GRID: 13x1]]';
    const withoutDuplicates=Layout.reconcileEmptyGrids(interleaved,curvedGrids);
    assert.equal((withoutDuplicates.match(/GRID: 13x1/g)||[]).length,2,'Interleaved geometry must not duplicate each source grid');
    assert.equal((withoutDuplicates.match(/TABLE_REGION/g)||[]).length,2,'Duplicate grid regions must not leak into the next question');
    const regionOnce=Layout.reconcileEmptyGrids('[[TABLE_REGION: 10,10,200,40]]\n[[GRID: 8x1]]\n6. प:-\n[[GRID: 11x1]]',curvedGrids);
    assert.equal((regionOnce.match(/TABLE_REGION/g)||[]).length,2,'Reconciliation must replace stale model bounds instead of duplicating them');
    assert(curvedGrids.every(g=>g.h<250),'Photo curvature must not inflate a blank row to the whole bounding-box height');
    const multi={width:600,height:400,data:new Uint8Array(600*400*4).fill(255)};
    const dot=(x,y)=>{const n=(y*600+x)*4;multi.data[n]=multi.data[n+1]=multi.data[n+2]=0;};
    for(let x=50;x<=250;x+=40)for(let y=40;y<=280;y++)dot(x,y);
    for(let y=40;y<=280;y+=30)for(let x=50;x<=250;x++)dot(x,y);
    const geometry=Layout.emptyGrids(multi);
    assert.equal(geometry[0]?.columns,5,'Physical alphabet-grid columns must override expected letter counts');
    assert.equal(geometry[0]?.rows,8,'A multi-row answer grid must not become four long strips');
    assert(Layout.reconcileEmptyGrids('[[GRID: 13x4]]',geometry).includes('[[GRID: 5x8]]'));
    assert(Layout.reconcileEmptyGrids('[[GRID: 13x4]]',geometry).includes('TABLE_REGION'),'Detected answer grids must retain source size');
    for(let x=251;x<280;x++){dot(x,40);dot(x,280);}
    assert.equal(Layout.emptyGrids(multi).length,0,'An incomplete subset of a wider grid must not force an incorrect cell count');
    for(let x=63;x<78;x++)for(let y=52;y<65;y++)dot(x,y);
    assert.equal(Layout.emptyGrids(multi).length,0,'Populated cells must not be cleared by grid reconstruction');
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
