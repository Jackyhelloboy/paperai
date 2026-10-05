const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let clock = Date.parse('2026-10-05T12:01:00Z');
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const values = new Map();
let alarmAt;
const ctx = { storage: {
  async get(key) { return structuredClone(values.get(key)); },
  async put(key, value) { values.set(key, structuredClone(value)); },
  async setAlarm(at) { alarmAt = at; },
} };
const worker = vm.createContext({
  Date: ClockDate, URL, Request, Response, console,
  DurableObject: class { constructor(ctx) { this.ctx = ctx; } },
});
const source = fs.readFileSync(path.join(__dirname, '../worker/src/index.js'), 'utf8');
vm.runInContext(source.replace(/^import .*;\s*$/gm, '')
  .replace(/export default /g, 'const workerDefault = ')
  .replace(/export class /g, 'class '), worker);
const Tracker = vm.runInContext('UsageTracker', worker);
const tracker = new Tracker(ctx, {});
async function call(route, body) {
  return (await tracker.fetch(new Request('https://usage.internal' + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))).json();
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

(async () => {
  // An old daily exhaustion flag must not migrate into or block the new meter.
  values.set('daily', { day: '2026-10-05', used: 10000, exhausted: true });
  const initial = await call('/status');
  assert.equal(initial.estimated_used, 0);
  assert.equal(initial.window_seconds, 300);
  assert.equal(initial.reset_at, '2026-10-05T12:05:00.000Z');
  assert.equal(initial.provider_reset_at, '2026-10-06T00:00:00.000Z');
  assert.equal(alarmAt, Date.parse(initial.reset_at));
  const full = await call('/add', { neurons: 10000, owner: 'test-owner-12345678901234' });
  assert.equal(full.estimated_remaining, 0);
  assert.equal(full.exhausted, false);
  assert.equal((await call('/owner-check', { owner: 'test-owner-12345678901234' })).allowed, true);
  clock = Date.parse('2026-10-05T12:04:59.999Z');
  assert.equal((await call('/status')).estimated_used, 10000);
  clock += 1;
  await tracker.alarm();
  assert.equal(values.get('five-minute-usage').used, 0);
  assert.equal(values.get('five-minute-usage').requests, 0);
  assert.equal(Object.keys(values.get('five-minute-usage').owners).length, 0);
  const reset = await call('/status');
  assert.equal(reset.reset_at, '2026-10-05T12:10:00.000Z');
  assert.equal(reset.estimated_remaining, 10000);
  assert.equal(reset.history.length, 0);
  assert.equal(reset.provider_reset_at, initial.provider_reset_at);
  await call('/add', { neurons: 42, owner: 'test-owner-12345678901234' });
  clock = Date.parse('2026-10-05T12:17:00Z');
  // Missed alarms or sleeping clients recover lazily on the next read.
  assert.equal((await call('/status')).estimated_used, 0);
  await call('/exhausted', {});
  assert.equal((await call('/status')).exhausted, false);
  clock = Date.parse('2026-10-05T23:59:00Z');
  await call('/add', { neurons: 50 });
  clock = Date.parse('2026-10-06T00:00:00Z');
  assert.equal((await call('/status')).estimated_used, 0);

  // Exercise the actual UI functions with a controllable clock and fetch.
  const elements = {};
  for (const name of ['quotaNow', 'quotaReset', 'quotaRemaining', 'quotaUsed', 'quotaFill',
    'quotaPercent', 'quotaBadgeText', 'quotaMine', 'quotaLine', 'quotaCard']) {
    elements[name] = { textContent: '', style: {}, dataset: {},
      classList: { toggle() {}, remove() {} }, setAttribute(key, value) { this[key] = value; } };
  }
  const intervals = [], listeners = {};
  let fetches = 0, fail = false;
  const front = vm.createContext({
    ...elements, Date: ClockDate, Intl, Number, AbortSignal, console,
    API_LOCAL: '/api-local', API_DIRECT: 'https://worker.example', draftOwnerKey: () => 'test-owner-12345678901234',
    document: { visibilityState: 'visible', getElementById: id => elements[id],
      addEventListener: (name, fn) => { listeners[name] = fn; } },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); },
    fetch: async () => {
      fetches++;
      if (fail) throw new Error('offline');
      return { ok: true, json: () => call('/status') };
    },
  });
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  vm.runInContext(html.slice(html.indexOf('let quotaResetAt = null;'), html.indexOf('let presenceSocket = null;')), front);
  await flush();
  assert(intervals.some(row => row.ms === 300000));
  assert.equal(elements.quotaUsed.textContent, '0.0');
  await call('/add', { neurons: 200 });
  await vm.runInContext('loadUsage()', front);
  assert.equal(elements.quotaUsed.textContent, '200');
  assert(elements.quotaLine.points.includes('0.0,'));
  clock = Date.parse('2026-10-06T00:05:00Z');
  vm.runInContext('updateQuotaClock()', front);
  await flush();
  assert.equal(elements.quotaUsed.textContent, '0.0');
  assert(elements.quotaReset.textContent.startsWith('in 5m 00s'));
  // Expired displays retry after a network failure without a request each second.
  fail = true;
  clock = Date.parse('2026-10-06T00:10:00Z');
  vm.runInContext('updateQuotaClock(); updateQuotaClock()', front);
  await flush();
  const afterFailure = fetches;
  vm.runInContext('updateQuotaClock()', front);
  await flush();
  assert.equal(fetches, afterFailure);
  assert.equal(elements.quotaBadgeText.textContent, 'Unavailable');
  fail = false;
  listeners.online();
  await flush();
  assert.equal(elements.quotaBadgeText.textContent, 'Usage estimate');
  await call('/add', { neurons: 12 });
  listeners.visibilitychange();
  await flush();
  assert.equal(elements.quotaUsed.textContent, '12.0');
  console.log('Five-minute resets, alarm recovery, owner counts, provider separation, UI countdown, and reconnect refresh passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
