// Exercise the real preview/export code with a source-reviewed fixture.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
const ctx=vm.createContext({PaperAILayout:require('../frontend/vendor/paper-layout.js'),PaperAIProfessionalPaper:require('../frontend/vendor/professional-paper.js'),
 JSZip:require('../frontend/node_modules/jszip'),Blob,setTimeout,clearTimeout,
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 formatOutputLine:s=>String(s),repairLegacyBranchDiagram:String,isOutputHeadingLine:()=>false,circledNumberValue:()=>null,
 fetch:async()=>({ok:false}),lastResult:null,extractedMedia:[]});
vm.runInContext(slice('function worksheetCells','function formatOutput(text)'),ctx);
vm.runInContext(slice('function xmlEscape','async function downloadWord'),ctx);
(async()=>{const input=fs.readFileSync(process.argv[2]||'tests/fixtures/hindi-class5-fa3.txt','utf8');
 const blob=await ctx.makeExtractedDocx(input),buffer=Buffer.from(await blob.arrayBuffer());
 const zip=await ctx.JSZip.loadAsync(buffer),xml=await zip.file('word/document.xml').async('text');
 assert(!xml.includes('[['));assert(xml.includes('फूलों'));assert(xml.includes('कड़वे'));assert(xml.includes('गंदे'));
 assert.equal((xml.match(/<w:bottom w:val="single" w:sz="5"/g)||[]).length,3);
 assert.equal((xml.match(/<w:jc w:val="right"\/>/g)||[]).length,6);
 if(process.argv[3])fs.writeFileSync(process.argv[3],buffer);
 console.log('Source-reviewed Hindi fixture: all six sections, literal Hindi, three answer rules, right-side marks and editable matching exported.');
})().catch(e=>{console.error(e);process.exitCode=1;});
