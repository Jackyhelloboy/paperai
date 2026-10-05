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

    const setFilesStart = html.indexOf('function setFiles(');
    const setFilesEnd = html.indexOf('\nfunction setFile(', setFilesStart);
    const setFilesSource = html.slice(setFilesStart, setFilesEnd);
    assert(setFilesSource.includes('imageCount > SMART_MAX_IMAGES'), 'Upload path must enforce the five-image limit');
    assert(setFilesSource.includes('pdfCount > SMART_MAX_PDFS'), 'Upload path must enforce the one-PDF limit');
    assert(setFilesSource.includes('startSmartExtractionForFiles();'), 'Background extraction must start when files are selected');
    assert(setFilesSource.includes('forEach(prefetchPreparedImage)'), 'All selected images should begin local preparation immediately');

    const sendStart = html.indexOf('async function sendToOCR(');
    const sendEnd = html.indexOf('\nfunction publicPlainTextFromStructured', sendStart);
    const sendSource = html.slice(sendStart, sendEnd);
    assert(sendSource.includes("formData.append('detail_' + index"), 'Prepared detail views must be sent with the full page');
    assert(sendSource.includes('pattern_hints'), 'OCR request must carry structural-only question-paper hints');
    console.log('Prefetch/upload: local preparation and OCR auto-start on selection with 5-image/1-PDF limits and same-page detail aids.');
})().catch(e => { console.error(e); process.exitCode = 1; });

