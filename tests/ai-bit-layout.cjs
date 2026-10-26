const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('worker/src/layout-plan.js','utf8').replace(/export /g,'');
const ctx=vm.createContext({Set,Map});vm.runInContext(source,ctx);
const text=[
  '[[SECTION_ROW: I. Identify pictures. || 5M]]',
  '[[SOURCE_FIGURE: one|1.|none]]','[[SOURCE_FIGURE: two|2.|none]]',
  '[[SOURCE_FIGURE: three|3.|none]]','[[SOURCE_FIGURE: four|4.|none]]',
  '[[SOURCE_FIGURE: five|5.|none]]',
  '[[SECTION_ROW: II. Join the pairs. || 2M]]',
  '[[MATCH_ROW: 1. Sun || A. Day]]'
].join('\n');
const sections=ctx.layoutSections(text);
assert.equal(sections.length,2);
const raw={sections:[
  {title:sections[0].title,kind:'pictures',imageColumns:3},
  {title:sections[1].title,kind:'matching',imageColumns:5},
  {title:'III. Invent a question',kind:'pictures',imageColumns:2},
  {title:sections[0].title,kind:'answers',imageColumns:2}
]};
const plan=ctx.safeLayoutPlan(raw,sections);
assert.equal(plan.length,2,'Invented bit titles and invalid categories cannot be used');
assert.equal(plan[0].imageColumns,3);
const frontend=fs.readFileSync('frontend/index.html','utf8');
const start=frontend.indexOf('function layoutBitHeading('),end=frontend.indexOf('function blobToDataURL(',start);
const ui=vm.createContext({lastResult:{text,layoutPlan:plan,layoutPlanText:text},PaperAILayout:require('../frontend/vendor/paper-layout.js'),worksheetCells:(s)=>s.split(/\s*\|\|\s*/)});
vm.runInContext(frontend.slice(start,end),ui);
const arranged=ui.packSourceFigureRows(text,[]);
assert(arranged.includes('[[SOURCE_FIGURE_ROW: one|1.|none || two|2.|none || three|3.|none]]'));
assert(arranged.includes('[[SOURCE_FIGURE_ROW: four|4.|none || five|5.|none]]'));
assert(arranged.includes('[[MATCH_ROW: 1. Sun || A. Day]]'),'Matching question content cannot be rewritten');
assert(arranged.includes('|| 5M]]'),'Original marks remain intact');
const ids=[...arranged.matchAll(/(?:one|two|three|four|five)\|\d\./g)];assert.equal(ids.length,5);
assert(frontend.includes("'/api/layout-plan'"));
const Layout=require('../frontend/vendor/paper-layout.js');
const ambiguous='[[SECTION_ROW: V. Read and mark the statements. || 2M]]\n1. Birds can fly.\n[\n]';
assert(Layout.presentationRows(ambiguous,{"V. Read and mark the statements.":'true_false'}).includes('1. Birds can fly.  (    )'),
    'AI bit type may align a genuine answer box even when an instruction uses unfamiliar wording');
assert.equal(Layout.presentationRows(ambiguous),ambiguous,'No AI hint must not reclassify unrelated source text');
console.log('AI layout safely changes only image grid geometry and preserves source text.');
