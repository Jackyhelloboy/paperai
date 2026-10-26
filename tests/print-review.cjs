const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('worker/src/print-review.js','utf8').replace(/export /g,'');
const ctx=vm.createContext({});vm.runInContext(source,ctx);
const sample='[[SECTION_ROW: I. सही उत्तर लिखो || 5×1=5]]\n1. प्रश्न (1)\n[[SOURCE_FIGURE_ROW: a || b || c || d || e || f]]\n[unclear]';
const findings=ctx.localPrintIssues(sample);
assert(!findings.some(i=>i.category==='sections'));
assert(findings.some(i=>i.category==='images'));
assert(findings.some(i=>i.category==='ocr'));
assert(ctx.localPrintIssues('[[SECTION_ROW: V. इतिहास || 2]]',true).every(i=>i.category!=='sections'));
assert(ctx.localPrintIssues('[[SECTION_ROW: V. इतिहास || 2]]').some(i=>i.category==='sections'));
const modelIssues=ctx.sanitizePrintIssues([
 {severity:'critical',category:'marks',evidence:'5×1=5',detail:'Align original marks at the right margin.'},
 {severity:'critical',category:'marks',evidence:'6×1=6',detail:'Invented.'},
 {severity:'critical',category:'other',evidence:'1. प्रश्न (1)',detail:'Check layout.'},
],sample);
assert.equal(modelIssues.length,2,'AI must cite source text and cannot add unsupported issues');
assert.equal(modelIssues[0].category,'marks');
assert.equal(modelIssues[1].category,'alignment');
const frontend=fs.readFileSync('frontend/index.html','utf8');
assert(frontend.includes('class="teach-panel simplified-hidden" id="printReviewPanel"'));
assert(!frontend.includes('id="printReviewBtn"'));
assert(frontend.includes("'/api/print-review'"));
assert(frontend.includes('Word\'s Print Preview'));
console.log('Read-only multilingual print review regression passed.');
