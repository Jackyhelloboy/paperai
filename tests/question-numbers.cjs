const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JSZip = require('jszip');
const root = path.join(__dirname, '..');
const context = vm.createContext({ window: {
    docx: require('docx'),
    JSZip: { loadAsync: async value => JSZip.loadAsync(value?.arrayBuffer ? Buffer.from(await value.arrayBuffer()) : value) },
    docxShapes: { ShapeCanvasRun: class {} }
} });
for (const name of ['paperai-document-model.js', 'paperai-word-engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend/vendor', name), 'utf8'), context);
}
const model = context.window.PaperAIDocumentModel;
const commaPaper = '[[QUESTION_SECTION: I, प्रश्नों के उत्तर लिखिए।, 1x2=2M]]\n[[QUESTION_ITEM: 1, तीन मित्रों के क्या नाम थे?]]';
assert.equal(model.parse(commaPaper).nodes[0].label, 'I');
assert.equal(model.parse(commaPaper).nodes[1].rawNumber, '1');
assert.equal(model.parse('[[QUESTION_ITEM: 2, पहला शब्द, दूसरा शब्द]]').nodes[0].text, 'पहला शब्द, दूसरा शब्द');
const paper = 'V. सही शब्द से खाली स्थान भरिए। 3x1=3M\n' +
    '[[QUESTION_SECTION: V. | सही शब्द से खाली स्थान भरिए। | 3x1=3M]]\n' +
    '[[QUESTION_ITEM: 1. | जंगल में उन्हें ____ के सिक्के मिले थे।]]\n' +
    '[[ANSWER_RULE: ______]]\n' +
    '[[QUESTION_ITEM: 2. || ____ होटल से खाना लाने गया।]]\n' +
    '[[ANSWER_RULE: ]]\n' +
    '3. भूख × ____________________\n';
const parsed = model.parse(paper);
assert.equal(parsed.nodes.filter(n => n.type === 'sectionHeading').length, 1);
assert.equal(parsed.nodes.filter(n => n.type === 'questionLine').length, 2);
assert.equal(parsed.nodes.filter(n => n.type === 'answerRule').length, 2);
assert.equal(parsed.nodes.find(n => n.type === 'questionLine').rawNumber, '1');
assert(!model.cleanOutputText(paper).includes('QUESTION_ITEM: 1.'));
(async () => {
    const blob = await context.window.PaperAIWordEngine.makeDocx(paper);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    for (const number of ['1.', '2.', '3.']) assert(xml.includes('>' + number + '</w:t>'), 'Missing native question number: ' + number);
    assert(xml.includes('जंगल') && xml.includes('होटल') && xml.includes('भूख'));
    assert(!/\[\[(?:QUESTION_|ANSWER_RULE)/.test(xml), 'No metadata may leak into Word');
    assert(!xml.includes('<w:drawing'), 'Ordinary question numbers must be native text');
    assert(!xml.includes('w:type="page"'), 'Keep continuous page flow');
    const commaBlob = await context.window.PaperAIWordEngine.makeDocx(commaPaper);
    const commaZip = await JSZip.loadAsync(Buffer.from(await commaBlob.arrayBuffer()));
    const commaXml = await commaZip.file('word/document.xml').async('string');
    assert(commaXml.includes('>1.</w:t>') && commaXml.includes('तीन मित्रों'));
    assert(!commaXml.includes('[[QUESTION_'));
    const compactColumns = '[[COLUMN_START]][[COLUMN_ROW: 1. फूल || (a) Dust]][[COLUMN_ROW: 2. कोयल || (b) Cuckoo]][[COLUMN_END]]';
    const columnBlob = await context.window.PaperAIWordEngine.makeDocx(compactColumns);
    const columnZip = await JSZip.loadAsync(await columnBlob.arrayBuffer());
    const columnXml = await columnZip.file('word/document.xml').async('string');
    assert(columnXml.includes('<w:tbl>'), 'Compact matching rows must export as columns');
    assert(columnXml.includes('फूल') && columnXml.includes('Cuckoo'));
    assert(!columnXml.includes('[[COLUMN'), 'No column metadata may leak into Word');
    if (process.argv[2]) fs.writeFileSync(process.argv[2], Buffer.from(await blob.arrayBuffer()));
    console.log('Actual DOCX package preserves all native numbers, text, answer rules, and continuous flow.');
})().catch(error => { console.error(error); process.exitCode = 1; });
