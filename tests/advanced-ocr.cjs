const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ DurableObject: class {}, console });
const source = fs.readFileSync(path.join(__dirname, '../worker/src/index.js'), 'utf8');
vm.runInContext(source.replace(/^import .*;\s*$/gm, '').replace(/export default /g, 'const workerDefault = ').replace(/export class /g, 'class '), context);
const text = '[[QUESTION_SECTION: I || उत्तर लिखिए। || 2x1=2]]\n[[QUESTION_ITEM: 1 || तीन मित्रों के क्या नाम थे?]]\n[[QUESTION_ITEM: 2 || बया खेतों से क्या लाती है?]]';
const requests = [];
const env = { AI: { run: async (model, body) => {
    requests.push({ model, body });
    return { choices: [{ message: { content: text }, finish_reason: 'stop' }] };
} } };
(async () => {
    const result = await context.runAI('FULL', 'image/jpeg', env, 'hi', 'easy', {}, [], {}, {}, [
        { mimeType: 'image/jpeg', base64: 'UPPER' }, { mimeType: 'image/jpeg', base64: 'LOWER' }
    ]);
    assert.equal(result.text, text);
    assert.equal(result.scanMode, 'advanced-detail-preserving');
    for (const request of requests) {
        assert.equal(request.model, '@cf/google/gemma-4-26b-a4b-it');
        assert.equal(request.body.chat_template_kwargs.enable_thinking, true);
        assert.equal(request.body.max_completion_tokens, 8192);
        const images = request.body.messages[1].content.filter(part => part.type === 'image_url');
        assert.equal(images.length, 3);
        assert(images[0].image_url.url.endsWith('FULL'));
    }
    console.log('Advanced OCR preserves the full frame, two details, thinking mode, and the same model.');
})().catch(error => { console.error(error); process.exitCode = 1; });
