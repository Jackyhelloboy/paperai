// Provider rejection must win over delayed analytics without turning every 429
// into a daily block, losing the first OCR pass, or disabling local editing.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const Quota = require('../frontend/vendor/ai-quota.js');
const now = Date.parse('2026-10-11T10:30:00Z');
const report = { source: 'cloudflare-analytics', report_date_utc: '2026-10-11', reported_used: 8009.37,
    reported_remaining: 1990.63, percent_used: 80.09, last_updated: '2026-10-11T09:00:00Z', reset_at: '2026-10-12T00:00:00Z' };
const blocked = { date_utc: '2026-10-11', provider_limit_reached: true, reset_at: report.reset_at };
let view = Quota.model(report, blocked, null, now);
assert.equal(view.remaining, 0); assert.equal(view.used, 8009.37);
assert.equal(view.badge, 'Free AI limit reached');
assert.equal(view.barPercent,100);assert.equal(view.percent,80.0937);
assert.equal(view.barLabel,'Free AI paused until reset');
const inconsistent=Quota.model({...report,percent_used:17,reported_remaining:9999},null,null,now);
assert.equal(inconsistent.percent,80.0937);assert.equal(inconsistent.remaining,1990.63);
assert.equal(Quota.model({...report,daily_reference:0},null,null,now).percent,null);
assert(Quota.model(null, blocked, null, now).blocked, 'Analytics outages must not hide a confirmed block');
assert(Quota.model(report, null, blocked, now).blocked, 'A known rejection survives live-status outages');
assert(!Quota.model(report, { ...blocked, provider_limit_reached: false, exhausted: true }, null, now).blocked,
    'Explicit provider status beats a token estimate');
assert(!Quota.model(report, { date_utc: blocked.date_utc, exhausted: true, reset_at: blocked.reset_at }, null, now).blocked,
    'Older estimate-only status cannot prove a provider rejection');
view = Quota.model(report, blocked, blocked, Date.parse(report.reset_at));
assert(!view.blocked); assert.equal(view.remaining, null); assert.equal(view.used, null);
assert.equal(view.resetAt, '2026-10-13T00:00:00.000Z');
assert(!Quota.isDailyError({ code: 'AI_BUSY' })); assert(Quota.isDailyError({ code: 'FREE_AI_LIMIT_REACHED' }));

let clock = now;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const ctx = vm.createContext({ Date: Clock, URL, Request, Response, Headers, TextDecoder, Uint8Array, btoa,
    console: { log() {} }, DurableObject: class { constructor(context, env) { this.ctx = context; this.env = env; } },
    PAPER_LAYOUT_RULES: '', normaliseMarkerRows: s => s, DICTIONARY: {},
    getDictionaryWords: () => [], isInDictionary: () => false, autoCorrect: s => s,
    verifyWord: () => ({}), getSuggestions: () => [], CONFUSION_PAIRS: {}, setTimeout });
vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js', 'utf8').replace(/export /g, ''), ctx);
const worker = fs.readFileSync('worker/src/index.js', 'utf8').replace(/^import .*;\n/gm, '')
    .replace('export default {', 'const workerHandler = {').replace('export class UsageTracker', 'class UsageTracker');
vm.runInContext(worker + '\nthis.handler=workerHandler;this.Tracker=UsageTracker;sleep=async()=>{};', ctx);
assert(ctx.isDailyFreeLimitError(new Error('AiError: 3036: You have used up your daily free allocation of 10,000 neurons')));
assert(!ctx.isDailyFreeLimitError(new Error('3040: Capacity temporarily exceeded. 429')));
assert(!ctx.isDailyFreeLimitError(new Error('429: neuron allocation rate limit temporarily exceeded')));
assert(!ctx.isDailyFreeLimitError(new Error('request id 13036 failed')));
assert(!ctx.isTransientAiError(new Error('5035: requires a Workers Paid plan')));

