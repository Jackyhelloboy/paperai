// Check the real exporter against the containing cell, including nested boxes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const JSZip=require('../frontend/node_modules/jszip'),{DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const Layout=require('../frontend/vendor/paper-layout.js');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const ctx=vm.createContext({PaperAILayout:Layout,JSZip,Blob,
  worksheetCells:(s,n=32)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
  worksheetGridSize:()=>null,repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:()=>false,
  circledNumberValue:()=>null,fetch:async()=>({ok:false}),setTimeout,clearTimeout});
vm.runInContext(code.slice(code.indexOf('function xmlEscape'),code.indexOf('async function downloadWord')),ctx);
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
vm.runInContext(`extractedMedia=[{id:'source-1',dataUrl:'data:image/png;base64,${png}',w:300,h:100,widthTwips:1800}];resolveHeaderBanner=async()=>null;`,ctx);
const children=node=>Array.from(node.childNodes||[]).filter(n=>n.nodeType===1);
const child=(node,name)=>children(node).find(n=>n.nodeName===name);
const cellWidth=cell=>{
  const properties=child(cell,'w:tcPr'),margins=child(properties,'w:tcMar');
  return +child(properties,'w:tcW').getAttribute('w:w')-['left','right'].reduce((sum,side)=>sum+(+child(margins,'w:'+side)?.getAttribute('w:w')||0),0);
};
const containingCell=node=>{for(let p=node.parentNode;p;p=p.parentNode)if(p.nodeName==='w:tc')return p;return null;};
function check(xml,expectedShapeRatio){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  assert.equal(doc.getElementsByTagName('parsererror').length,0);
  for(const table of Array.from(doc.getElementsByTagName('w:tbl'))){
    const grid=children(child(table,'w:tblGrid')).reduce((sum,col)=>sum+(+col.getAttribute('w:w')),0);
    const parent=containingCell(table);
    assert(grid<=(parent?cellWidth(parent):10466),'Nested answer box exceeds its containing column');
  }
  for(const drawing of Array.from(doc.getElementsByTagName('w:drawing'))){
    const extent=drawing.getElementsByTagName('wp:extent')[0],parent=containingCell(drawing);
    assert(+extent.getAttribute('cx')<=(parent?cellWidth(parent):10466)*635+1,'A native shape or source picture exceeds its column');
    const geometry=drawing.getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst');
    if(drawing.getElementsByTagName('wps:wsp').length){
      const ratios=expectedShapeRatio?[expectedShapeRatio]:['rect','cube'].includes(geometry)?[1,68/51]:[1];
      assert(ratios.some(ratio=>Math.abs(+extent.getAttribute('cx')/+extent.getAttribute('cy')-ratio)<0.0001),'Fitting changed a native shape aspect ratio');
    }
  }
  return doc;
}
(async()=>{
  for(const native of [false,true]){
    ctx.configureAutomaticPaper('Worksheet',native);
    for(let count=1;count<=8;count++){
      check(ctx.docxDocumentXml('[[SHAPE_ROW: '+Array.from({length:count},()=> 'rectangle|box').join(' || ')+']]'),68/51);
      check(ctx.docxDocumentXml('[[PICTURE_ROW: '+Array.from({length:count},(_,i)=>(i+1)+'. picture').join(' || ')+']]'));
    }
    for(const count of [8,16,32])check(ctx.docxDocumentXml('[[SOURCE_FIGURE_ROW: '+Array(count).fill('source-1| |box').join(' || ')+']]'));
    check(ctx.docxDocumentXml('[[TABLE_WIDTHS: 1,49,50]]\n[[MATCH_ROW: [[SOURCE_FIGURE: source-1| |box]] || [[SHAPE_ROW: circle|none || square|none]] || blank]]'));
  }
  const fixture='Worksheet\n1. Name the shapes.\n[[SHAPE_ROW: '+Array(8).fill('rectangle|box').join(' || ')+']]\n[[SHAPE_ROW: circle|box || square|box || triangle|box || rectangle|box]]\n[[MATCH_ROW: 5. क || 5. ख || 9. ू]]';
  ctx.configureAutomaticPaper(fixture);
  const blob=await ctx.makeExtractedDocx(fixture),zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const doc=check(await zip.file('word/document.xml').async('text'));
  assert.equal(doc.getElementsByTagName('wps:wsp').length,12,'Native editable shapes must not disappear');
  const text=Array.from(doc.getElementsByTagName('w:t')).map(n=>n.textContent).join(' ');
  assert(text.includes('5. क 5. ख 9. ू'),'Irregular question numbers and isolated vowel signs must stay literal');
  if(process.env.PAPERAI_DENSE_QA_OUTPUT)fs.writeFileSync(process.env.PAPERAI_DENSE_QA_OUTPUT,Buffer.from(await blob.arrayBuffer()));
  console.log('Dense Word layout: 1–8 shapes/pictures, 32 source columns, narrow nested boxes, native geometry, aspect ratios and literal Hindi numbering pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
