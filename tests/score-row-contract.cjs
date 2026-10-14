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
const bareHeader='CLASS: II - HINDI || QUARTERLY EXAMINATIONS-2026 || TIME: 2h:30M || 100\nName of the Student:____________ || Roll No:______ || Invigilator Signature\n[[SECTION_ROW: I. अक्षर लिखो। || 25M]]';
const nativeHeader=Layout.normalise(bareHeader);
assert(nativeHeader.startsWith('[[TABLE_ROW: CLASS: II - HINDI ||'));
assert(nativeHeader.includes('100]]\n\n[[TABLE_ROW: Name of the Student:'),'Field rows with different physical columns must not be stretched into one mismatched table');
assert.equal(worker.normaliseMarkerRows(bareHeader),nativeHeader);
const wrappedHeader='[[TABLE_ROW: CLASS: || II - HINDI || QUARTERLY EXAMINATIONS-2026 || TIME: 2h:30M || 100]]\n[[TABLE_ROW: Name of the Student:____________ || Roll No:______ || Invigilator Signature]]\n[[SECTION_ROW: I. अक्षर लिखो। || 25M]]';
const separatedHeader=Layout.normalise(wrappedHeader);
assert(separatedHeader.includes('100]]\n\n[[TABLE_ROW: Name'),'Explicit header markers also need distinct physical tables');
assert.equal(worker.normaliseMarkerRows(wrappedHeader),separatedHeader);
const markdownHeader='| CLASS: || II - HINDI || QUARTERLY EXAMINATIONS-2026 || TIME: 2h:30M |\n|---|---|---|---|\n[[TABLE_ROW: Name of the Student: || Roll No: || 100]]\n[[TABLE_ROW: Invigilator Signature]]';
const nativeMarkdown=Layout.normalise(markdownHeader);
assert(!nativeMarkdown.includes('|---|')&&nativeMarkdown.includes('[[TABLE_ROW: CLASS: || II - HINDI'));
assert(nativeMarkdown.includes('100]]\n\n[[TABLE_ROW: Invigilator Signature]]'));
assert.equal(worker.normaliseMarkerRows(markdownHeader),nativeMarkdown);
assert.equal(Layout.normalise('4. द :-\n| | | | |\n| | | | |'),'4. द :-\n[[GRID: 4x2]]','Empty pipe borders become counted native cells');
assert(Layout.normalise('I. वर्णमाला लिखो।\n| अ | आ | इ | ई |').includes('[[GRID_ROW: अ || आ || इ || ई]]'),'A visible alphabet strip retains its literal letters in native cells');
assert.equal(Layout.normalise('|x| || |y|'),'|x| || |y|','Absolute-value bars must remain literal');
assert.equal(Layout.normalise('Use the || operator.'),'Use the || operator.');
// Synthetic malformed representations, never source-paper question content.
const htmlTableFixture='<table>\n<tr><td></td><td>Label<br/>Detail</td><td></td></tr>\n<tr><th>none</th><td>3 < 9 and 9 > 3</td><td>None of the above</td></tr>\n</table>';
const nativeHtmlTable=Layout.normalise(htmlTableFixture);
assert.equal(nativeHtmlTable,'[[TABLE_ROW: || Label<br>Detail || ]]\n[[TABLE_ROW: none || 3 < 9 and 9 > 3 || None of the above]]');
const pseudoTable='<table>\n<TABLE_ROW>Label || Group: Z || </TABLE_ROW>\n<TABLE_ROW>Other || </TABLE_ROW>\n</table>\n<TABLE_REGION: 800,20,200,100>\n<table>\n<TABLE_ROW>Total</TABLE_ROW>\n<TABLE_ROW>___</TABLE_ROW>\n</table>\n</TABLE_REGION>';
const fixedPseudo=Layout.normalise(pseudoTable);
const compactRegion='<TABLE_REGION: 1,1,500,500><table><tr><td>First</td><td>Second</td></tr></table></TABLE_REGION>';
assert.equal(Layout.normalise(compactRegion),'[[TABLE_REGION: 1,1,500,500]]\n[[TABLE_ROW: First || Second]]','A compact region wrapper must normalize in one pass');
assert(!/<\/?(?:table|table_row|table_region)/i.test(fixedPseudo));
assert(fixedPseudo.includes('[[TABLE_ROW: Label || Group: Z ||]]\n[[TABLE_ROW: Other ||]]'));
assert(fixedPseudo.includes('[[TABLE_REGION: 800,20,200,100]]\n[[TABLE_ROW: Total]]\n[[TABLE_ROW: ___]]'));
const markupBreaks='Find x<br>where x < 8 and 12 > x.\n[[ARITHMETIC_ROW: 12<BR />+ 9<br>___ || 34<br>- 7<br>___]]\n[[MATCH_ROW: First<br>line || Second<br/>line]]\nSpacing (&nbsp;&nbsp;) kept.';
const fixedBreaks=Layout.normalise(markupBreaks);
assert(fixedBreaks.startsWith('Find x\nwhere x < 8 and 12 > x.'));
assert(fixedBreaks.includes('12<br>+ 9<br>___')&&fixedBreaks.includes('First<br>line || Second<br>line'));
assert(fixedBreaks.includes('(\u00a0\u00a0)')&&!fixedBreaks.includes('&nbsp;'),'Nonbreaking spaces retain their count without printing an entity');
const literalMarkup='Keep <variable>none</variable>, x < y, y > z, and &lt;script&gt; as written.\n3. Pick neither □ nor both □.    none\n[[CHOICE_ROW: All || none || None of the above]]\n[[FIGURE: 10,20,30,40| |none]]';
assert.equal(Layout.normalise(literalMarkup),literalMarkup,'Unproven prose none, genuine options, math, unknown tags, encoded angles and valid geometry flags must remain literal');
for(const unsupported of [
 '<table><tr><td colspan="2">Merged cells are not guessed</td></tr></table>',
 '<table><tr><td>Operand a | b</td><td>Other</td></tr></table>',
 '<table><caption>Do not drop this label</caption><tr><td>Value</td></tr></table>',
 '<TABLE_REGION: 900,20,200,100>\nBounds outside the page\n</TABLE_REGION>',
 '<TABLE_ROW>First<TABLE_ROW>Nested</TABLE_ROW></TABLE_ROW>',
 '<table><TABLE_ROW>First<TABLE_ROW>Nested</TABLE_ROW></TABLE_ROW></table>',
 'Explain the literal <table><tr><td>value</td></tr></table> markup.'
])assert.equal(Layout.normalise(unsupported),unsupported,'Ambiguous table geometry or inline code must not be silently converted');
for(const fixture of [htmlTableFixture,pseudoTable,compactRegion,markupBreaks,literalMarkup]){
 const canonical=Layout.normalise(fixture);
 assert.equal(worker.normaliseMarkerRows(fixture),canonical,'Server and browser must share conservative markup normalization');
 assert.equal(Layout.normalise(canonical),canonical,'Markup normalization must be idempotent');
}
assert.equal(Layout.normalise('[[100]]'),'[[BOXED: 100]]','A numeric box must remain literal editable text rather than unsupported control syntax');
assert.equal(worker.normaliseMarkerRows('[[100]]'),Layout.normalise('[[100]]'));
assert.equal(Layout.nativePipeRows('I. A question.\nName: operand || data'),'I. A question.\nName: operand || data','Header detection must stop at question content');
assert.equal(Layout.nativePipeRows('|x| || |y|'),'|x| || |y|','Mathematical delimiters are not school header fields');
const bareQuestions='II. मात्राएँ लिखो। 6x1=6M\n1. अं - ______ || 2. इ - ______ || 3. आ - ______\n4. ए - ______ || 5. ऊ - ______ || 6. ओ - ______';
assert.equal(Layout.nativePipeRows(bareQuestions).split('\n').filter(line=>line.startsWith('[[MATCH_ROW:')).length,2,'Real bare three-column questions need native rows');
assert.equal(worker.normaliseMarkerRows(bareQuestions),Layout.nativePipeRows(bareQuestions));
assert.equal(Layout.nativePipeRows('1. Explain the || operator.'),'1. Explain the || operator.','Logical operators inside one question must remain literal');
const continuation='[[GRID: 13x1]]\n5. न :—\n[[GRID: 13x1]]\n6. प :—\n[[SECTION_ROW: IV. शब्द लिखो। || 2M]]';
const aligned=Layout.alignLeadingGridLabels(continuation,2);
assert(aligned.indexOf('5. न')<aligned.indexOf('[[GRID:')&&aligned.indexOf('6. प')<aligned.lastIndexOf('[[GRID:'),'Real em-dash labels belong above their observed grids');
assert.equal(Layout.alignLeadingGridLabels(continuation,3),continuation,'Ambiguous counts must not reassign grid labels');
const school='[[SOURCE_BANNER: school]]\n[[TABLE_REGION: 880,20,100,90]]\n[[TABLE_ROW: MARKS]]\n[[TABLE_ROW: 100]]\nCLASS: II - HINDI';
const headerTable=Layout.schoolBannerTable(school.split('\n'),0);
assert(headerTable&&headerTable.nextIndex===4&&headerTable.rows[1][0]==='100');
assert.equal(Layout.schoolBannerTable(school.replace('MARKS','Fruit').split('\n'),0),null,'Ordinary question tables must not become school headers');
const rightTable=Layout.tablePlacement({x:880,y:20,w:100,h:90});
assert(rightTable.indent>8000&&rightTable.indent+rightTable.tableWidth<=Layout.profile.contentWidth,'Measured total-marks boxes must remain at the right within narrow margins');
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
vm.runInContext(slice('function collapsePortableAnswerBlankContinuations','function formatOcrAnnotation'),ctx);
const multiline='[[TABLE_ROW: CLASS: || II - HINDI || QUARTERLY EXAMINATIONS-2026<br>TIME: 2h:30M<br>Name of the Student: _____ || 100<br>Invigilator<br>Signature]]';
for(const visible of [ctx.portableText(multiline),ctx.docxVisibleText(multiline)]){
    assert(!visible.includes('<br>')&&visible.includes('2026\nTIME:')&&visible.includes('100\nInvigilator\nSignature'),'Real multiline header cells must expose line breaks rather than HTML words');
}
vm.runInContext(slice('function publicPlainTextFromStructured','function updateResultActionsForTab'),ctx);
vm.runInContext(slice('function openTeachPanel','function closeTeachPanel'),ctx);
Object.assign(ctx,{lastResult:{text:multiline,plain_text:multiline},teachEditor:{focus:()=>{}},teachPanel:{classList:{add:()=>{}}},aiSuggestionSequence:0,
    updateTeachLanguageStatus:()=>{},showSmartSuggestions:()=>{},updateTeachButtons:()=>{},renderTeachPreview:()=>{},teachAiStatus:{},teachAiBtn:{}});
