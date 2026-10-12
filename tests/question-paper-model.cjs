// Behavioral regressions drawn from distinct layout families in training/.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Layout=require('../frontend/vendor/paper-layout.js');
const guardCtx=vm.createContext({});
vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),guardCtx);
const worker=fs.readFileSync('worker/src/index.js','utf8');
vm.runInContext(worker.slice(worker.indexOf('function shouldAcceptVerifiedText('),worker.indexOf('function mergeAiUsage(')),guardCtx);
assert(guardCtx.degenerateOcr('5. न :- '+ '_'.repeat(97500)),'Model answer-line loops must be rejected');
assert(!guardCtx.degenerateOcr('1. Write the answer. _________'));
assert(guardCtx.shouldAcceptVerifiedText('5. न :- '+'_'.repeat(97500),'IV. शब्द बनाकर लिखो।\n1. अ - ______\n2. फ - ______'));
assert(!guardCtx.shouldAcceptVerifiedText('5. न :- '+'_'.repeat(97500),'No text detected'));
assert(!guardCtx.shouldAcceptVerifiedText('I. A real question.','_'.repeat(1000)));
assert(!guardCtx.invalidLayoutMarkers('[[TABLE_REGION: 100,200,450,100]]\n[[TABLE_ROW: Fruit || Name]]\n[[TABLE_ROW:  ||  ]]'),'Measured table geometry is a supported layout annotation');
assert(guardCtx.invalidLayoutMarkers('[[TABLE_REGION: 900,200,450,100]]'),'Off-page table bounds must be rejected');
assert(guardCtx.invalidLayoutMarkers('[[FIGURE: 100,900,100,200| |none]]'));
assert(guardCtx.invalidLayoutMarkers('[[FIGURE: .1,.2,.3,.4| |none]]'));
assert(!guardCtx.invalidLayoutMarkers('[[FIGURE_ROW: 100,200,300,100| |none || 450,200,300,100| |box]]'));
assert(guardCtx.invalidLayoutMarkers('1. क + क = [[कक]] = ______'),'Unknown annotation syntax must not leak into a question paper');
assert(guardCtx.invalidLayoutMarkers('[[TABLE_ROW: [[FIGURE_ROW: 100,200,100,100| |none]] || _]]'));
assert(guardCtx.invalidLayoutMarkers('[[QUESTION_ROW: 2. The numeral for Eight is ( )]]'));
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ui=vm.createContext({PaperAILayout:Layout,esc:s=>String(s),formatOutputLine:s=>String(s)});
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ui);
const cropInputs={};for(const key of ['x','y','w','h'])cropInputs['crop-2-'+key]={value:0};cropInputs['crop-frame-2']={style:{}};
ui.$=id=>cropInputs[id];
vm.runInContext(slice('function paperCropEditor','function openPaperLayout'),ui);
const cropEvent=(x,y)=>({button:0,pointerId:7,clientX:x,clientY:y,preventDefault(){},currentTarget:{getBoundingClientRect:()=>({left:20,top:30,width:400,height:600}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}}});
ui.beginPaperCrop(2,cropEvent(60,150));ui.movePaperCrop(2,cropEvent(180,390));ui.endPaperCrop(cropEvent(180,390));
assert.equal(cropInputs['crop-2-x'].value,100);assert.equal(cropInputs['crop-2-y'].value,200);
assert.equal(cropInputs['crop-2-w'].value,300);assert.equal(cropInputs['crop-2-h'].value,400);
assert.equal(cropInputs['crop-frame-2'].style.width,'30%');
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
    await assert.rejects(()=>ctx.makeExtractedDocx('1. क + क = [[कक]]'),/layout annotation needs review/);
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
    assert(Layout.pdfTextReliable('I. Match the following. 2M'));
    assert(Layout.pdfTextReliable('प्रश्न लिखो।'));
    assert(!Layout.pdfTextReliable('वणŊमाला िलखो।'),'Broken Indic text maps require OCR');
    assert(!Layout.pdfTextReliable('Subject: Telugu \uF03E\uF044'),'Legacy glyph codes require OCR');
    assert(Layout.compactPages('Q1\n[[PAGE_BREAK]]\nQ2').includes('Q1\nQ2'));
    assert(Layout.compactPages('Q1\n[[PAGE_BREAK]]\nClass: III\nQ2').includes('PAGE_BREAK'));
    const recovered=Layout.reconcileEmptyGrids('5. न :- [[GRID: 13x1]]\n6. प :- [[GRID: 11x1]]\nIV. Next section',[{columns:13,rows:1},{columns:13,rows:1}]);
    assert.equal((recovered.match(/\[\[GRID: 13x1\]\]/g)||[]).length,2,'Continuation grids before a section heading must retain all observed cells');
    assert(!recovered.includes('न :- [[GRID:'),'An inline grid must become a native block below its label');
    assert(Layout.normalise('VIII हिन्दी शब्द से अंग्रेजी शब्द जोड़ो। 6x1=6M\n1. नयन | Ginger').includes('[[MATCH_ROW: 1. नयन || Ginger]]'),'Visible matching columns must remain unsolved native cells');
    assert.equal(Layout.normalise('[[QUESTION_ROW: 2. The numeral for Eight is ( )]]'),'2. The numeral for Eight is ( )');
    assert.equal(Layout.normalise('[[TABLE_ROW: [[SOURCE_FIGURE_ROW: source-1|1.|box || source-2|2.|box]] || _ || _]]'),'[[SOURCE_FIGURE_ROW: source-1|1.|box || source-2|2.|box]]');
    assert.equal(Layout.normalise('[[GRID_ROW: अ || आ]]\n[[GRID_ROW: _ || _]]'),'[[GRID_ROW: अ || आ]]\n[[GRID_ROW: _ || _]]','Consecutive grid rows must stay contiguous');
    const suggestions=code.slice(code.indexOf('function showSmartSuggestions'),code.indexOf('function chooseSmartSuggestion'));
    assert(!suggestions.includes('autoApplySmartSuggestion('),'Suggestions must require a teacher selection');
    if(process.env.PAPERAI_QA_OUTPUT)fs.writeFileSync(process.env.PAPERAI_QA_OUTPUT,Buffer.from(await blob.arrayBuffer()));
    console.log('Question-paper model: three-column matching, unsolved arithmetic, explicit shape blanks, literal fractional marks, compact pages and teacher-controlled export pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
