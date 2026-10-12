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
 assert.equal(L.section('1. Evaluate f(5)'),null);
 assert.equal(L.section('1. Plot (2, 3)'),null);
 assert(!W.PAPER_LAYOUT_RULES.includes('transcribe it faithfully'));
 console.log('Clean paper: final edits, omitted answer metadata, preserved question data and right marks pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
