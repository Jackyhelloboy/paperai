// Behavioral regressions drawn from distinct layout families in training/.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Layout=require('../frontend/vendor/paper-layout.js');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ui=vm.createContext({PaperAILayout:Layout,esc:s=>String(s),formatOutputLine:s=>String(s)});
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ui);
const matching=ui.formatStructuredWorksheetLine('[[MATCH_ROW: 1. Leaf || (   ) || b. Root]]');
assert.equal((matching.match(/class="ocr-match-cell"/g)||[]).length,3);
assert(matching.indexOf('Leaf')<matching.indexOf('Root'),'Matching choices must not be solved or reordered');
assert.equal((ui.formatStructuredWorksheetLine('[[SHAPE_ROW: circle|none || square|box || triangle|line]]').match(/ocr-figure-answer/g)||[]).length,1,'A shape without an answer box must not acquire one');
assert.equal(ui.worksheetRenderTable(['big || _ || biggest']).includes('<th>'),false,'Partially filled exercises are not table headers');
const ctx=vm.createContext({...ui,Blob,JSZip:require('../frontend/node_modules/jszip'),repairLegacyBranchDiagram:s=>s,
    isOutputHeadingLine:s=>/^I\./.test(s),circledNumberValue:()=>null,circledWordNumber:String,
    document:{getElementById:id=>({paperFlow:{value:'compact'},paperFont:{value:'11'},paperPageNumbers:{checked:false}})[id]},
    fetch:async()=>{throw new Error('Export must not fetch a default banner');}});
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
const fixture=[
    'Class: V','I. Choose the correct answer. 4×½=2',
    '[[MATCH_ROW: 1. Leaf || (   ) || b. Root]]',
    '[[MATCH_ROW: 2. Stem || (   ) || a. Flower]]',
    '[[TABLE_WIDTHS: 20,50,30]]','[[TABLE_ROW: big || _ || biggest]]',
    '[[TABLE_ROW: _ || smarter || _]]',
    '[[ARITHMETIC_ROW: 34<br>+ 12<br>___ || 68<br>- 21<br>___]]',
    '[[SHAPE_ROW: circle|none || square|box || triangle|line]]',
    '[[PAGE_BREAK]]','II. Continue this paper.','1. Explain the process.',
    '[[PAPER_BREAK]]','Class: IV','1. Next paper.'
].join('\n');
(async()=>{
    const blob=await ctx.makeExtractedDocx(fixture),zip=await ctx.JSZip.loadAsync(await blob.arrayBuffer());
    const xml=await zip.file('word/document.xml').async('text');
    assert(xml.includes('4×½=2')&&xml.includes('<w:jc w:val="right"/>'),'Literal fractional marks must occupy the right column');
    assert(!xml.includes('<w:tblHeader/>'),'Exercise cells are not headings');
    assert(xml.includes('+ 12')&&xml.includes('- 21')&&!xml.includes('>46<')&&!xml.includes('>47<'),'Arithmetic must stay unsolved');
    assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,1,'Compact mode must reflow scan boundaries but retain new papers');
    assert(!xml.includes('QUESTION PAPER')&&!xml.includes('AUTO-FORMATTED'),'Unseen banners must not be invented');
    const footer=await zip.file('word/footer1.xml').async('text');
    assert(!footer.includes('PAGE NO'),'Page numbers are opt-in');
    assert(xml.includes('w:val="22"'),'Teacher-selected 11pt text must reach Word');
    for(const s of ['big','biggest','smarter','Leaf','Root','Stem','Flower'])assert(xml.includes(s));
    assert.equal(Layout.section('IV. Map pointing. 4×½=2').marks,'4×½=2');
    assert.equal(Layout.section('I. Answer. 2½ Marks').marks,'2½ Marks');
    assert(Layout.compactPages('Q1\n[[PAGE_BREAK]]\nQ2').includes('Q1\nQ2'));
    assert(Layout.compactPages('Q1\n[[PAGE_BREAK]]\nClass: III\nQ2').includes('PAGE_BREAK'));
    const suggestions=code.slice(code.indexOf('function showSmartSuggestions'),code.indexOf('function chooseSmartSuggestion'));
    assert(!suggestions.includes('autoApplySmartSuggestion('),'Suggestions must require a teacher selection');
    if(process.env.PAPERAI_QA_OUTPUT)fs.writeFileSync(process.env.PAPERAI_QA_OUTPUT,Buffer.from(await blob.arrayBuffer()));
    console.log('Question-paper model: three-column matching, unsolved arithmetic, explicit shape blanks, literal fractional marks, compact pages and teacher-controlled export pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
