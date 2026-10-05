const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JSZip = require('jszip');
const sax = require('sax');
const docx = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'docx') : 'docx');
const fontBytes = fs.readFileSync('frontend/vendor/fonts/PaperAIDevanagari-Regular.ttf');
let fetches = 0, failFont = false;
const ctx = vm.createContext({Blob,URL,AbortSignal,Uint8Array,console,JSZip,
  repairLegacyBranchDiagram:s=>s,
  window:{docx,docxShapes:{ShapeCanvasRun:class {}},JSZip:{loadAsync:async value=>JSZip.loadAsync(value?.arrayBuffer?new Uint8Array(await value.arrayBuffer()):value)},
    fetch:async()=>{fetches++;if(failFont)return {ok:false};return {ok:true,arrayBuffer:async()=>Uint8Array.from(fontBytes).buffer};}}});
for (const name of ['paperai-document-model.js','paperai-word-engine.js','paperai-word-fonts.js'])
  vm.runInContext(fs.readFileSync('frontend/vendor/'+name,'utf8'),ctx);
const html = fs.readFileSync('frontend/index.html','utf8');
vm.runInContext(html.slice(html.indexOf('function xmlEscape('),html.indexOf('function currentStructuredWordText(')),ctx);
const circledStart = html.indexOf('function circledNumberValue(');
vm.runInContext(html.slice(circledStart,html.indexOf('\nfunction ',circledStart+1)),ctx);
const headingStart = html.indexOf('function isOutputHeadingLine(');
vm.runInContext(html.slice(headingStart,html.indexOf('\nfunction ',headingStart+1)),ctx);
const paper = 'Hindi Word export check\n1. बाहर X\n2. कड़वे X\n3. विश्वास X\n4. गेंदे X\n' +
  'V. सही शब्दों से खाली स्थान भरिए। 4X1 = 4M\n' +
  '1. साँप बच्चे की ______ की तरफ बढ़ने लगा। (चारपाई / मेज)\n' +
  '2. नारायण नाम का एक ______ था। (ब्राह्मण / किसान)\n' +
  '3. ब्राह्मणी जल लेने के लिए ______ पर गई। (झुंड / कुएँ)\n' +
  'VI. सही जोड़ी बनाइये। 6M\n[[COLUMNS_START]]\n' +
  '[[COLUMN_ROW: 1. फूल || (a) Dust]]\n[[COLUMN_ROW: 2. धूल || (b) Colour]]\n[[COLUMNS_END]]';
async function inspect(blob, source) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (const part of Object.values(zip.files)) if(!part.dir && /\.xml$|\.rels$/.test(part.name))
    sax.parser(true,{xmlns:true}).write(await part.async('string')).close();
  const xml = await zip.file('word/document.xml').async('string');
  const table = await zip.file('word/fontTable.xml').async('string');
  const key = table.match(/w:fontKey="([^"]+)"/)[1].replace(/[{}-]/g,'').match(/../g).map(x=>parseInt(x,16)).reverse();
  const embedded = await zip.file('word/fonts/PaperAIDevanagari.odttf').async('nodebuffer');
  for (let i=0;i<32;i++) embedded[i]^=key[i%16];
  assert.deepEqual(embedded,fontBytes,'Embedded font must decode to the entire editable source font');
  for (const run of xml.match(/<w:r(?=\s|>)[^>]*>[\s\S]*?<\/w:r>/g)||[]) if (/[\u0900-\u097f]/u.test(run)) {
    assert(run.includes('w:ascii="PaperAIDevanagari"')&&run.includes('w:cs="PaperAIDevanagari"'));
    assert(run.includes('<w:cs/>')&&run.includes('w:val="hi-IN"'),'Hindi runs must carry complex-script and language settings');
  }
  assert(table.includes('w:subsetted="false"'),'Keep the full font for manual corrections');
  assert((await zip.file('word/settings.xml').async('string')).includes('<w:embedTrueTypeFonts/>'));
  assert((await zip.file('[Content_Types].xml').async('string')).includes('application/vnd.openxmlformats-officedocument.obfuscatedFont'));
  const rels = await zip.file('word/_rels/fontTable.xml.rels').async('string');
  assert(rels.includes('Target="fonts/PaperAIDevanagari.odttf"'));
  assert((await zip.file('word/_rels/document.xml.rels').async('string')).includes('/fontTable'));
  const original = await ctx.window.PaperAIWordEngine.makeDocx(source);
  const originalXml = await (await JSZip.loadAsync(await original.arrayBuffer())).file('word/document.xml').async('string');
  const text = x => [...x.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
  assert.equal(text(xml),text(originalXml),'Font repair never changes the extracted characters');
  assert(!xml.includes('<w:tbl>'),'Ordinary text and matching pairs do not become boxes');
  return zip;
}
(async()=>{
  const blob = await ctx.makeExtractedDocx(paper);
  await inspect(blob,paper);assert.equal(fetches,1);
  await ctx.makeExtractedDocx(paper);assert.equal(fetches,1,'Repeated exports reuse the font');
  const english=await ctx.makeExtractedDocx('1. English text');
  const englishZip=await JSZip.loadAsync(await english.arrayBuffer());
  assert(!englishZip.file('word/fonts/PaperAIDevanagari.odttf'),'English exports do not download or embed the Hindi font');
  const engine=ctx.window.PaperAIWordEngine;ctx.window.PaperAIWordEngine=null;
  const fallback=await ctx.makeExtractedDocx('1. हिंदी शब्द');ctx.window.PaperAIWordEngine=engine;
  const fallbackZip=await JSZip.loadAsync(await fallback.arrayBuffer());
  assert(fallbackZip.file('word/fonts/PaperAIDevanagari.odttf'),'Legacy exporter also embeds Hindi support');
  assert((await fallbackZip.file('word/document.xml').async('string')).includes('PaperAIDevanagari'));
  vm.runInContext(fs.readFileSync('frontend/vendor/paperai-word-fonts.js','utf8'),ctx);failFont=true;
  await assert.rejects(ctx.makeExtractedDocx(paper),/Hindi font could not load/,'Do not silently export unreadable Hindi when font loading fails');
  failFont=false;await inspect(await ctx.makeExtractedDocx(paper),paper);
  if(process.argv[2])fs.writeFileSync(process.argv[2],Buffer.from(await blob.arrayBuffer()));
  console.log('Word exports embed an intact editable Hindi font, preserve every character, keep matching text unboxed and recover from font-load errors.');
})().catch(error=>{console.error(error);process.exitCode=1;});
