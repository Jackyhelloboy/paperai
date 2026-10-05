const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const OWNER = 'a'.repeat(32);
const OTHER_OWNER = 'b'.repeat(32);
const DAY = 24 * 60 * 60 * 1000;

// Minimal D1/R2 stand-ins. Only the statements drafts.js actually issues are
// recognised; everything else is recorded so a test can assert what ran.
// Applies the writes drafts.js issues so insert, edit, reorder and delete are
// exercised for real instead of being stubbed away.
function applyWrite(state, sql, a) {
    const findPage = id => state.pages.find(p => p.id === id && p.draft_id === a[a.length - 1]);

    if (/^INSERT INTO draft_pages/.test(sql)) {
        state.pages.push({
            id: a[0], draft_id: a[1], position: a[2], source_name: a[3],
            image_key: a[4], image_bytes: a[5], ocr_text: a[6], edited_text: null,
            page_profile: a[7], reading: null, state: a[8], updated_at: a[10]
        });
        return;
    }
    if (/^UPDATE draft_pages SET position/.test(sql)) {
        const row = state.pages.find(p => p.id === a[1] && p.draft_id === a[2]);
        if (row) row.position = a[0];
        return;
    }
    if (/^UPDATE draft_pages SET edited_text/.test(sql)) {
        const row = findPage(a[2]);
        if (row) { row.edited_text = a[0]; row.updated_at = a[1]; }
        return;
    }
    if (/^UPDATE draft_pages SET image_key/.test(sql)) {
        const row = state.pages.find(p => p.id === a[a.length - 2] && p.draft_id === a[a.length - 1]);
        if (row) Object.assign(row, {
            image_key: a[0], image_bytes: a[1], ocr_text: a[2], edited_text: null,
            page_profile: a[3], reading: null, state: a[4], source_name: a[5]
        });
        return;
    }
    if (/^DELETE FROM draft_pages WHERE id = \?/.test(sql)) {
        const i = state.pages.findIndex(p => p.id === a[0] && p.draft_id === a[1]);
        if (i >= 0) state.pages.splice(i, 1);
        return;
    }
    if (/^UPDATE drafts SET/.test(sql)) {
        const row = state.drafts.find(d => d.id === a[a.length - 1]);
        if (!row) return;
        if (/SET title = \?/.test(sql)) row.title = a[0];
        if (/updated_at = \?/.test(sql)) row.updated_at = a[a.length - 2];
        if (/expires_at = \?/.test(sql)) row.expires_at = a[a.length - 2];
    }
}