function environment(run) {
    const memory = new Map();
    const tracker = new ctx.Tracker({ storage: { get: async k => structuredClone(memory.get(k)),
        put: async (k, v) => memory.set(k, structuredClone(v)) } }, {});
    const env = { AI: { run }, USAGE_TRACKER: { idFromName: s => s, get: () => ({
        fetch: (url, options) => tracker.fetch(new Request(url, options)) }) } };
    return { env, memory };
}
const imageRequest = () => new Request('https://paperai.test/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'AA==', mimeType: 'image/jpeg', filename: 'page.jpg' }) });
const cors = { 'Access-Control-Allow-Origin': '*' };

async function backend() {
    let calls = 0;
    const good = { response: '1. Write your name. ______', usage: { prompt_tokens: 100, completion_tokens: 20 } };
    let test = environment(async () => { calls++; throw new Error('3036: daily free allocation reached'); });
    let res = await ctx.handler.fetch(imageRequest(), test.env), body = await res.json();
    assert.equal(res.status, 429); assert.equal(body.code, 'FREE_AI_LIMIT_REACHED');
    assert.equal(body.reset_at, report.reset_at.replace('Z', '.000Z')); assert(+res.headers.get('Retry-After') > 0);
    assert.equal(calls, 1, 'Do not retry confirmed provider exhaustion');
    res = await ctx.handler.fetch(imageRequest(), test.env); assert.equal(res.status, 429); assert.equal(calls, 1);
    let usage = await ctx.getUsageStatus(test.env); assert(usage.provider_limit_reached);
    assert.equal(usage.estimated_used, 0, 'A rejected call must not fabricate a 10,000-neuron usage total');
    clock = Date.parse('2026-10-12T00:00:00Z');
    assert(!(await ctx.getUsageStatus(test.env)).provider_limit_reached, 'Provider block expires at UTC midnight');
    test.env.AI.run = async () => { calls++; return good; };
    assert.equal((await ctx.handler.fetch(imageRequest(), test.env)).status, 200); assert.equal(calls, 2);
    clock = now;
    test = environment(async () => good);
    test.memory.set('daily', { day: '2026-10-11', used: 10000, requests: 4, exhausted: false, history: [] });
    assert.equal((await ctx.handler.fetch(imageRequest(), test.env)).status, 200, 'Token estimates cannot block inference');
    test = environment(async () => { throw new Error('3040: Capacity temporarily exceeded'); });
    res = await ctx.handler.fetch(imageRequest(), test.env); body = await res.json();
    assert.equal(res.status, 503); assert.equal(body.code, 'AI_BUSY');
    assert(!(await ctx.getUsageStatus(test.env)).provider_limit_reached);
    calls = 0;
    test = environment(async () => { if (++calls === 1) return { ...good, response: '1. Name the [unclear] object. ______' };
        throw new Error('3036: daily free allocation reached'); });
    res = await ctx.handler.fetch(imageRequest(), test.env); body = await res.json();
    assert.equal(res.status, 200); assert.equal(calls, 2);
    assert(body.result.full_text.includes('[unclear]'), 'Quota during verification must keep the usable first pass');
    assert((await ctx.getUsageStatus(test.env)).provider_limit_reached);
    const txt = new FormData(); txt.append('file', new Blob(['1. Name the planet.']), 'questions.txt');
    assert.equal((await ctx.handler.fetch(new Request('https://paperai.test/api/ocr', { method: 'POST', body: txt }), test.env)).status, 200,
        'Non-AI text extraction still works while AI is blocked');
    res = await ctx.handler.fetch(new Request('https://paperai.test/api/suggest-word', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'uncommonphrase', language: 'en' }) }), test.env);
    assert.equal(res.status, 429); assert.equal(calls, 2, 'Blocked suggestions do not invoke AI');
}

