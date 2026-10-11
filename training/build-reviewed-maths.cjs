// Reproduce a manually reviewed reference through PaperAI's actual Word exporter.
// No OCR API call, model training or generated replacement picture is involved.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
const input=path.join(__dirname,'gold/ukg-maths');
const manifest=JSON.parse(fs.readFileSync(path.join(input,'manifest.json'),'utf8'));
const html=fs.readFileSync(path.join(repo,'frontend/index.html'),'utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('function buildDocxBody'))[1];
const ctx=vm.createContext({PaperAILayout:require('../frontend/vendor/paper-layout.js'),JSZip:require('../frontend/node_modules/jszip'),Blob,
    worksheetCells:(s,n=52)=>String(s).split(/\s*\|\|\s*/).map(x=>x.trim()).slice(0,n),
    worksheetGridSize:s=>{const m=s.match(/^(\d+)x(\d+)$/);return m?{columns:+m[1],rows:+m[2]}:null;},
    repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:s=>/^(?:I|II|III|IV)[. ]/.test(s),circledNumberValue:()=>null,
    document:{getElementById:id=>({paperFlow:{value:'compact'},paperFont:{value:'11'},paperPageNumbers:{checked:false}})[id]}
});
vm.runInContext(code.slice(code.indexOf('function xmlEscape('),code.indexOf('async function downloadWord(')),ctx);
const assets=manifest.counting_rows.map(row=>({id:'count-row-'+row.question,
    dataUrl:'data:image/png;base64,'+fs.readFileSync(path.join(input,row.asset)).toString('base64'),
    w:row.pixel_box[2]-row.pixel_box[0],h:row.pixel_box[3]-row.pixel_box[1],widthTwips:Math.round(row.width_cm*567),align:'left'}));
vm.runInContext('extractedMedia='+JSON.stringify(assets)+';resolveHeaderBanner=async()=>null;',ctx);
(async()=>{
    const blob=await ctx.makeExtractedDocx(fs.readFileSync(path.join(input,'paper.txt'),'utf8'));
    const dest=process.argv[2]||path.join(__dirname,'out/PaperAI-UKG-Maths-Reviewed.docx');
    fs.writeFileSync(dest,Buffer.from(await blob.arrayBuffer()));
    console.log('Reviewed reference written:',dest);
})().catch(e=>{console.error(e);process.exitCode=1;});
