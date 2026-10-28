const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../frontend/vendor/paper-layout.js');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('worker/src/paper-layout-rules.js','utf8').replace(/export /g,''),ctx);
for(const normalize of [L.normalise,ctx.normaliseMarkerRows]){
 for(const [source,count] of [['I. Write alphabet letters A to Z. 5 marks',26],['II. क से ञ तक वर्णमाला लिखिए। 5',10],['III. अ से औ तक वर्णमाला लिखिए।',11]]){
  const result=normalize(source),cells=[...result.matchAll(/\[\[GRID: (\d+)x1\]\]/g)].reduce((n,m)=>n+Number(m[1]),0);
  assert.equal(cells,count);assert.equal(normalize(result),result);assert(result.includes(source.split(' 5 marks')[0]));
 }
 for(const source of ['वर्णमाला आ से ज्ञ तक लिखिए। 5','क से ञ तक वर्णमाला लिखिए।\n[[GRID: 5x2]]','Fill missing alphabet letters A to Z.','वर्णमाला लिखिए। 10 marks'])assert.equal((normalize(source).match(/\[\[GRID:/g)||[]).length,(source.match(/\[\[GRID:/g)||[]).length);
}
console.log('Alphabet writing: exact English/Hindi ranges, blank cells, existing grids, ambiguous ranges, source marks and idempotence pass.');
const html=fs.readFileSync('frontend/index.html','utf8');
const app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const word=vm.createContext({PaperAILayout:L,worksheetCells:(s,n=32)=>String(s).split(/\s*\|\|\s*/).map(s=>s.trim()).slice(0,n),worksheetGridSize:()=>null,repairLegacyBranchDiagram:s=>s,isOutputHeadingLine:()=>false,circledNumberValue:()=>null});
vm.runInContext(app.slice(app.indexOf('function worksheetGridSize'),app.indexOf('function worksheetPictureCell')),word);
vm.runInContext(app.slice(app.indexOf('function xmlEscape'),app.indexOf('async function downloadWord')),word);
const xml=word.buildDocxBody(L.normalise('I. Write alphabet letters A to Z.'));
assert.equal((xml.match(/<w:tc>/g)||[]).length,26,'Word must contain all 26 genuine visible exercise cells');
assert(xml.includes('w:tblBorders'),'Writing cells need printed borders');
