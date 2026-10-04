const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = vm.createContext({ window: {}, DurableObject: class {} });
const modelSource = fs.readFileSync(path.join(root, 'frontend/vendor/paperai-document-model.js'), 'utf8');
vm.runInContext(modelSource, context);
const model = context.window.PaperAIDocumentModel;
const paper = '[[QUESTION_SECTION: VI || सही जोड़ी बनाइए। || 4x1=4M]]\n' +
    '[[QUESTION_ITEM: 1 || चिड़िया]]\n[[QUESTION_ITEM: 2 || नदी]]\n' +
    '[[QUESTION_ITEM: 3 || पानी]]\n[[QUESTION_ITEM: 4 || बच्चा]]\n' +
    '[[QUESTION_ITEM: 5 || निगरानी]]';
const audit = '**AI reconstruction check:** question paper · high confidence · 52/100\n' +
    '**Paper pattern:** Class IV - A · Hindi\n' +
    '**Review:** expected 4, found 5\n';
assert.equal(model.cleanOutputText(audit + paper), paper);
assert.equal(model.cleanOutputText(audit.toUpperCase() + paper), paper);
assert.equal(model.cleanOutputText('Review: discuss the poem.\n' + paper), 'Review: discuss the poem.\n' + paper);
assert.equal(model.cleanOutputText(paper), paper);
assert.equal(model.parse(audit + paper).nodes.filter(n => n.type === 'questionLine').length, 5);
assert(!model.parse(audit + paper).source.includes('reconstruction check'));
assert.equal(model.cleanOutputText('VISIBLE ROMAN/SECTION LABEL. हिंदी'), '[unclear]. हिंदी');
assert.equal(model.cleanOutputText('Exact Visible Question Text'), '[unclear]');
assert(model.parse('1. हिंदी [[ANSWER_RULE: ]]').nodes.some(n => n.type === 'answerRule'));

const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(inline); // Parse all frontend code without starting its UI.
function loadFunction(source, name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    const next = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, next < 0 ? undefined : next), context);
}
for (const name of ['circledNumberValue', 'collapsePortableAnswerBlankContinuations', 'portableText', 'normalizeQuestionMetadataForLegacy']) loadFunction(inline, name);
assert(!context.portableText(audit + paper).includes('Paper pattern'));
assert(context.portableText(audit + paper).includes('5. निगरानी'));
assert(!context.normalizeQuestionMetadataForLegacy(audit + paper).includes('Review:'));

const worker = fs.readFileSync(path.join(root, 'worker/src/index.js'), 'utf8');
vm.runInContext(worker.slice(worker.indexOf('    function normalizeQuestionMetadata('), worker.indexOf('const FORBIDDEN_OCR_TEMPLATE_PHRASES')), context);
loadFunction(worker, 'stripQuestionPaperMetadata');
new vm.Script(worker.replace(/^import .*;\s*$/gm, '').replace(/export default /g, 'const workerDefault = ').replace(/export class /g, 'class '));
const start = worker.indexOf('const FORBIDDEN_OCR_TEMPLATE_PHRASES');
const end = worker.indexOf('function structuredPageNeedsVerification', start);
vm.runInContext(worker.slice(start, end), context);
assert.equal(context.sanitizePromptTemplateLeakage('VISIBLE ROMAN/SECTION LABEL Hindi EXACT VISIBLE INSTRUCTION'), '[unclear] Hindi [unclear]');
assert.equal(context.questionStructureNeedsVerification('[[QUESTION_SECTION: II || अर्थ लिखिए। || 1x1=1]]\n[[QUESTION_ITEM: 1 || ]]'), true);
assert.equal(context.questionStructureNeedsVerification('[[QUESTION_SECTION: II || अर्थ लिखिए। || 1x1=1]]\n[[QUESTION_ITEM: 1 || कोयल]]'), false);
assert.equal(context.questionStructureNeedsVerification(paper), true); // Check inconsistency, preserve all five source items.
for (const name of ['hasDegenerateOcr', 'shouldAcceptVerifiedText']) loadFunction(worker, name);
const runaway = Array.from({ length: 30 }, (_, i) => '[[TABLE_ROW: (' + 'a'.repeat(i + 1) + ') || ]]').join('\n');
assert.equal(context.hasDegenerateOcr(runaway), true);
assert.equal(context.hasDegenerateOcr('[[COLUMN_ROW: 1 फूल || (a) Dust]]'), false);
assert.equal(context.shouldAcceptVerifiedText(runaway, 'I. निम्न लिखित प्रश्नों के उत्तर लिखिए।\n1. फूलों से हमें क्या मिलती है?'), true);
assert.equal(context.shouldAcceptVerifiedText('1. फूल', runaway), false);
const incomplete = '[[QUESTION_SECTION: I | उत्तर लिखिए। | 2x1=2]]\n[[QUESTION_ITEM: 1. | ]]\n[[QUESTION_ITEM: 2. | ]]';
const recovered = '[[QUESTION_SECTION: I || उत्तर लिखिए। || 2x1=2]]\n[[QUESTION_ITEM: 1 || तीन मित्रों के क्या नाम थे?]]\n[[QUESTION_ITEM: 2 || बया खेतों से क्या लाती है?]]';
assert.equal(context.shouldAcceptVerifiedText(incomplete, recovered), true);
assert.equal(context.shouldAcceptVerifiedText(recovered, recovered.replace(/\n\[\[QUESTION_ITEM: 2[^\n]+/, '')), false);
console.log('Output sanitization, source preservation, missing-word verification, and JavaScript syntax checks passed.');
