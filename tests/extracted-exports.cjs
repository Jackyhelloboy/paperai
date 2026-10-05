const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const JSZip = require('jszip');
const sax = require('sax');
const html = fs.readFileSync('frontend/index.html','utf8');
const source = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const saved=[];
let teaching=false;
const ctx=vm.createContext({Blob,window:{docx:require('docx'),docxShapes:{ShapeCanvasRun:class{}}},
  lastResult:null,showingRaw:false,file:{name:'Hindi worksheet.jpeg'},
  teachPanel:{classList:{contains:()=>teaching}},
  applyLayoutOverridesToStructuredText:s=>s,dlBlob:(blob,name)=>saved.push({blob,name}),showErr:message=>{throw new Error(message);}});
for(const file of ['paperai-document-model.js','paperai-word-engine.js'])
  vm.runInContext(fs.readFileSync('frontend/vendor/'+file,'utf8'),ctx);
function load(name){
  const start=source.indexOf('function '+name+'(');
  assert(start>=0,name);
  const tail=source.slice(start);
  const end=tail.slice(1).search(/\n(?:async )?function /);
  vm.runInContext(end<0?tail:tail.slice(0,end+1),ctx);
}
for(const name of ['circledNumberValue','collapsePortableAnswerBlankContinuations','portableText',
  'publicPlainTextFromStructured','currentStructuredWordText','currentPlainText','extractedWordFilename','downloadText']) load(name);
const worksheet='1. बाहर X\n2. कड़वे X\n3. विश्वास X\n4. गंदे X\n' +
  'V. सही शब्दों से खाली स्थान भरिए। 4X1 = 4M\n1. साँप बच्चे की ______ की तरफ बढ़ने लगा। (चारपाई / मेज)\n' +
  '2. नारायण नाम का एक ______ था। (ब्राह्मण / किसान)\n' +
  'VI. सही जोड़ी बनाइये। 6M\n[[COLUMNS_START]]\n'+
  '[[COLUMN_ROW: 1. फूल || (a) Dust]]\n[[COLUMN_ROW: 2. गंदा || (b) Cuckoo]]\n'+
  '[[COLUMN_ROW: 3. धूल || (c) Colour]]\n[[COLUMN_ROW: 4. कोयल || (d) Crow]]\n'+
  '[[COLUMN_ROW: 5. रंग || (e) Flower]]\n[[COLUMN_ROW: 6. कौआ || (f) Dirty]]\n[[COLUMNS_END]]';
(async()=>{
  ctx.lastResult={text:worksheet,plain_text:'STALE DIFFERENT TEXT'};
  const plain=ctx.currentPlainText();
  assert(!plain.includes('[['));assert(!plain.includes('STALE'));
  assert(plain.includes('नारायण') && plain.includes('______'));
  assert(plain.includes('2. गंदा    (b) Cuckoo'),'Matching columns stay adjacent and unsolved');
  ctx.showingRaw=true;ctx.downloadText();ctx.showingRaw=false;
  assert.equal(saved[0].name,'Hindi-worksheet-extracted.txt');
  assert.equal(saved[0].blob.type,'text/plain;charset=utf-8');
  assert.equal(await saved[0].blob.text(),plain);
  const docx=await ctx.window.PaperAIWordEngine.makeDocx(ctx.currentStructuredWordText());
  const zip=await JSZip.loadAsync(await docx.arrayBuffer());
  const xml=await zip.file('word/document.xml').async('string');
  const parser=sax.parser(true);let inText=false,word='';
  parser.onopentag=node=>{if(node.name==='w:t')inText=true;};
  parser.onclosetag=name=>{if(name==='w:t')inText=false;};
  parser.ontext=text=>{if(inText)word+=text;};
  parser.write(xml).close();
  assert.equal(word.replace(/\s/g,''),plain.replace(/\s/g,''),'Word and TXT preserve identical characters in source order');
  teaching=true;ctx.lastResult.preview_layout_text=worksheet.replace('नारायण','नारायणजी');
  assert(ctx.currentPlainText().includes('नारायणजी'));
  assert(ctx.currentStructuredWordText().includes('नारायणजी'));
  ctx.showingRaw=false;ctx.downloadText();assert.equal(saved.length,1);
  assert(!html.includes('AI Auto Detection') && !html.includes('layoutReview'));
  console.log('TXT is UTF-8, matches corrected Extracted text, and preserves the same characters as actual Word export.');
})().catch(error=>{console.error(error);process.exitCode=1;});
