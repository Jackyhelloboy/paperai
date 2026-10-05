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
    assert(setFilesSource.includes('scheduleSmartExtractionAfterPreview();'), 'Background extraction must be scheduled after preview rendering');

    const scheduleStart = html.indexOf('function scheduleSmartExtractionAfterPreview(');
    const scheduleEnd = html.indexOf('\nfunction pumpSmartExtractionQueue(', scheduleStart);
    const scheduleSource = html.slice(scheduleStart, scheduleEnd);
    assert(scheduleSource.includes('.slice(0, smartWorkerLimit())'), 'Local preprocessing must stay within OCR concurrency');
    assert(scheduleSource.includes('.forEach(prefetchPreparedImage)'), 'The active OCR slots should reuse prepared images');
    assert(scheduleSource.includes('requestAnimationFrame'), 'Preview paint gets priority before preprocessing');

    const healthStart = html.indexOf('async function checkServiceHealth(');
    const healthEnd = html.indexOf('\nupdateQuotaClock();', healthStart);
    const healthSource = html.slice(healthStart, healthEnd);
    assert(healthSource.includes("API_LOCAL + '/api/health"), 'Health check prefers the same-origin Pages proxy');
    assert(healthSource.includes("API_DIRECT + '/health"), 'Health check retains the direct Worker fallback');

    const sendStart = html.indexOf('async function sendToOCR(');
    const sendEnd = html.indexOf('\nfunction publicPlainTextFromStructured', sendStart);
    const sendSource = html.slice(sendStart, sendEnd);
    assert(sendSource.includes("formData.append('detail_' + index"), 'Prepared detail views must be sent with the full page');
    assert(sendSource.includes('pattern_hints'), 'OCR request must carry structural-only question-paper hints');
    console.log('Prefetch/upload: previews paint first, preparation stays concurrency-limited, health has proxy fallback, and OCR auto-start remains enabled.');
})().catch(e => { console.error(e); process.exitCode = 1; });

