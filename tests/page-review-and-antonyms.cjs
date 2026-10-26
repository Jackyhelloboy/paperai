const assert=require('node:assert/strict');
const fs=require('node:fs');
const L=require('../frontend/vendor/paper-layout.js');

const scanned=`[[SECTION_ROW: IV. निम्नलिखित शब्दों के विलोम शब्द लिखिए। || 4×1=4M]]
[[PAGE_BREAK]]
I.
[[MATCH_ROW: 1. बाहर || (   ) || X]]
[[MATCH_ROW: 2. कड़वे || (   ) || X]]
[[MATCH_ROW: 3. विश्वास || (   ) || X]]
[[MATCH_ROW: 4. बाँधे || (   ) || X]]
[[SECTION_ROW: V. सही जोड़ी बनाइए। || 3M]]
[[MATCH_ROW: 1. फूल || (   ) || (a) Flower]]`;
const corrected=L.repairAntonymRows(scanned);
assert(!/\nI\.\n/.test(corrected),'Orphan OCR section marker must not become another Bit I');
for(const answer of ['1. बाहर','2. कड़वे','3. विश्वास','4. बाँधे'])
  assert(corrected.includes('\n'+answer+'\n'),'Keep handwritten antonym word and exact question number: '+answer);
assert(corrected.includes('[[MATCH_ROW: 1. फूल || (   ) || (a) Flower]]'),'Do not modify genuine matching sections');
assert(corrected.includes('[[PAGE_BREAK]]'),'Preserve source page boundary');
assert.equal(L.repairAntonymRows('[[SECTION_ROW: IV. विलोम शब्द लिखिए। || 4M]]\n1. बाहर X\n2. कड़वे X'),
  '[[SECTION_ROW: IV. विलोम शब्द लिखिए। || 4M]]\n1. बाहर\n2. कड़वे',
  'Remove only stray end-of-row ticks from antonyms; keep original question labels');
for(const header of ['Opposite words','వ్యతిరేక పదాలు','எதிர்ச்சொல்']){
  const row='[[SECTION_ROW: II. '+header+' || 2M]]\n[[MATCH_ROW: 1. hot || ( ) || x]]';
  assert(L.repairAntonymRows(row).includes('\n1. hot'),'Cross-language antonym section: '+header);
}
const genuine='[[SECTION_ROW: I. Match the following || 5M]]\n[[MATCH_ROW: 1. hot || ( ) || cold]]';
assert.equal(L.repairAntonymRows(genuine),genuine,'Do not damage real matching exercises');
const html=fs.readFileSync('frontend/index.html','utf8');
for(const required of ['id="pageReviewPanel"','id="pageReviewList"','function renderAllPageReviews()','async function getSourceReviewPdf(pdfFile)','pageTexts.push(saved.text)','page_texts:documentPageTexts','renderAllPageReviews();'])
  assert(html.includes(required),'Every-page review wiring missing: '+required);
assert(html.includes('pdf.getPage(index+1)'),'Review source page with the correct one-based PDF page index');
assert(html.includes('formatOutput(useFinal?finalPages[index]:sourceText)'),'Display OCR for every corresponding source page');
const vm=require('node:vm');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const snippet=script.slice(script.indexOf('let pageReviewGeneration='),script.indexOf('function currentExportText(){'));
class Node{
  constructor(){this.children=[];this.style={};this.textContent='';this.innerHTML='';this.className='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
}
const nodes={};
const context=vm.createContext({document:{createElement:()=>new Node()},$:id=>nodes[id]||(nodes[id]=new Node()),
  formatOutput:s=>'formatted:'+s,lastResult:{text:'Page one\n[[PAGE_BREAK]]\nPage two',page_texts:['Page one','Page two']}});
vm.runInContext(snippet,context);
context.renderAllPageReviews();
assert.equal(nodes.pageReviewCount.textContent,'2 pages');
assert.equal(nodes.pageReviewList.children.length,2,'Render one review card per PDF page');
assert.equal(nodes.pageReviewList.children[1].children[1].children[1].children[1].innerHTML,'formatted:Page two');
console.log('All-page source/OCR reviews and adversarial antonym/real-matching continuation cases pass.');
