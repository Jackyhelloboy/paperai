// Structural regression checks for preview and Word XML: no browser is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const html = fs.readFileSync('frontend/index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const inline = scripts.find(x=>x[1].includes('function formatOutput(text)'))?.[1];
assert(inline,'frontend application script missing');
new vm.Script(inline, {filename:'frontend/index.html:inline.js'});
const named = (a,b) => {
    const start=inline.indexOf(a), end=inline.indexOf(b,start+1);
    assert(start >= 0 && end > start, 'missing: '+a+' -> '+b);
    return inline.slice(start,end);
};
const uiCtx = vm.createContext({
    esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    formatOutputLine:s=>String(s)
});
vm.runInContext(named('function worksheetCells','function formatOutput(text)'),uiCtx);
const ui = source => uiCtx.formatStructuredWorksheetLine(source);
let out=ui('[[PICTURE_ROW: 1. lotus || 2. umbrella || 3. feather || 4. 5 || 5. sun]]');
assert.equal((out.match(/ocr-figure-cell/g)||[]).length,5);
assert.equal((out.match(/ocr-figure-answer/g)||[]).length,5);
out=ui('[[GRID: 5x8]]');
assert.equal((out.match(/ocr-grid-cell/g)||[]).length,40);
out=ui('[[GRID_ROW: अ || _ || इ || उ]]');
assert.equal((out.match(/ocr-grid-cell/g)||[]).length,4);
out=ui('[[OPTION_ROW: A. Flat || B. Bungalow || C. Hut]]');
assert.equal((out.match(/ocr-checkbox/g)||[]).length,3);
out=ui('[[CHOICE_ROW: A. Flat || B. Bungalow || C. Hut]]');
assert.equal((out.match(/ocr-checkbox/g)||[]).length,0);
out=ui('[[MATCH_ROW: आम || Mango]]');
assert(out.includes('आम') && out.includes('Mango'));
out=ui('[[SHAPE_ROW: square || cube || rectangle || circle]]');
assert.equal((out.match(/ocr-shape-icon/g)||[]).length,4);
out=ui('[[ANSWER_LINES: 3]]');
assert.equal((out.match(/ocr-answer-rule/g)||[]).length,3);
assert(uiCtx.worksheetRenderTable(['Work || Materials || Tools','Basket || Cane || Knife'])
    .includes('<table class="ocr-worksheet-table">'));

const wordCtx=vm.createContext({
    ...uiCtx,
    xmlEscape:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'),
    repairLegacyBranchDiagram:s=>String(s),
    isOutputHeadingLine:()=>false,
    circledNumberValue:()=>null,
    circledWordNumber:n=>String(n),
});
vm.runInContext(named('function docxVisibleText','function createWordPlaceholderPngBase64'),wordCtx);
const fixture=[
    'IX. चित्र देखकर नाम लिखो।',
    '[[PICTURE_ROW: 1. lotus || 2. umbrella || 3. feather || 4. 5 || 5. sun]]',
    'X. जोड़ी बनाओ।',
    '[[MATCH_ROW: बकरी || goat]]',
    '[[MATCH_ROW: फूल || flower]]',
    'I. वर्णमाला',
    '[[GRID: 5x8]]',
    '[[GRID_ROW: अ || _ || आ || _ || इ]]',
    '[[CHOICE_ROW: A. rice || B. fish || C. carrot]]',
    '[[OPTION_ROW: Herb || Shrub || Tree]]',
    '[[TABLE_ROW: Activity || Materials || Tools]]',
    '[[TABLE_ROW: Basket || Cane || Knife]]',
    '[[ANSWER_LINES: 2]]',
    '[[SHAPE_ROW: square || cube || rectangle || circle]]',
    '[[PAGE_BREAK]]',
    'II. Next page',
].join('\n');
const xml=wordCtx.docxDocumentXml(fixture);
assert(xml.includes('xmlns:pic=') && xml.includes('xmlns:r='));
assert(xml.includes('r:embed="rId2"'),'Word picture drawing relationship missing');
assert((xml.match(/<wp:inline /g)||[]).length >= 5,'not all picture slots exported');
assert((xml.match(/<w:tbl>/g)||[]).length >= 6,'grids/tables exported as flattened text');
assert(xml.includes('<w:tblGrid>') && xml.includes('<w:tblBorders>'));
assert(xml.includes('w:type="page"'),'Word page break missing');
for(const word of ['आम','Mango','Activity','Materials','Tools']) assert(xml.includes(word));
const validate=cp.spawnSync('python3',['-c',
    'import sys, xml.etree.ElementTree as E; E.fromstring(sys.stdin.read()); print("Word document XML valid")'
],{input:xml,encoding:'utf8'});
assert.equal(validate.status,0,validate.stderr);
console.log('Worksheet regression: inline JS parses, preview structures match, Word XML is valid with embedded images and tables.');
