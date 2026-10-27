const assert=require('node:assert/strict');
const fs=require('node:fs');
const Layout=require('../frontend/vendor/paper-layout.js');
const source=[
  '[[SECTION_ROW: IV. मिलान करो। || 4M]]',
  '[[MATCH_ROW: हम तितलियाँ हैं। || (   ) || we are butterflies]]',
  '[[SECTION_ROW: V. सही वाक्य पर (✓) लगाओ। || 4M]]',
  '1. हम अध्यापक हैं।','[',']',
  '2. हम बच्चे हैं।','[',']',
  '[[SECTION_ROW: VI. हिन्दी वाक्य लिखो। || 3M]]',
  '1. Who are you','A.',
  '2. I am Raman','A.',
].join('\n');
const arranged=Layout.presentationRows(source);
assert(arranged.includes('[[MATCH_ROW: हम तितलियाँ हैं। || (   ) || we are butterflies]]'),'Matching choices must remain in their source columns');
assert(arranged.includes('1. हम अध्यापक हैं।  (    )'),'An isolated checkbox should stay beside the statement');
assert(arranged.includes('2. हम बच्चे हैं।  (    )'),'Every sentence retains its own checkbox');
assert(!arranged.includes('\n[\n]'),'Do not show orphan bracket lines');
assert(arranged.includes('[[QA_ROW: 1. Who are you || A.]]'),'Translation answer label belongs on the question row');
assert(arranged.includes('[[QA_ROW: 2. I am Raman || A.]]'));
assert.equal(Layout.presentationRows('1. [\n]\n2. A.'),'1. [\n]\n2. A.','Do not reinterpret literal maths or unrelated symbols outside question sections');
assert(Layout.presentationRows('V सही वाक्य पर (✓) लगाओ।\n1. हम छात्र हैं।\n[\n]')
  .includes('1. हम छात्र हैं।  (    )'),'Unpunctuated Roman bit heading must still keep its answer square beside the question');

const html=fs.readFileSync('frontend/index.html','utf8');
assert(html.includes('class="ocr-qa-row"'),'Web preview must render side-by-side answer labels');
assert(html.includes('PaperAILayout.presentationRows(packSourceFigureRows('),'PDF preview and Word must share picture/row grouping');
assert(html.includes('const qa=line.match(/^\\[\\[QA_ROW:'),'Word exporter must retain aligned question/answer rows');
assert(html.includes('imageColumns=5')&&html.includes('Math.min(5,cells.length)'),'Explicit source rows fill their own width while independent pictures default to five columns');
console.log('Question-paper alignment: matching columns, true/false checkboxes, translation answer rows and five-picture grids pass.');