function makeEnv({ drafts = [], pages = [], orphans = [], expiredDrafts = [] } = {}) {
    const calls = { run: [], batch: [], put: [], delete: [], deleteMany: [] };
    const state = { drafts: drafts.slice(), pages: pages.slice() };
    const env = {
        calls,
        DB: {
            prepare(sql) {
                const runner = (args) => ({
                    sql,
                    args,
                    async first() {
                        if (/COALESCE\(SUM\(/.test(sql)) {
                            // The real column is drafts.owner_key, so a query using any
                            // other name would pass a loose fake but fail in production.
                            if (/JOIN drafts/.test(sql) && !/d\.owner_key = \?/.test(sql)) {
                                throw new Error('Storage query must filter on drafts.owner_key: ' + sql);
                            }
                            const owner = /JOIN drafts/.test(sql) ? String(args[0]) : null;
                            const total = state.pages
                                .filter(p => Number(p.image_bytes) > 0)
                                .filter(p => {
                                    if (!owner) return true;
                                    const d = state.drafts.find(x => x.id === p.draft_id);
                                    return d && String(d.owner_key) === owner;
                                })
                                .reduce((sum, p) => sum + Number(p.image_bytes || 0), 0);
                            return { total };
                        }
                        if (/FROM drafts WHERE id = \?$/.test(sql)) {
                            return state.drafts.find(d => d.id === args[0]) || null;
                        }
                        if (/FROM draft_pages WHERE id = \? AND draft_id = \?$/.test(sql)) {
                            return state.pages.find(p => p.id === args[0] && p.draft_id === args[1]) || null;
                        }
                        if (/COALESCE\(MAX\(position\)/.test(sql)) {
                            const top = state.pages.filter(p => p.draft_id === args[0]).reduce((m, p) => Math.max(m, p.position), -1);
                            return { top };
                        }
                        if (/COUNT\(\*\)/.test(sql)) {
                            if (/FROM drafts/.test(sql)) return { total: state.drafts.filter(d => d.owner_key === args[0]).length };
                            return { total: state.pages.filter(p => p.draft_id === args[0]).length };
                        }
                        if (/FROM drafts WHERE expires_at < \?/.test(sql)) return { results: expiredDrafts };
                        if (/LEFT JOIN drafts/.test(sql)) return { results: orphans };
                        return null;
                    },
                    async all() {
                        if (/FROM draft_pages WHERE draft_id = \? ORDER BY position/.test(sql)) {
                            return { results: state.pages.filter(p => p.draft_id === args[0]).slice().sort((a, b) => a.position - b.position) };
                        }
                        if (/FROM drafts WHERE expires_at < \?/.test(sql)) return { results: expiredDrafts };
                        if (/LEFT JOIN drafts/.test(sql)) return { results: orphans };
                        if (/SELECT id FROM drafts WHERE owner_key = \?/.test(sql)) {
                            return { results: state.drafts.filter(d => d.owner_key === args[0]).map(d => ({ id: d.id })) };
                        }
                        return { results: [] };
                    },
                    async run() {
                        calls.run.push({ sql, args });
                        applyWrite(state, sql, args);
                        return { success: true, meta: { changes: 1 } };
                    }
                });
                const prepared = runner([]);
                prepared.bind = (...args) => runner(args);
                return prepared;
            },
            async batch(statements) {
                calls.batch.push(statements.length);
                for (const s of statements) applyWrite(state, s.sql, s.args);
                return statements;
            }
        },
        PAGES_BUCKET: {
            async put(key, bytes, options) { calls.put.push({ key, size: bytes.byteLength, options }); },
            async get(key) { return calls.put.some(p => p.key === key) ? { body: new Uint8Array([1, 2, 3]), httpMetadata: { contentType: 'image/jpeg' } } : null; },
            async delete(keys) {
                const list = Array.isArray(keys) ? keys : [keys];
                if (Array.isArray(keys)) calls.deleteMany.push(list);
                else calls.delete.push(keys);
            },
            async list({ prefix }) {
                const keys = new Set([
                    ...calls.put.map(p => p.key),
                    ...state.pages.map(p => p.image_key).filter(Boolean)
                ]);
                return {
                    objects: [...keys].filter(key => key.startsWith(prefix)).map(key => ({ key })),
                    truncated: false
                };
            }
        }
    };
    return env;
}

function request(url, { method = 'GET', owner = OWNER, json, form, headers = {} } = {}) {
    const all = { ...headers };
    if (owner) all['X-PaperAI-Owner'] = owner;
    if (json !== undefined) all['Content-Type'] = 'application/json';
    return new Request('https://worker.test' + url, {
        method,
        headers: all,
        body: json !== undefined ? JSON.stringify(json) : form
    });
}

const draftRow = {
    id: 'draft-0000-1111',
    owner_key: OWNER,
    title: 'Class 5 maths',
    status: 'building',
    created_at: 1000,
    updated_at: 2000,
    expires_at: 1000 + DAY
};
const pageRow = {
    id: 'page-0000-2222',
    draft_id: draftRow.id,
    position: 0,
    source_name: 'page1.jpg',
    image_key: draftRow.id + '/page-0000-2222.jpg',
    image_bytes: 2048,
    ocr_text: '1. गिनो',
    edited_text: null,
    page_profile: '',
    reading: null,
    state: 'ready',
    updated_at: 3000
};

(async () => {
    const { handleDrafts, purgeExpiredDrafts } = await import(pathToFileURL(path.join(root, 'worker/src/drafts.js')).href);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const call = (req, env) => handleDrafts(req, env, cors, new URL(req.url));

    // 1. Owner key is required, and a short key is never accepted.
    let res = await call(request('/api/drafts', { owner: null }), makeEnv({ drafts: [draftRow] }));
    assert.equal(res.status, 401, 'A missing owner key must be rejected');
    res = await call(request('/api/drafts', { owner: 'short' }), makeEnv({ drafts: [draftRow] }));
    assert.equal(res.status, 401, 'A weak owner key must be rejected');

    // 2. Another device cannot read or change the draft.
    res = await call(request('/api/drafts/' + draftRow.id, { owner: OTHER_OWNER }), makeEnv({ drafts: [draftRow], pages: [pageRow] }));
    assert.equal(res.status, 404, 'A foreign owner must not see the draft');

    // 3. The owner reads their draft and gets page text, but never the photo bytes.
    let env = makeEnv({ drafts: [draftRow], pages: [pageRow] });
    res = await call(request('/api/drafts/' + draftRow.id), env);
    let body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.draft.page_count, 1);
    assert.equal(body.pages.length, 1);
    assert.equal(body.pages[0].text, '1. गिनो');
    assert.equal(body.pages[0].has_image, true);
    assert.equal(body.limits.idle_minutes, 30, 'Drafts must expire after 30 idle minutes');
    assert(!('image_key' in body.pages[0]), 'Internal storage keys must stay private');

    // 4. A Teach correction for one page wins over the raw OCR text.
    env = makeEnv({ drafts: [draftRow], pages: [{ ...pageRow, edited_text: '1. गिनती' }] });
    res = await call(request('/api/drafts/' + draftRow.id), env);
    body = await res.json();
    assert.equal(body.pages[0].text, '1. गिनती', 'An edit must replace the OCR text for that page');
    assert.equal(body.pages[0].ocr_text, '1. गिनो', 'The original OCR text must be kept for reference');

    // 5. Reordering must list every page exactly once.
    env = makeEnv({ drafts: [draftRow], pages: [pageRow] });
    res = await call(request('/api/drafts/' + draftRow.id + '/reorder', { method: 'POST', json: { order: [pageRow.id, 'page-unknown'] } }), env);
    assert.equal(res.status, 400, 'An unknown page in the order must be rejected');
    res = await call(request('/api/drafts/' + draftRow.id + '/reorder', { method: 'POST', json: { order: [] } }), env);
    assert.equal(res.status, 400, 'A partial order must be rejected');

    // 6. A full order is applied, and reordering is reflected in the new listing.
    const secondPage = { ...pageRow, id: 'page-0000-3333', position: 1, image_key: draftRow.id + '/page-0000-3333.jpg' };
    env = makeEnv({ drafts: [draftRow], pages: [pageRow, secondPage] });
    res = await call(request('/api/drafts/' + draftRow.id + '/reorder', { method: 'POST', json: { order: [secondPage.id, pageRow.id] } }), env);
    body = await res.json();
    assert.equal(res.status, 200, 'A complete order must be accepted');
    assert.deepEqual(body.pages.map(p => p.id), [secondPage.id, pageRow.id], 'The new page order must come back');
    assert.deepEqual(body.pages.map(p => p.position), [0, 1], 'Positions must be renumbered from zero');

    // 7. Saving a Teach correction updates one page and leaves its neighbours alone.
    res = await call(request('/api/drafts/' + draftRow.id + '/pages/' + secondPage.id, { method: 'PUT', json: { edited_text: 'सही किया हुआ पाठ' } }), env);
    body = await res.json();
    assert.equal(res.status, 200, 'A Teach correction must save');
    assert.equal(body.page.text, 'सही किया हुआ पाठ', 'The correction must become the page text');
    res = await call(request('/api/drafts/' + draftRow.id), env);
    body = await res.json();
    assert.equal(body.pages.find(p => p.id === pageRow.id).text, pageRow.ocr_text, 'Other pages must keep their own text');

    // 8. Retention is a 30 minute idle window. The browser asks for a delete when
// the tab closes, but that is best effort, so every use must push the deadline
// out and the server must never keep a draft longer than the window allows.

    // 8a. The per-browser photo allowance must be enforced before anything is
    // stored, so storage can never grow past the cap the account is billed on.
    const heavy = { ...pageRow, image_bytes: 250 * 1024 * 1024, image_key: 'heavy.jpg' };
    env = makeEnv({ drafts: [draftRow], pages: [heavy] });
    const capForm = new FormData();
    capForm.append('text', 'x');
    capForm.append('file', new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }), 'extra.jpg');
    res = await call(request('/api/drafts/' + draftRow.id + '/pages', { method: 'POST', form: capForm }), env);
    assert.equal(res.status, 409, 'A browser at its photo allowance must be refused');
    assert.equal(env.calls.put.length, 0, 'Nothing may be stored once the allowance is reached');

    env = makeEnv({ drafts: [draftRow], pages: [pageRow, secondPage] });
    const expiresBefore = body.draft.expires_at;
    res = await call(request('/api/drafts/' + draftRow.id, { method: 'PATCH', json: { title: 'Renamed' } }), env);
    body = await res.json();
    assert.equal(res.status, 200, 'Renaming a draft must work');
    assert(body.draft.expires_at > expiresBefore, 'Using a draft must push its deletion back');
    await call(request('/api/drafts/' + draftRow.id + '/pages/' + secondPage.id, { method: 'PUT', json: { edited_text: 'और बदलाव' } }), env);
    res = await call(request('/api/drafts/' + draftRow.id), env);
    body = await res.json();
    assert(body.draft.expires_at > expiresBefore, 'Editing a page must push its deletion back too');
    assert(body.draft.expires_at <= Date.now() + 30 * 60 * 1000, 'A draft must never be kept beyond the idle window');

    // 9. Adding a page stores one photo and one row, at the end of the draft.
    env = makeEnv({ drafts: [draftRow], pages: [] });
    const form = new FormData();
    form.append('text', '2. लिखो');
    form.append('source_name', 'page2.jpg');
    form.append('file', new Blob([new Uint8Array(4096)], { type: 'image/jpeg' }), 'page2.jpg');
    res = await call(request('/api/drafts/' + draftRow.id + '/pages', { method: 'POST', form }), env);
    assert.equal(res.status, 201, 'Adding a page must succeed');
    assert.equal(env.calls.put.length, 1, 'Exactly one photo must be stored');
    assert.match(env.calls.put[0].key, new RegExp('^' + draftRow.id + '/[0-9a-f-]{36}\\.jpg$'), 'Photos must be namespaced per draft');
    assert(env.calls.run.some(r => /INSERT INTO draft_pages/.test(r.sql)), 'The page row must be written');

    // 7. Non-images and oversized photos are refused instead of silently stored.
    env = makeEnv({ drafts: [draftRow], pages: [] });
    const badForm = new FormData();
    badForm.append('text', 'x');
    badForm.append('file', new Blob([new Uint8Array(10)], { type: 'application/pdf' }), 'page.pdf');
    res = await call(request('/api/drafts/' + draftRow.id + '/pages', { method: 'POST', form: badForm }), env);
    assert.equal(res.status, 400, 'A non-image upload must be refused');
    assert.equal(env.calls.put.length, 0, 'Nothing may be stored for a refused upload');

    env = makeEnv({ drafts: [draftRow], pages: [] });
    const hugeForm = new FormData();
    hugeForm.append('text', 'x');
    hugeForm.append('file', new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'image/jpeg' }), 'huge.jpg');
    res = await call(request('/api/drafts/' + draftRow.id + '/pages', { method: 'POST', form: hugeForm }), env);
    assert.equal(res.status, 413, 'A photo over 3 MB must be refused');

    // The limit is exactly 3 MB, so the boundary itself must still be accepted.
    env = makeEnv({ drafts: [draftRow], pages: [] });
    const edgeForm = new FormData();
    edgeForm.append('text', 'x');
    edgeForm.append('file', new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/jpeg' }), 'edge.jpg');
    res = await call(request('/api/drafts/' + draftRow.id + '/pages', { method: 'POST', form: edgeForm }), env);
    assert.equal(res.status, 201, 'A photo of exactly 3 MB must be accepted');

    // 8. Deleting a page removes its row and its photo.
    env = makeEnv({ drafts: [draftRow], pages: [pageRow] });
    res = await call(request('/api/drafts/' + draftRow.id + '/pages/' + pageRow.id, { method: 'DELETE' }), env);
    assert.equal(res.status, 200);
    assert.deepEqual(env.calls.delete, [pageRow.image_key], 'The stored photo must be deleted with the page');

    // 9. Page photos are only served to the owner.
    env = makeEnv({ drafts: [draftRow], pages: [pageRow] });
    env.calls.put.push({ key: pageRow.image_key });
    res = await call(request('/api/drafts/' + draftRow.id + '/pages/' + pageRow.id + '/image', { owner: OTHER_OWNER }), env);
    assert.equal(res.status, 404, 'A foreign owner must not read a page photo');
    res = await call(request('/api/drafts/' + draftRow.id + '/pages/' + pageRow.id + '/image'), env);
    assert.equal(res.status, 200, 'The owner must be able to read their page photo');

    // 10. Cleanup removes only what has already expired.
    env = makeEnv({ drafts: [draftRow], expiredDrafts: [{ id: draftRow.id }], orphans: [{ id: 'page-old', image_key: 'stale/old.jpg' }] });
    const purged = await purgeExpiredDrafts(env);
    assert.equal(purged.drafts_removed, 1);
    assert.equal(purged.pages_removed, 1);
    assert(env.calls.delete.includes('stale/old.jpg'), 'An orphaned photo must be deleted');

    // 11. The close/refresh hook can wipe every draft for one browser, and only
    // that browser's. It takes the key in the body because beacons cannot send
    // headers, so a missing or malformed body must be refused.
    env = makeEnv({ drafts: [draftRow], pages: [pageRow] });
    res = await call(request('/api/drafts/discard', { method: 'POST', json: { owner: OTHER_OWNER } }), env);
    assert.equal(res.status, 200, 'The discard hook must answer a beacon');
    assert.equal((await res.json()).discarded, 0, 'Drafts belonging to another browser must survive');
    res = await call(request('/api/drafts/discard', { method: 'POST', json: { owner: OWNER } }), env);
    assert.equal((await res.json()).discarded, 1, 'Every draft for the calling browser must be discarded');
    assert(env.calls.deleteMany.some(keys => keys.includes(pageRow.image_key)),
    'Discarding must delete the stored photos too');
    res = await call(request('/api/drafts/discard', { method: 'POST', json: { owner: 'nope' } }), makeEnv());
    assert.equal(res.status, 401, 'A malformed owner key must be refused');

    // 12. Unknown draft routes still answer with a JSON 404.
    res = await call(request('/api/drafts/unknown-route'), makeEnv());
    assert.equal(res.status, 404);

    console.log('Draft paging, ownership, 3 MB page limit, 30 minute idle cleanup and discard checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });