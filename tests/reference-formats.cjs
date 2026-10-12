// Exercise the production formatter with measured reference families and teacher edits.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Layout=require('../frontend/vendor/paper-layout.js'),JSZip=require('../frontend/node_modules/jszip');
const {DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const fields={};for(const id of ['paperFamily','paperHeadingFamily','paperFont','paperHeading','paperLine','paperAfter','paperIndent','paperGridHeight','paperFlow','paperFormat','paperPageNumbers'])fields[id]={value:''};
const ctx=vm.createContext({PaperAILayout:Layout,JSZip,Blob,document:{getElementById:id=>fields[id]},$:id=>fields[id],
    worksheetCells:(s,n=32)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
    worksheetGridSize:s=>{const m=s.match(/^(\d+)x(\d+)$/);return m?{columns:+m[1],rows:+m[2]}:null;},
    repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:s=>/^(?:I|II|III|IV)[. ]/.test(s),circledNumberValue:()=>null,
    refreshPaperLayout:()=>{},openPaperLayout:()=>{},hideErr:()=>{ctx.error=null;},showErr:message=>{ctx.error=message;},fetch:async()=>({ok:false}),setTimeout,clearTimeout});
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
ctx.refreshPaperLayout=()=>{};ctx.openPaperLayout=()=>{};
const fixtures={
    science:'Subject: Science\nI. Answer Any Ten of the Following. (10 x 4 = 40)\n1) Name two things we can see in the sky at night.\n2) What kind of clothes do we wear in the summer season?\nII. Give two examples for each of the following. (5x2=10)\n1) Cereals ______________________           ______________________\n[[TABLE_WIDTHS: 20,50,30]]\n[[TABLE_ROW: Basket making || 1. Leaves<br>2. Bamboo || Knife]]',
    humanities:'Subject: English\nI. Answer the questions. 4×½=2\n1. Read the [[UNDERLINE: passage]] and answer the questions.\n[[TABLE_WIDTHS: 15,45,40]]\n[[MATCH_ROW: 1. Leaf || (   ) || b. Root]]\n[[MATCH_ROW: 2. Stem || (   ) || a. Flower]]\nII. Rewrite the words. 2M\n1. [[DOUBLE-UNDERLINE: word]] [[STRIKE: old]] [[INSERT: new]] [[BOXED: cue]]',
    worksheet:'Science Worksheet\nI. Write the answers. 5M\n1. Name the shapes.\n[[SHAPE_ROW: circle|none || square|box || triangle|line]]\n[[GRID: 10x5]]\n[[TABLE_WIDTHS: 10,60,30]]\n[[TABLE_ROW: 1. || Name || ______]]\n[[TABLE_ROW: 2. || Class || ______]]'
};
(async()=>{
    for(const [name,text] of Object.entries(fixtures)){
        fields.paperFlow.value='compact';fields.paperGridHeight.value='.8';ctx.configureAutomaticPaper(text);
        assert.equal(fields.paperFormat.value,name,'The source header must select its reference format automatically');
        const preset=Layout.referenceFormats[name],blob=await ctx.makeExtractedDocx(text),zip=await JSZip.loadAsync(await blob.arrayBuffer());
        const xml=await zip.file('word/document.xml').async('text'),doc=new DOMParser().parseFromString(xml,'application/xml');
        assert.equal(doc.getElementsByTagName('parsererror').length,0);
        assert(xml.includes('w:ascii="'+preset.font+'"'),'Selected reference font did not reach Word');
        assert(xml.includes('w:sz w:val="'+preset.body*2+'"'),'Reference body size changed');
        assert(xml.includes('w:sz w:val="'+preset.heading*2+'"'),'Reference heading size changed');
        const headingRun=Array.from(doc.getElementsByTagName('w:r')).find(r=>r.textContent.startsWith('I.'));
        assert.equal(headingRun.getElementsByTagName('w:rFonts')[0].getAttribute('w:ascii'),preset.headingFont,'The distinct reference heading font was lost');
        assert(xml.includes('w:line="'+Math.round(preset.line*240)+'"'),'Reference line spacing changed');
        assert(xml.includes('<w:jc w:val="right"/>'),'Marks must stay right aligned');
        assert(!xml.includes('[[')&&!xml.includes('suggestion')&&!xml.includes('AUTO-FORMATTED'),'Annotations or extra commentary reached the paper');
        const defaults=await zip.file('word/styles.xml').async('text');assert(defaults.includes('w:ascii="'+preset.font+'"'));
        if(name==='science')assert(xml.includes('w:left="360" w:hanging="240"'),'Measured question indentation was lost');
        if(name==='humanities'){
            const run=Array.from(doc.getElementsByTagName('w:r')).find(r=>r.textContent==='passage');
            assert.equal(run.getElementsByTagName('w:u')[0].getAttribute('w:val'),'single','Underlined question cues were lost');
            assert(xml.includes('w:val="double"')&&!xml.includes('<w:strike/>')&&xml.includes('<w:bdr'));
            assert(xml.indexOf('Leaf')<xml.indexOf('Root')&&xml.indexOf('Stem')<xml.indexOf('Flower'),'Matching choices were reordered or solved');
        }
        if(name==='worksheet')assert(xml.includes('w:trHeight w:val="454"'),'Teacher grid height was ignored');
        if(process.env.PAPERAI_FORMAT_OUT){fs.mkdirSync(process.env.PAPERAI_FORMAT_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.PAPERAI_FORMAT_OUT,'Format-'+name+'.docx'),Buffer.from(await blob.arrayBuffer()));}
    }
    vm.runInContext(slice('function updatePaperWidths','function paperCropEditor'),ctx);
    ctx.lastResult={text:'[[TABLE_WIDTHS: 15,85]]\n[[TABLE_HEADER: 1]]\n[[TABLE_ROW: Name || Class]]\nOther question\n[[TABLE_ROW: a || b]]'};
    ctx.paperEdited=text=>{ctx.lastResult.text=text;};
    ctx.updatePaperWidths(2,'20,80');assert.equal((ctx.lastResult.text.match(/TABLE_WIDTHS/g)||[]).length,1,'Editing a header table added stale widths');
    ctx.removePaperRow(2);assert(!ctx.lastResult.text.includes('TABLE_WIDTHS')&&!ctx.lastResult.text.includes('TABLE_HEADER'),'Removed table left layout settings on the next table');
    ctx.updatePaperWidths(1,'-10,110');assert(ctx.error.includes('positive'));assert(!ctx.lastResult.text.includes('-10'));
    ctx.updatePaperWidths(1,'20,80');assert.equal(ctx.error,null,'Correcting column widths must clear the previous validation error');
    ctx.lastResult=null;ctx.esc=String;ctx.formatOutputLine=String;ctx.parseBranchBlock=()=>null;ctx.formatSingleAnswerBlankLine=()=>null;ctx.isAnswerBlankContinuationLine=()=>false;
    vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ctx);
    vm.runInContext(slice('function formatOutput(text)','// Successful scanned pages'),ctx);
    const preview=ctx.formatOutput('I. Answer the questions. 4×½=2\n1. Read the question.');
    assert(preview.includes('class="ocr-section-marks">4×½=2'),'Plain section marks must also be on the right in the teacher preview');
    const shortMarks='II. Match the following. (5)\nSun                 Water\nRain                Light\nIII. Fill in the blanks. (5)\n1. There are ______ days in a week.';
    const shortPreview=ctx.formatOutput(shortMarks);
    assert.equal((shortPreview.match(/class="ocr-section-marks">\(5\)/g)||[]).length,2,'Bare parenthesized section marks must align right in preview');
    const shortZip=await JSZip.loadAsync(await (await ctx.makeExtractedDocx(shortMarks)).arrayBuffer());
    const shortDoc=new DOMParser().parseFromString(await shortZip.file('word/document.xml').async('text'),'application/xml');
    const markParagraphs=Array.from(shortDoc.getElementsByTagName('w:p')).filter(p=>p.textContent==='(5)');
    assert.equal(markParagraphs.length,2);
    for(const p of markParagraphs)assert.equal(p.getElementsByTagName('w:jc')[0]?.getAttribute('w:val'),'right');
    assert.equal(Layout.section('I. Evaluate f(5)'),null);
    assert.equal(Layout.section('I. Explain atomic number (6)'),null);
    vm.runInContext(slice('function isOutputHeadingLine','function formatOutputLine'),ctx);
    assert.equal(ctx.isOutputHeadingLine('5. न:-',0,0),false,'A continued scan question is not an exam title');
    assert.equal(ctx.isOutputHeadingLine('कक्षा २ हिन्दी प्रश्न पत्र',0,0),true);
    assert(Layout.normalise('[[SECTION_ROW: VIII हिन्दी शब्द से अंग्रेज़ी शब्द जोड़ि || 6x1=6M]]\n1. नयन || Ginger').includes('[[MATCH_ROW: 1. नयन || Ginger]]'),'Hindi matching pairs must not export literal column separators');
    const wrapped='[[SECTION_ROW: VIII. हिन्दी शब्द [[REPLACE: ज\n|| य]] || 6x1=6M]]';
    const wrappedPreview=ctx.formatOutput(wrapped);
    assert(wrappedPreview.includes('ocr-section-marks'),'Wrapped nested correction broke section layout');
    const wrappedZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(wrapped)).arrayBuffer());
    const wrappedXml=await wrappedZip.file('word/document.xml').async('text');
    assert(!wrappedXml.includes('[['),'A multiline correction marker reached exported Word');
    const hindi='कक्षा २ हिन्दी प्रश्न पत्र\n१. नीचे दिए गए प्रश्नों के उत्तर लिखिए। (5)\n२. गाय हमें क्या देती है? (2)\n३. अपना नाम लिखिए।';
    const hindiPreview=ctx.formatOutput(hindi);
    assert.equal((hindiPreview.match(/ocr-section-marks/g)||[]).length,2,'Plain Hindi PDF marks lost right alignment');
    const hindiZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(hindi)).arrayBuffer());
    const hindiXml=await hindiZip.file('word/document.xml').async('text');
    assert.equal((hindiXml.match(/<w:jc w:val="right"\/>/g)||[]).length,2);
    assert.equal(Layout.section('१. गणना f(5)'),null,'An operand is not a mark');
    assert.equal(Layout.section('१. परमाणु संख्या (6)'),null,'Unpunctuated numeric content is not a mark');
    const tableRegion={x:50,y:350,w:400,h:120},pictureRegion={x:550,y:370,w:140,h:100};
    assert(Layout.tablePlacement(tableRegion,pictureRegion).pictureWidth);
    assert(!Layout.tablePlacement(tableRegion,{...pictureRegion,y:600}).pictureWidth,'Unrelated picture below table was moved beside it');
    assert(Layout.tablePlacement({...tableRegion,x:500},{...pictureRegion,x:100}).pictureFirst);
    vm.runInContext('extractedMedia.push({id:"side-test",dataUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",w:178,h:251,widthTwips:1465,region:{x:550,y:370,w:140,h:100}})',ctx);
    if(process.env.PAPERAI_IMAGE_FIXTURE)vm.runInContext('extractedMedia[extractedMedia.length-1].dataUrl='+JSON.stringify('data:image/png;base64,'+fs.readFileSync(process.env.PAPERAI_IMAGE_FIXTURE).toString('base64')),ctx);
    ctx.resolveHeaderBanner=async()=>null;
    vm.runInContext(slice('function formatVisibleText','function repairLegacyBranchDiagram'),ctx);
    vm.runInContext(slice('function formatOutputLine','function formatSingleAnswerBlankLine'),ctx);
    const inlineHeading='IV नीचे दिये अक्षरों से शब्द बनाकर लिखो। [[SECTION_ROW: IV नीचे दिये अक्षरों से शब्द बनाकर लिखो। || 5x1=5M]]';
    const inlineHeadingXml=ctx.docxDocumentXml(Layout.normalise(inlineHeading));
    assert.equal((inlineHeadingXml.match(/IV नीचे दिये अक्षरों से शब्द बनाकर लिखो।/g)||[]).length,1,'Inline row metadata must not duplicate an exam heading');
    assert(inlineHeadingXml.includes('<w:jc w:val="right"/>'),'Inline heading marks must use the native right column');
    assert(!inlineHeadingXml.includes('[['),'Structured headings must never print annotation syntax');
    const nested='[[HIGHLIGHT:[[BOXED: हिन्दी शब्द से अंग्रेजी शब्द जोड़ो।]]]]';
    const nestedPreview=ctx.formatOutputLine(nested);
    assert(!nestedPreview.includes('ocr-highlight')&&nestedPreview.includes('ocr-boxed')&&!nestedPreview.includes('[['),'Nested visual edits must render in the preview without marker text');
    const nestedZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(nested)).arrayBuffer());
    const nestedXml=await nestedZip.file('word/document.xml').async('text');
    assert(!nestedXml.includes('[['),'Nested visible edits must not block Word export or leak annotation syntax');
    assert(!nestedXml.includes('<w:highlight')&&nestedXml.includes('<w:bdr'),'Nested box and highlight must stay native editable run properties');
    assert.equal((nestedXml.match(/हिन्दी शब्द से अंग्रेजी शब्द जोड़ो।/g)||[]).length,1,'Nested formatting must not duplicate the source text');
    assert.equal(Layout.unwrapEmphasis(nested),'हिन्दी शब्द से अंग्रेजी शब्द जोड़ो।');
    const groupedQuestions='[[MATCH_ROW: 1. अं - ______ || 2. इ - ______ || 3. आ - ______]]\n[[MATCH_ROW: 4. ए - ______ || 5. ऊ - ______ || 6. ओ - ______]]';
    const groupedZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx(groupedQuestions)).arrayBuffer());
    const groupedDoc=new DOMParser().parseFromString(await groupedZip.file('word/document.xml').async('text'),'application/xml');
    assert.equal(groupedDoc.getElementsByTagName('w:tc').length,6,'Short question columns must stay editable cells in two physical rows');
    const attachedXml=ctx.docxDocumentXml('3. ड :-\n[[TABLE_REGION: 100,800,700,30]]\n[[GRID: 13x1]]');
    assert(/<w:keepNext\/>[\s\S]*?3\. ड/.test(attachedXml),'Measured grid bounds must not detach the preceding question label');
    const sizedGridZip=await JSZip.loadAsync(await(await ctx.makeExtractedDocx('[[TABLE_REGION: 317,277,329,254]]\n[[GRID: 5x8]]')).arrayBuffer());
    if(process.env.PAPERAI_FORMAT_OUT)fs.writeFileSync(path.join(process.env.PAPERAI_FORMAT_OUT,'Format-measured-grid.docx'),Buffer.from(await sizedGridZip.generateAsync({type:'nodebuffer'})));
    const sizedGridXml=await sizedGridZip.file('word/document.xml').async('text');
    assert(sizedGridXml.includes('w:w="3443" w:type="dxa"'),'Source answer-grid width must not expand to the whole page');
    const side=hindi+'\n[[TABLE_REGION: 50,350,400,120]]\n[[TABLE_HEADER: 1]]\n[[TABLE_ROW: फल || नाम]]\n[[TABLE_ROW:  ||  ]]\n[[SOURCE_FIGURE: side-test| |none]]';
    const sidePreview=ctx.formatOutput(side);assert(sidePreview.includes('display:grid;grid-template-columns:'),'Side picture dropped below table in preview');
    const sideBlob=await ctx.makeExtractedDocx(side),sideZip=await JSZip.loadAsync(await sideBlob.arrayBuffer());
    const sideDoc=new DOMParser().parseFromString(await sideZip.file('word/document.xml').async('text'),'application/xml');
    const tables=Array.from(sideDoc.getElementsByTagName('w:tbl'));
    assert(tables.some(t=>t.getElementsByTagName('w:tbl').length&&t.getElementsByTagName('pic:pic').length),'Editable table and source picture must share a borderless layout row');
    assert.equal(sideDoc.getElementsByTagName('pic:pic').length,1,'Source picture duplicated');
    if(process.env.PAPERAI_FORMAT_OUT)fs.writeFileSync(path.join(process.env.PAPERAI_FORMAT_OUT,'Format-hindi-side.docx'),Buffer.from(await sideBlob.arrayBuffer()));
    console.log('Reference formats: measured fonts, body and heading sizes, spacing, question indents, right marks, native emphasis, unsolved matching, editable grid height and table edits pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
