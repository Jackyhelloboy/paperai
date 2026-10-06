const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
// Capture the document model sent to docx without requiring browser dependencies.
class Component { constructor(options) { this.options = options; } }
let document;
const context = vm.createContext({ window: {
    docx: {
        Paragraph: Component, TextRun: Component,
        Table: Component, TableRow: Component, TableCell: Component,
        WidthType: { DXA: 'dxa' }, HeightRule: { ATLEAST: 'atLeast' },
        BorderStyle: { NONE: 'none', SINGLE: 'single' },
        VerticalAlign: { CENTER: 'center' },
        Document: class { constructor(options) { document = options; } },
        Packer: { toBlob: async () => ({}) },
        AlignmentType: { LEFT: 'left', CENTER: 'center', RIGHT: 'right' },
        PageOrientation: { PORTRAIT: 'portrait', LANDSCAPE: 'landscape' }
    },
    docxShapes: { ShapeCanvasRun: Component }
} });
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const helperStart = html.indexOf('function circledNumberValue(');
const helperEnd = html.indexOf('\nfunction ', helperStart + 1);
vm.runInContext(html.slice(helperStart, helperEnd), context);
for (const file of ['paperai-document-model.js', 'paperai-word-engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend/vendor', file), 'utf8'), context);
}
(async () => {
    const sourcePages = 'Hindi exercise\n1. गाँव × ____\n[[PAGE_BREAK]]\n2. भूख × ____\n3. पास × ____';
    const model = context.window.PaperAIDocumentModel.parse(sourcePages);
    assert(model.nodes.some(node => node.type === 'pageBreak'), 'Source boundary must remain available to analysis');
    await context.window.PaperAIWordEngine.makeDocx(sourcePages);
    const canonical = value => JSON.stringify(value).replace(/inline-circle-\d+/g, 'inline-circle');
    const paginated = canonical(document);
    await context.window.PaperAIWordEngine.makeDocx(sourcePages.replace('[[PAGE_BREAK]]\n', ''));
    assert.equal(paginated, canonical(document), 'Source boundaries must not alter exported document flow');
    assert(paginated.includes('गाँव') && paginated.includes('भूख') && paginated.includes('पास'), 'All continuation text must survive');
    assert(!paginated.includes('pageBreakBefore'), 'No forced page boundary may enter the export');
    console.log('Continuous Word flow and source-boundary preservation checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
