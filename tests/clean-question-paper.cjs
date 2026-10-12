const assert=require('node:assert/strict');
const L=require('../frontend/vendor/paper-layout.js');
const fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync('worker/src/paper-layout-rules.js','utf8');
 const W=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const input='[[QUESTION_ROW: 1. [[STRIKE: wrong]] [[REPLACE: old -> [[INSERT: final]]]] [[HIGHLIGHT: wording]] || 2M]]\n[[ANSWER: 18]]\n[[MATCH_ROW: Leaf || Root]]\n[[TABLE_ROW: 12 + 6 || ______]]';
 for(const clean of [L.normalise(input),W.normaliseMarkerRows(input)]){
  assert(!/STRIKE|REPLACE|INSERT|HIGHLIGHT|ANSWER:|wrong|old|18/.test(clean));
  assert(clean.includes('final wording'));assert(clean.includes('Leaf || Root'));assert(clean.includes('12 + 6 || ______'));assert(clean.includes('|| 2M'));
 }
 for(const text of ['2 marks 1. Name a plant.','1. Name 2 marks a plant.','१. नाम लिखिए। २ अंक']){
  const row=L.normalise(text);assert(row.includes('[[QUESTION_ROW:'));assert(row.includes(' || '));
 }
 assert.equal(L.normalise('[[SECTION_ROW: I. Write. | 2M]]'),'[[SECTION_ROW: I. Write. || 2M]]');
 assert.equal(W.normaliseMarkerRows('[[QUESTION_ROW: 1. Add. | 2M]]'),'[[QUESTION_ROW: 1. Add. || 2M]]');
 assert.equal(L.cleanQuestionPaper('Answer: 18\n1. Add 12 + 6.'),'____________________\n1. Add 12 + 6.');
 assert.equal(L.section('1. Evaluate f(5)'),null);
 assert.equal(L.section('1. Plot (2, 3)'),null);
 assert.equal(L.section('1. Draw a 2m line.'),null);
 assert(!W.PAPER_LAYOUT_RULES.includes('transcribe it faithfully'));
 const reversed='[[SOURCE_PAGE: 2]]\n2. Continue.\n[[PAGE_BREAK]]\n[[SOURCE_PAGE: 1]]\nClass: II\n1. Start.';
 const ordered=L.orderPages(reversed);assert(ordered.indexOf('1. Start.')<ordered.indexOf('2. Continue.'));assert(!ordered.includes('SOURCE_PAGE'));
 const unknown='2. Continue.\n[[PAGE_BREAK]]\n[[SOURCE_PAGE: 1]]\n1. Start.';
 assert(L.orderPages(unknown).indexOf('2. Continue.')<L.orderPages(unknown).indexOf('1. Start.'),'Missing page numbers must never guess ordering');
 const headerFirst=L.orderPages('5. Continue.\n[[PAGE_BREAK]]\n[[SOURCE_BANNER: school]]\nClass: II\n[[SECTION_ROW: I. Start. || 2M]]');assert(headerFirst.startsWith('[[SOURCE_BANNER:'),'A sole real school header and section I must precede continuation pages');
 const duplicate=reversed.replace('SOURCE_PAGE: 2','SOURCE_PAGE: 1');assert(L.orderPages(duplicate).startsWith('2. Continue.'));
 const separate=reversed+'\n[[PAPER_BREAK]]\n[[SOURCE_PAGE: 1]]\nAnother paper';assert(L.orderPages(separate).endsWith('Another paper'));
 const banner='20,20,960,140';
 const fields='[[BANNER: '+banner+']]\n[[TABLE_REGION: 880,20,100,100]]\n[[TABLE_ROW: Marks || 100]]\n[[TABLE_REGION: 20,110,960,60]]\n[[TABLE_ROW: CLASS II || Name ____]]\n[[SECTION_ROW: I. Write. || 2M]]';
 const region=L.bannerRegion(banner,fields);assert.equal(region.w,858);assert.equal(region.h,88);
 assert.equal(L.bannerRegion(banner,'[[TABLE_REGION: 20,110,960,60]]\n[[TABLE_ROW: Plant || Leaf]]').h,140,'An unrelated table must never trim a source illustration');
 assert.equal(L.cleanQuestionPaper(String.raw`\_\_\_`),'___');
 const emptyRepair=L.reconcileEmptyGrids('[[GRID_ROW: [unclear] || [unclear]]]\nQuestion two\n[[GRID: 2x1]]',[{columns:2,rows:1,x:100,y:100,w:200,h:30},{columns:2,rows:1,x:100,y:200,w:200,h:30}]);assert(!emptyRepair.includes('[unclear]'));
 const g={columns:13,rows:1,x:100,y:700,w:700,h:35};
 assert.equal(L.mergeGridEvidence([[g],[{...g,columns:14}],[{...g,y:701}]]).at(0).columns,13);
 assert.equal(L.mergeGridEvidence([[g],[{...g,columns:14}]]).length,0,'Conflicting cell counts need image verification, not a guess');
 assert.equal(L.mergeGridEvidence([[g],[{...g,y:800}]]).length,2,'Separate physical rows must remain separate');
 console.log('Clean paper: final edits, omitted answer metadata, preserved question data and right marks pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
