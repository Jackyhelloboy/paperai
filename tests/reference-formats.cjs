// Exercise the production formatter with measured reference families and teacher edits.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Layout=require('../frontend/vendor/paper-layout.js'),JSZip=require('../frontend/node_modules/jszip');
const {DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const fields={};for(const id of ['paperFamily','paperHeadingFamily','paperFont','paperHeading','paperLine','paperAfter','paperIndent','paperGridHeight','paperFlow'])fields[id]={value:''};
const ctx=vm.createContext({PaperAILayout:Layout,JSZip,Blob,document:{getElementById:id=>fields[id]},$:id=>fields[id],
    worksheetCells:(s,n=32)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
    worksheetGridSize:s=>{const m=s.match(/^(\d+)x(\d+)$/);return m?{columns:+m[1],rows:+m[2]}:null;},
    repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:s=>/^(?:I|II|III|IV)[. ]/.test(s),circledNumberValue:()=>null,
    refreshPaperLayout:()=>{},openPaperLayout:()=>{},hideErr:()=>{ctx.error=null;},showErr:message=>{ctx.error=message;},fetch:async()=>({ok:false}),setTimeout,clearTimeout});
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
ctx.refreshPaperLayout=()=>{};ctx.openPaperLayout=()=>{};
const fixtures={
    science:'I. Answer Any Ten of the Following. (10 x 4 = 40)\n1) Name two things we can see in the sky at night.\n2) What kind of clothes do we wear in the summer season?\nII. Give two examples for each of the following. (5x2=10)\n1) Cereals ______________________           ______________________\n[[TABLE_WIDTHS: 20,50,30]]\n[[TABLE_ROW: Basket making || 1. Leaves<br>2. Bamboo || Knife]]',
    humanities:'I. Answer the questions. 4×½=2\n1. Read the [[UNDERLINE: passage]] and answer the questions.\n[[TABLE_WIDTHS: 15,45,40]]\n[[MATCH_ROW: 1. Leaf || (   ) || b. Root]]\n[[MATCH_ROW: 2. Stem || (   ) || a. Flower]]\nII. Rewrite the words. 2M\n1. [[DOUBLE-UNDERLINE: word]] [[STRIKE: old]] [[INSERT: new]] [[BOXED: cue]]',
    worksheet:'I. Write the answers. 5M\n1. Name the shapes.\n[[SHAPE_ROW: circle|none || square|box || triangle|line]]\n[[GRID: 10x5]]\n[[TABLE_WIDTHS: 10,60,30]]\n[[TABLE_ROW: 1. || Name || ______]]\n[[TABLE_ROW: 2. || Class || ______]]'
};
(async()=>{
    for(const [name,text] of Object.entries(fixtures)){
        fields.paperFlow.value='compact';fields.paperGridHeight.value='.8';ctx.applyPaperFormat(name);
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
            assert(xml.includes('w:val="double"')&&xml.includes('<w:strike/>')&&xml.includes('<w:bdr'));
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
    console.log('Reference formats: measured fonts, body and heading sizes, spacing, question indents, right marks, native emphasis, unsolved matching, editable grid height and table edits pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