ctx.openTeachPanel();
assert(!ctx.teachEditor.value.includes('[[')&&!ctx.teachEditor.value.includes('<br>'),'Opening the editor must normalize incoming structured plain-text snapshots too');
(async()=>{
    const markupZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(htmlTableFixture)).arrayBuffer());
    const markupXml=await markupZip.file('word/document.xml').async('text');
    const markupDoc=new DOMParser().parseFromString(markupXml,'application/xml');
    assert.equal(markupDoc.getElementsByTagName('w:tr').length,2);
    assert.equal(markupDoc.getElementsByTagName('w:tc').length,6,'Empty first and last HTML cells must remain physical Word cells');
    const markupCells=Array.from(markupDoc.getElementsByTagName('w:tc'));
    assert.equal(markupCells[0].textContent,'');assert.equal(markupCells[2].textContent,'');
    assert.deepEqual(Array.from(markupCells[1].getElementsByTagName('w:p')).map(p=>p.textContent),['Label','Detail'],'An intentional cell break must become Word paragraphs');
    const markupText=Array.from(markupDoc.getElementsByTagName('w:t')).map(t=>t.textContent).join(' ');
    assert(markupText.includes('3 < 9 and 9 > 3')&&markupText.includes('none')&&markupText.includes('None of the above'));
    assert(!/<\/?(?:table|tr|td|th|br)>|&nbsp;|\[\[/.test(markupText),'Recognized table framing must not print in Word');
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
    const headerZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(nativeHeader)).arrayBuffer()),headerXml=await headerZip.file('word/document.xml').async('text');
    const headerDoc=new DOMParser().parseFromString(headerXml,'application/xml');
    assert.equal(headerDoc.getElementsByTagName('w:tbl').length,3,'Both native field tables and the heading need distinct structures');
    assert.equal(headerDoc.getElementsByTagName('w:tc').length,9);
    assert(!headerXml.includes('||'));
    const explicitZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(wrappedHeader)).arrayBuffer());
    const explicitDoc=new DOMParser().parseFromString(await explicitZip.file('word/document.xml').async('text'),'application/xml');
    assert.equal(explicitDoc.getElementsByTagName('w:tbl').length,3);
    assert.equal(explicitDoc.getElementsByTagName('w:tc').length,10,'A three-field row must not grow empty fourth/fifth columns');
    const markdownZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(markdownHeader)).arrayBuffer());
    const markdownXml=await markdownZip.file('word/document.xml').async('text');
    const markdownDoc=new DOMParser().parseFromString(markdownXml,'application/xml');
    assert.equal(markdownDoc.getElementsByTagName('w:tbl').length,3);
    assert.equal(markdownDoc.getElementsByTagName('w:tc').length,8);
    assert(!markdownXml.includes('|---|')&&!markdownXml.includes('||'),'Markdown framing must not print in Word');
    const gridLabel=ctx.buildDocxBody('[[MATCH_ROW: 4. द :- || (   ) || (   )]]\n[[TABLE_REGION: 120,650,760,35]]\n[[GRID: 13x1]]');
    const gridLabelDoc=new DOMParser().parseFromString('<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+gridLabel+'</root>','application/xml');
    const labelTable=gridLabelDoc.getElementsByTagName('w:tbl')[0];
    assert.equal(labelTable.getElementsByTagName('w:keepNext').length,3,'All cells in a question-label row must stay with the following grid');
    const ordinaryMatch=ctx.buildDocxBody('[[MATCH_ROW: शब्द || word]]\nNext question.');
    assert(!ordinaryMatch.includes('<w:keepNext/>'),'Ordinary matching rows must not pull later questions onto the same page');
    const total=Array.from(headerDoc.getElementsByTagName('w:p')).find(p=>p.textContent==='100');
    assert(total&&total.getElementsByTagName('w:jc')[0]?.getAttribute('w:val')==='right','The recognized total mark belongs on the right');
    assert(!ctx.docxVisibleText('[[MATCH_ROW: अ || इ || आ]]').includes('||'),'Three-column rows must not expose protocol separators in the editor');
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
    vm.runInContext(`extractedMedia=[{id:'school',dataUrl:'data:image/png;base64,${png}',w:800,h:100,widthTwips:9000}]; resolveHeaderBanner=async()=>null;`,ctx);
    const schoolZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(school)).arrayBuffer());
    const schoolXml=await schoolZip.file('word/document.xml').async('text');
    const schoolDoc=new DOMParser().parseFromString(schoolXml,'application/xml');
    const outer=schoolDoc.getElementsByTagName('w:tbl')[0],outerRow=Array.from(outer.childNodes).find(n=>n.nodeName==='w:tr');
    const outerCells=Array.from(outerRow.childNodes).filter(n=>n.nodeName==='w:tc');
    assert.equal(outerCells.length,2,'Banner and the real total-marks box need adjacent editable cells');
    assert(outerCells[0].getElementsByTagName('w:drawing').length&&outerCells[1].textContent.includes('MARKS100'));
    const boxedSchool='[[SOURCE_BANNER: school]]\n[[100]]\nCLASS: II - HINDI';
    const boxedZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(boxedSchool)).arrayBuffer());
    const boxedXml=await boxedZip.file('word/document.xml').async('text');
    const boxedDoc=new DOMParser().parseFromString(boxedXml,'application/xml');
    const boxedOuter=boxedDoc.getElementsByTagName('w:tbl')[0],boxedRow=Array.from(boxedOuter.childNodes).find(n=>n.nodeName==='w:tr');
    const boxedCells=Array.from(boxedRow.childNodes).filter(n=>n.nodeName==='w:tc');
    assert.equal(boxedCells.length,2);
    assert.equal(boxedCells[1].textContent,'100','A recognized numeric box following the banner belongs in its own right-side native cell');
    assert(!boxedXml.includes('[[100]]'));
    console.log('Row contract: Hindi headings/right marks, empty flags, intact options, school-banner/marks placement, three-column text and continuation grid labels pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
