const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ DurableObject: class {}, console, Math, setTimeout });
const source = fs.readFileSync(path.join(__dirname, '../worker/src/index.js'), 'utf8');
vm.runInContext(source.replace(/^import .*;\s*$/gm, '').replace(/export default /g, 'const workerDefault = ').replace(/export class /g, 'class '), context);

// 1. Thinking is reserved for hard / structured pages and never used on a lighter retry.
assert.equal(context.ocrNeedsThinking({}, 'easy'), false);
assert.equal(context.ocrNeedsThinking({ lineCount: 30 }, 'auto'), false, 'dense handwriting alone does not need reasoning');
assert.equal(context.ocrNeedsThinking({}, 'hard'), false);
assert.equal(context.ocrNeedsThinking({ structuredLayout: true }, 'easy'), false);
assert.equal(context.ocrNeedsThinking({ branchingLayout: true }, 'easy'), true);
assert.equal(context.ocrNeedsThinking({ multiColumnRows: 2 }, 'easy'), false);
assert.equal(context.ocrNeedsThinking({ difficulty: 'hard', safeRetry: true }, 'hard'), false, 'safe retry is always light');

// 2. A couple of [unclear] words on a handwriting page no longer triggers a second full pass...
const words = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
const fewUnclear = words(60) + ' [unclear] ' + words(20) + ' [unclear]';
assert.equal(context.shouldVerifyOcr(fewUnclear, {}), false);
// ...but a page that is mostly unreadable, empty, or runaway still does.
const manyUnclear = Array.from({ length: 30 }, (_, i) => 'w' + i + ' [unclear]').join(' ');
assert.equal(context.shouldVerifyOcr(manyUnclear, {}), true);
assert.equal(context.shouldVerifyOcr('', { edgeRatio: 0.05 }), true);
// Structured pages keep the strict single-[unclear] rule.
assert.equal(context.shouldVerifyOcr('[[TABLE_START]]\n[[TABLE_ROW: a || [unclear]]]\n[[TABLE_END]] ' + words(40), { structuredLayout: true, multiColumnRows: 3 }), true);

// 3. Lighter retry keeps a usable first read instead of paying for another pass.
assert.equal(context.skipVerificationOnSafeRetry('some text', { safeRetry: true }), true);
assert.equal(context.skipVerificationOnSafeRetry('', { safeRetry: true }), false);
assert.equal(context.skipVerificationOnSafeRetry('some text', {}), false);

// 4. End to end through runAI: transient capacity errors are retried up to three times with backoff.
(async () => {
    let calls = 0;
    const env = { AI: { run: async (model, body) => {
        calls++;
        if (calls < 3) throw new Error('3040: out of capacity');
        return { choices: [{ message: { content: words(30) }, finish_reason: 'stop' }] };
    } } };
    context.sleep = () => Promise.resolve();
    const result = await context.runAI('IMG', 'image/jpeg', env, 'auto', 'easy', {}, [], {}, {}, []);
    assert.equal(calls, 3, 'two transient failures then success');
    assert.equal(result.text, words(30));

    // A safe retry never enables thinking and never starts a second verification pass.
    const bodies = [];
    const env2 = { AI: { run: async (model, body) => {
        bodies.push(body);
        return { choices: [{ message: { content: 'a [unclear] b [unclear] c [unclear] d [unclear]' }, finish_reason: 'stop' }] };
    } } };
    await context.runAI('IMG', 'image/jpeg', env2, 'auto', 'hard', { safeRetry: true, difficulty: 'hard' }, [], {}, {}, []);
    assert.equal(bodies.length, 1, 'no verification pass on a lighter retry');
    assert.equal(bodies[0].chat_template_kwargs.enable_thinking, false);

    // A hard photo retains image detail without spending tokens on reasoning.
    const bodies3 = [];
    const env3 = { AI: { run: async (model, body) => { bodies3.push(body); return { choices: [{ message: { content: words(40) }, finish_reason: 'stop' }] }; } } };
    await context.runAI('IMG', 'image/jpeg', env3, 'auto', 'hard', { difficulty: 'hard' }, [], {}, {}, []);
    assert.equal(bodies3[0].chat_template_kwargs.enable_thinking, false);

    console.log('Speed profile: adaptive thinking, [unclear] threshold, safe-retry, and 3-attempt backoff checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
