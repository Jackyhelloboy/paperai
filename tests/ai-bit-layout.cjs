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
assert.equal(sections[0].imageCount,5,'Only source figure markers are image evidence');
assert.equal(sections[1].imageCount,0,'Written matching rows are not pictures');
const small=ctx.layoutSections('[[SECTION_ROW: III. See the pictures || 3M]]\n[[SOURCE_FIGURE_ROW: bird|a|none || fish|b|none || cat|c|none]]');
assert.equal(small[0].imageCount,3);
assert.equal(small[0].maxSourceRowColumns,3);
assert.equal(ctx.safeLayoutPlan({sections:[{title:small[0].title,kind:'pictures',imageColumns:5}]},small)[0].imageColumns,3,
 'Do not allocate five narrow columns for only three images');
assert.equal(ctx.safeLayoutPlan({sections:[{title:small[0].title,kind:'matching',imageColumns:1}]},small)[0].imageColumns,3,
 'An explicit three-picture row outranks an AI single-column suggestion');
const twoByTwo=ctx.layoutSections('[[SECTION_ROW: IV. Look at the pictures || 4M]]\n'+
  '[[SOURCE_FIGURE_ROW: bird|a|none || fish|b|none]]\n'+
  '[[SOURCE_FIGURE_ROW: cat|c|none || dog|d|none]]');
assert.equal(twoByTwo[0].imageCount,4);
assert.equal(twoByTwo[0].maxSourceRowColumns,2);
assert.equal(ctx.safeLayoutPlan({sections:[{title:twoByTwo[0].title,kind:'pictures',imageColumns:4}]},twoByTwo)[0].imageColumns,2,
 'A source 2×2 grid cannot be widened by Gemini to four columns');
const independent=ctx.layoutSections('[[SECTION_ROW: V. Drawings || 3M]]\n[[SOURCE_FIGURE: a| |none]]\n[[SOURCE_FIGURE: b| |none]]\n[[SOURCE_FIGURE: c| |none]]');
assert.equal(ctx.safeLayoutPlan({sections:[{title:independent[0].title,kind:'pictures',imageColumns:1}]},independent)[0].imageColumns,2,
 'Several independent pictures cannot be stacked in one column');
const placeholders=ctx.layoutSections('[[SECTION_ROW: III. Draw the pictures || 5M]]\n1. kite pic\n2. fish pic\n3. Tap pic');
assert.equal(placeholders[0].imageCount,0);
const absent=ctx.safeLayoutPlan({sections:[{title:placeholders[0].title,kind:'pictures',imageColumns:5}]},placeholders)[0];
assert.equal(absent.kind,'other','Words requesting pictures do not prove source illustrations exist');
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
const worker=fs.readFileSync('worker/src/index.js','utf8');
assert(worker.includes('maxSourceRowColumns from explicit source rows'));
assert(worker.includes('“kite pic”')&&worker.includes('not an illustration'));
assert(worker.includes('notebook answer ruling'),'OCR verifier must avoid capturing ruled blanks as images');
const Layout=require('../frontend/vendor/paper-layout.js');
const ambiguous='[[SECTION_ROW: V. Read and mark the statements. || 2M]]\n1. Birds can fly.\n[\n]';
assert(Layout.presentationRows(ambiguous,{"V. Read and mark the statements.":'true_false'}).includes('1. Birds can fly.  (    )'),
    'AI bit type may align a genuine answer box even when an instruction uses unfamiliar wording');
assert.equal(Layout.presentationRows(ambiguous),ambiguous,'No AI hint must not reclassify unrelated source text');
console.log('AI layout safely changes only image grid geometry and preserves source text.');
