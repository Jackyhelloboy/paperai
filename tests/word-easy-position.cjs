const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const JSZip=require('../frontend/node_modules/jszip');
const Layout=require('../frontend/vendor/paper-layout.js');
const {DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const html=fs.readFileSync('frontend/index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const a=inline.indexOf('function xmlEscape('),b=inline.indexOf('async function downloadWord(',a);
const context=vm.createContext({PaperAILayout:Layout,JSZip,Blob,fetch:async()=>({ok:false}),setTimeout,clearTimeout,
  worksheetCells:(s,n=16)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
  worksheetGridSize:s=>{const m=String(s).match(/^(\d+)x(\d+)$/);return m?{columns:+m[1],rows:+m[2]}:null;},
  repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:s=>/^[IVX]+[.)]/.test(s),circledNumberValue:()=>null});
vm.runInContext(inline.slice(a,b),context);
const png=fs.readFileSync('tests/fixtures/scanning-smoke.png').toString('base64');
vm.runInContext(`extractedMedia=[{id:'image-one',dataUrl:'data:image/png;base64,${png}',w:800,h:250},
{id:'image-two',dataUrl:'data:image/png;base64,${png}',w:800,h:250}];resolveHeaderBanner=async()=>null;`,context);
const paper=[
  'CLASS 5 | HINDI',
  '[[SECTION_ROW: I. निम्नलिखित प्रश्नों के उत्तर लिखिए। || 3×2=6M]]',
  '1. फूलों से हमें क्या मिलती है?',
  '2. Which animal is shown?',
  '[[SOURCE_FIGURE: image-one| |none]]',
  '[[SECTION_ROW: II. Identify pictures. || 2M]]',
  '[[SOURCE_FIGURE_ROW: image-one|1.|none || image-two|2.|none]]',
  '[[TABLE_ROW: Name || Marks]]',
  '[[TABLE_ROW: Meera || 5]]',
  '[[PAGE_BREAK]]',
  '3. Continue the question across pages.'
].join('\n');
context.configureAutomaticPaper(paper,true);
vm.runInContext(`lastResult={text:${JSON.stringify(paper)},layoutPlanText:${JSON.stringify(paper)},layoutPlan:[{title:'II. Identify pictures.',kind:'pictures',imageColumns:2}]}`,context);

(async()=>{
  for(const mode of ['source','easy','move']){
    vm.runInContext(`activeDocxEditingMode=${JSON.stringify(mode)}`,context);
    const blob=await context.makeExtractedDocx(paper);
    const bytes=Buffer.from(await blob.arrayBuffer());
    const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    assert.equal(doc.getElementsByTagName('parsererror').length,0,'All modes must be valid XML');
    assert(xml.includes('1. फूलों से हमें क्या मिलती है?'),'Question text must stay editable');
    assert(xml.includes('3×2=6M'),'Marks must survive every edit mode');
    assert(xml.includes('<w:gridCol w:w="5233"'),'AI layout-selected two-column picture grid must survive in Word');
    const firstQuestion=xml.split('</w:p>').find(paragraph=>paragraph.includes('1. फूलों से हमें क्या मिलती है?'));
    if(mode!=='source')assert(!firstQuestion.includes('<w:keepLines/>'),'A long Word question must be allowed to wrap across a page instead of leaving a large blank gap');
    assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,1,'Explicit page breaks preserved');
    assert(xml.includes('<wp:inline '),'Images in multi-column worksheets must remain stable');
    if(mode==='source'){
      assert(!xml.includes('<wp:anchor '),'Original-layout mode must not introduce floating pictures');
      assert(xml.includes('<w:tblLayout w:type="fixed"/>'),'Original-layout table widths are fixed');
    }else{
      assert(xml.includes('<w:tab w:val="right" w:pos="10466"/>'),'Marks need editable right tab stops');
      assert(xml.includes('<w:tblLayout w:type="autofit"/>'),'Non-grid tables should be resizable');
      if(mode==='move'){
        assert.equal((xml.match(/<wp:anchor /g)||[]).length,1,'Only standalone images become draggable');
        assert(xml.includes('<wp:wrapTopAndBottom/>'),'Draggable pictures must not pull section headings beside images');
        assert(xml.includes('locked="0"'),'Draggable image must remain unlocked');
      }else assert(!xml.includes('<wp:anchor '),'Easy mode keeps stable inline pictures');
    }
    if(process.env.PAPERAI_WORD_QA_DIR){
      const directory=process.env.PAPERAI_WORD_QA_DIR;
      fs.mkdirSync(directory,{recursive:true});
      fs.writeFileSync(path.join(directory,'paper-'+mode+'.docx'),bytes);
    }
  }
  console.log('Word editing modes: original layout, stable editable paragraphs, right-aligned marks and movable standalone pictures pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
