// Read every audited Word/PDF. This verifies parsers/layout, not OCR character accuracy.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const JSZip=require('../frontend/node_modules/jszip');
const pdfjs=require('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.js');
const Edit=require('../frontend/vendor/pdf-editable-layout.js');
const Layout=require('../frontend/vendor/paper-layout.js');
const {DOMParser:Parser}=require('../frontend/node_modules/@xmldom/xmldom');
class DOMParser {parseFromString(...args){const d=new Parser().parseFromString(...args);d.querySelector=t=>d.getElementsByTagName(t)[0]||null;return d;}}
const html=fs.readFileSync('frontend/index.html','utf8'),a=html.indexOf('function docxStructuredXml('),b=html.indexOf('async function extractOfficeZipFile(',a);
const ctx=vm.createContext({DOMParser});vm.runInContext(html.slice(a,b),ctx);
const corpus=JSON.parse(fs.readFileSync('training/corpus-review.json','utf8')),records=[];
function inventory(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?inventory(path.join(dir,entry.name)):/\.(?:docx|pdf)$/i.test(entry.name)?[path.relative('training',path.join(dir,entry.name))]:[]);}
const files=inventory('training').sort(),known=new Map(corpus.records.map(record=>[record.file,record]));
const sources=files.map(file=>known.get(file)||{file,kind:'generated-qa',visual_review:'generated-output-baseline-not-a-training-reference'});
assert(corpus.records.every(record=>files.includes(record.file)),'An audited source file is missing');
(async()=>{
    for(const source of sources){
        const bytes=fs.readFileSync('training/'+source.file);
        const record={file:source.file,kind:source.kind,visual_review:source.visual_review};
        if(source.file.toLowerCase().endsWith('.docx')){
            const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('text');
            const parsed=ctx.docxStructuredXml(xml);assert(typeof parsed==='string');
            const doc=new DOMParser().parseFromString(xml,'application/xml');
            const raw=[...doc.getElementsByTagName('w:t')].map(t=>t.textContent).filter(t=>t.trim());
            const compact=s=>s.replace(/\s/g,'');
            const missing=raw.filter(text=>!compact(parsed).includes(compact(text)));
            record.imported_characters=parsed.length;record.visible_runs=raw.length;
            record.runs_not_contiguous=missing.length;
            record.native_tables=(parsed.match(/\[\[(?:TABLE_ROW|GRID_ROW|GRID):/g)||[]).length;
            record.illustrations_needing_asset_resolution=(parsed.match(/\[\[PICTURE:/g)||[]).length;
            // Image relationship resolution is separately checked by DOCX import/export regressions.
            record.status=missing.length?'review-required':'text-parser-pass';
        }else{
            const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,fontExtraProperties:true}).promise;
            record.pages=[];
            try {for(let i=1;i<=pdf.numPages;i++){
                const p=await pdf.getPage(i),scene=await Edit.scene(p,pdfjs);
                const reliable=Layout.pdfTextReliable(scene.texts.map(t=>t.text).join(' '));
                record.pages.push({page:i,measured_layout_supported:scene.supported&&reliable,text_layer_reliable:reliable,text_objects:scene.texts.length,pictures:scene.images.length,editable_paths:scene.shapes.filter(s=>s.kind==='path').length,shapes:scene.shapes.length});
            }}finally{await pdf.destroy();}
            record.status=source.kind==='scan-input'?'requires-live-OCR':record.pages.every(p=>p.measured_layout_supported)?'measured-parser-pass':'OCR-or-flow-fallback-required';
        }
        records.push(record);console.log(source.file+': '+record.status);
    }
    assert.equal(records.length,files.length);
    const report={scope:'Every Word and PDF in the training folder, including original audited sources, duplicates and generated QA baselines. Generated outputs are not new training references. Parser results do not certify OCR or visual accuracy.',original_audited_sources:corpus.records.length,records};
    fs.writeFileSync('training/corpus-parser-results.json',JSON.stringify(report,null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