const html = fs.readFileSync('frontend/index.html', 'utf8');
const code = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('function buildDocxBody'))[1];
const slice = (a, b) => code.slice(code.indexOf(a), code.indexOf(b, code.indexOf(a) + 1));
async function frontend() {
    let prepares = 0, requests = 0, response;
    const ui = vm.createContext({ PaperAIQuota: Quota, Blob, FormData, languageSelect: { value: 'auto' },
        loadUsage: async () => ({ blocked: true, resetAt: report.reset_at }), quotaFailure: () => Object.assign(new Error('quota stopped'), { code: 'FREE_AI_LIMIT_REACHED' }),
        prepareImageForOCR: async () => { prepares++; return { blob: new Blob(['page']), meta: {} }; },
        fetchOcrEndpoint: async () => { requests++; return response; }, appendLearningHints() {}, setProg() {}, wait: async () => {} });
    vm.runInContext(slice('async function sendToOCR', 'function publicPlainTextFromStructured'), ui);
    await assert.rejects(() => ui.sendToOCR(new Blob(['page'])), /quota stopped/);
    assert.equal(prepares, 0); assert.equal(requests, 0, 'Known quota failure stops before preparation/upload');
    ui.loadUsage = async () => ({ blocked: false });
    response = Response.json({ code: 'AI_BUSY' }, { status: 429 });
    await assert.rejects(() => ui.sendToOCR(new Blob(['page'])), /temporarily busy/);
    assert.equal(requests, 1);
    response = Response.json({ code: 'FREE_AI_LIMIT_REACHED' }, { status: 429 });
    await assert.rejects(() => ui.sendToOCR(new Blob(['page'])), /quota stopped/);
    let urls = [];
    const proxy = vm.createContext({ API_LOCAL: 'https://paperai.test', API_DIRECT: 'https://worker.test',
        fetch: async url => { urls.push(url); return Response.json({ code: 'AI_BUSY' }, { status: 503 }); } });
    vm.runInContext(slice('async function fetchOcrEndpoint', 'const LEARNING_KEY'), proxy);
    assert.equal((await proxy.fetchOcrEndpoint('/api/ocr', {})).status, 503); assert.equal(urls.length, 1);
    urls = []; proxy.fetch = async url => { urls.push(url); return urls.length === 1 ? new Response('No route', { status: 404 }) : Response.json({ status: 'completed' }); };
    assert.equal((await proxy.fetchOcrEndpoint('/api/ocr', {})).status, 200); assert.equal(urls.length, 2);

    const fields = {};
    const field = id => fields[id] ||= { textContent: '', style: {}, setAttribute() {}, removeAttribute() {}, classList: { toggle() {} } };
    const timedQuota = { ...Quota, model: (r, s, l) => Quota.model(r, s, l, clock),
        activeBlock: s => Quota.activeBlock(s, clock), nextReset: (n = clock) => Quota.nextReset(n) };
    const dashboard = vm.createContext({ PaperAIQuota: timedQuota, Date: Clock, AbortSignal, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        $: field, API_DIRECT: 'https://worker.test', fetch: async url => Response.json(url.includes('usage.json') ? report : blocked),
        ...Object.fromEntries(['quotaCard','quotaRemaining','quotaUsed','quotaFill','quotaPercent','quotaNow','quotaReset','quotaBadgeText'].map(id => [id, field(id)])) });
    vm.runInContext(slice('let quotaResetAt', '\nrenderUsage();\nloadUsage();'), dashboard);
    await dashboard.loadUsage();
    assert.equal(fields.quotaRemaining.textContent, '0'); assert.equal(fields.quotaUsed.textContent, '8,009.37');
    assert.equal(fields.quotaRemainingLabel.textContent, 'Free AI available');
    assert.equal(fields.quotaFill.style.width,'100.00%');assert.equal(fields.quotaPercent.textContent,'Free AI paused until reset');
    assert(fields.quotaReset.textContent.includes('05:30')); assert(fields.quotaDescription.textContent.includes('Word export'));
    dashboard.fetch = async () => { throw new Error('offline'); };
    await dashboard.loadUsage(); assert.equal(fields.quotaRemaining.textContent, '0');
    clock = Date.parse(report.reset_at); await dashboard.loadUsage();
    assert.equal(fields.quotaRemaining.textContent, '—'); assert.equal(fields.quotaUsed.textContent, '—');
    assert(!dashboard.renderUsage().blocked);

    const classes = () => { const set = new Set(); return { add: v => set.add(v), remove: v => set.delete(v), has: v => set.has(v) }; };
    const f = { name: 'same-open-file.pdf' }, saved = { text: 'Completed questions', source_file: f }, media = { id: 'reviewed-picture' };
    const flow = vm.createContext({ file: f, fileBatch: [f], lastResult: saved, extractedMedia: [media],
        processingUpload:false,uploadRun:0,fileInput:{},clearBtn:{},goBtn: {classList:classes()}, languageSelect: {}, prog: { classList: classes() }, resBox: { classList: classes() },
        hideErr() {}, setProg() {}, loadUsage: async () => {},
        extractOneFile: async () => { throw new Error('free AI stopped'); }, showErr: message => { flow.message = message; } });
    vm.runInContext(slice('goBtn.onclick = async', 'function dlBlob'), flow);
    await flow.goBtn.onclick();
    assert(!flow.prog.classList.has('show'), 'A stopped scan must clear the stuck progress bar');
    assert(flow.resBox.classList.has('show')); assert.equal(flow.lastResult, saved);
    assert.equal(flow.extractedMedia[0], media); assert.equal(flow.goBtn.disabled, false);
}
(async () => { await backend(); await frontend(); console.log('Quota: provider block overrides stale analytics, expires at reset, preserves first OCR/local editing, distinguishes busy responses and prevents duplicate AI submissions.'); })()
    .catch(error => { console.error(error); process.exitCode = 1; });
