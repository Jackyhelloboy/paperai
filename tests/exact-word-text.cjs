// Export the current editor contents, including repeated Hindi words, while
// retaining the native table/crop geometry. Inspect the actual Word ZIP.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Text=require('../frontend/vendor/paper-text.js'),Layout=require('../frontend/vendor/paper-layout.js');
const JSZip=require('../frontend/node_modules/jszip'),{DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const layout='[[SOURCE_PAGE: 2]]\n[[TABLE_REGION: 100,200,500,80]]\n[[TABLE_WIDTHS: 50,50]]\n[[TABLE_ROW: अदरक || अदरक]]\n[[QUESTION_ROW: १. किसे गाड़ी और लड़की चाहिए? || 2M]]\n[[GRID: 13x1]]';
const original='अदरक | अदरक\n१. किसे गाड़ी और लड़की चाहिए?    2M\n□ □ □ □ □ □ □ □ □ □ □ □ □';
const edited=original.replace('अदरक | अदरक','अदरक | अदरक़').replace('लड़की','लड़के');
const expected=layout.replace('अदरक || अदरक','अदरक || अदरक़').replace('लड़की','लड़के');
assert.equal(Text.applyEdits(layout,original,edited),expected,'The second repeated word must change in its own cell');
assert.equal(Text.applyEdits('[[TABLE_ROW: घर || घर]]','घर | घर','घर | मेरा घर'),'[[TABLE_ROW: घर || मेरा घर]]','Inserted words belong in the selected cell');
assert.equal(Text.applyEdits('[[TABLE_ROW: बड़ा घर || छोटा घर]]','बड़ा घर | छोटा घर','घर | छोटा घर'),'[[TABLE_ROW:  घर || छोटा घर]]','Deleted words must not change another matching cell');
assert.equal(Text.applyEdits('१. सही है?','१. सही है?','१. सही है।'),'१. सही है।','Punctuation must reach Word');
assert.equal(Text.applyEdits('[[SOURCE_FIGURE: घर|घर|none]]\nघर','घर\nघर','घर\nमकान'),'[[SOURCE_FIGURE: घर|घर|none]]\nमकान','A visible word must not rename the image ID');
assert.equal(Text.applyEdits('[[TABLE_ROW: किताब<br>किताब || _]]','किताब\nकिताब | _','किताब\nकिताबें | _'),'[[TABLE_ROW: किताब<br>किताबें || _]]','Multiline cells retain native line breaks');
const nodes={teachPanel:{classList:{contains:()=>true}},teachEditor:{value:edited},textOut:{},button:{innerHTML:'Download Word'}};
let downloaded;
const ctx=vm.createContext({PaperAIText:Text,PaperAILayout:Layout,JSZip,Blob,
    worksheetCells:(s,n=32)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
    worksheetGridSize:s=>{const m=s.match(/^(\d+)x(\d+)$/);return m?{columns:+m[1],rows:+m[2]}:null;},
    repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:()=>false,circledNumberValue:()=>null,
    fetch:async()=>({ok:false}),setTimeout,clearTimeout,showingRaw:false,
    lastResult:{text:layout,plain_text:original,preview_layout_text:layout,preview_text:'stale'},
    teachOriginalText:original,teachOriginalLayoutText:layout,...nodes,
    formatOutput:s=>s,file:{name:'Hindi-paper.pdf'},showErr:message=>{throw Error(message);},
    dlBlob:(blob,name)=>{downloaded={blob,name};}
});
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
vm.runInContext(slice('function applyTeachWordCorrectionsToLayout','const TEACH_LANGUAGE_META'),ctx);
vm.runInContext(slice('function renderTeachPreview','function updateTeachButtons'),ctx);
vm.runInContext(slice('async function downloadWord','function copyText'),ctx);
ctx.$=()=>({value:'source'});
(async()=>{
    await ctx.downloadWord(nodes.button);
    assert(downloaded,'Download must finish without a manual layout panel');
    const zip=await JSZip.loadAsync(await downloaded.blob.arrayBuffer()),xml=await zip.file('word/document.xml').async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const visible=Array.from(doc.getElementsByTagName('w:t')).map(node=>node.textContent).join(' ');
    assert(visible.includes('अदरक अदरक़'),'Word exported a stale/incorrect repeated Hindi word');
    assert(visible.includes('गाड़ी और लड़के चाहिए?'),'Hindi matras/nukta or the selected correction changed on export');
    assert(!visible.includes('लड़की')&&!visible.includes('stale'));
    assert(xml.includes('<w:jc w:val="right"/>'),'Marks must remain on the right');
    assert(xml.includes('w:ascii="Tahoma"')&&xml.includes('w:bidi="hi-IN"'),'Standard Tahoma must retain the Hindi language tag');
    assert.equal(doc.getElementsByTagName('w:tc').length,17,'Native table and blank answer-grid cells were lost');
    assert(!xml.includes('[[')&&!xml.includes('<w:strike')&&!/<w:ins(?:\s|>)/.test(xml));
    assert.equal(ctx.lastResult.preview_layout_text,expected,'Downloading must rebuild the current editor preview');
    vm.runInContext("activeDocxEditingMode='source'",ctx);
    const english='Class: I\nSubject: English\nAnswer the following questions: I. Answer the following questions: 10x4=40 M.\n1. Where does Manu live?\nII. Unscramble these words. 4x1=4M.';
    const englishZip=await JSZip.loadAsync(await (await ctx.makeExtractedDocx(english)).arrayBuffer());
    const englishXml=await englishZip.file('word/document.xml').async('text');
    const englishDoc=new DOMParser().parseFromString(englishXml,'application/xml');
    const sectionTables=Array.from(englishDoc.getElementsByTagName('w:tbl')).filter(table=>
        table.textContent.includes('Answer the following questions')||table.textContent.includes('Unscramble these words'));
    assert.equal(sectionTables.length,2,'Both English bits need section tables');
    for(const table of sectionTables){
        const cells=table.getElementsByTagName('w:tc');
        assert.equal(cells.length,2,'Instruction and mark belong in separate cells');
        assert(cells[1].getElementsByTagName('w:jc')[0]?.getAttribute('w:val')==='right');
    }
    assert.equal((englishXml.match(/Answer the following questions/g)||[]).length,1,'Do not repeat the bit instruction');
    for(const [word,font] of [['தமிழ்','Noto Sans Tamil'],['ಕನ್ನಡ','Noto Sans Kannada'],['മലയാളം','Noto Sans Malayalam'],['বাংলা','Noto Sans Bengali'],['ગુજરાતી','Noto Sans Gujarati'],['ਪੰਜਾਬੀ','Noto Sans Gurmukhi'],['ଓଡ଼ିଆ','Noto Sans Oriya'],['اردو','Noto Naskh Arabic']])
        assert(ctx.docxRun('English '+word).includes('w:ascii="Tahoma"')&&ctx.docxRun('English '+word).includes(word),'Standard font must retain native script text for '+word);
    assert(ctx.docxParagraph('اردو سوال').includes('<w:bidi/>'),'Urdu paragraphs need right-to-left direction');
    if(process.env.PAPERAI_LAYOUT_QA_OUTPUT)fs.writeFileSync(process.env.PAPERAI_LAYOUT_QA_OUTPUT,Buffer.from(await (await ctx.makeExtractedDocx(english)).arrayBuffer()));
    if(process.env.PAPERAI_TEXT_QA_OUTPUT)fs.writeFileSync(process.env.PAPERAI_TEXT_QA_OUTPUT,Buffer.from(await downloaded.blob.arrayBuffer()));
    console.log('Exact Word text: current editor snapshot, repeated Hindi cells, matras/nukta, phrase insertion/deletion, punctuation, protected image IDs and native right-aligned marks pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
