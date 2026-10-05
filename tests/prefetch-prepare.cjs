const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
const start = html.indexOf('let preparedImageCache');
const end = html.indexOf('async function sendToOCR(');
assert(start > 0 && end > start, 'prefetch helpers must exist before sendToOCR');
const calls = [];
const context = vm.createContext({
    WeakMap, Promise,
    prepareImageForOCR: async (blob, safe) => { calls.push(safe); if (blob.fail && calls.length === 1) throw new Error('boom'); return { blob, safe }; }
});
vm.runInContext(html.slice(start, end), context);
(async () => {
    const a = {}, b = { fail: true };
    // Prefetched page is prepared once and reused.
    context.prefetchPreparedImage(a); context.prefetchPreparedImage(a);
    const first = await context.takePreparedImage(a);
    assert.equal(first.blob, a); assert.equal(calls.length, 1, 'prefetch must not prepare twice');
    // A second take has nothing cached and prepares fresh (never returns stale data).
    await context.takePreparedImage(a); assert.equal(calls.length, 2);
    // A failed prefetch falls back to a fresh preparation instead of failing the page.
    calls.length = 0;
    context.prefetchPreparedImage(b);
    const recovered = await context.takePreparedImage(b);
    assert.equal(recovered.blob, b); assert.equal(calls.length, 2);
    // The PDF loop prefetches only the next scanned image page.
    assert(html.includes("pages.slice(i + 1).find(p => p.type === 'image')"));
    console.log('Prefetch: next-page preparation is reused once, falls back cleanly, and is wired into the PDF loop.');
})().catch(e => { console.error(e); process.exitCode = 1; });

