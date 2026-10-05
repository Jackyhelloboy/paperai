// One-time removal of the retired provider's three bindings. Never logs values.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (account !== '9195bc9144b0e1c8811dfae71e58c7e4' || !token) throw new Error('Deployment account verification failed');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/paperai-ocr/settings`;
const retired = new Set(['OCR_PROVIDER', 'UNLIMITED_OCR_BASE_URL', 'UNLIMITED_OCR_API_KEY']);
async function api(method, body) {
  const response = await fetch(endpoint, {method, body, redirect: 'error',
    headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(30000)});
  const data = await response.json();
  if (!response.ok || !data.success) {
    const message = (data.errors || []).map(x => `${x.code}: ${x.message}`).join(';').replaceAll(token,'[redacted]').replaceAll(account,'[redacted]').slice(0,600);
    throw new Error(`Settings API failed: HTTP ${response.status}; ${message}`);
  }
  return data.result;
}
const before = await api('GET');
const bindings = before.bindings;
if (!Array.isArray(bindings) || bindings.some(x => !x.name || !x.type)) throw new Error('Invalid binding inventory');
for (const [name, type] of [['AI','ai'], ['DB','d1'], ['PAGES_BUCKET','r2_bucket'], ['USAGE_TRACKER','durable_object_namespace']]) {
  if (!bindings.some(x => x.name === name && x.type === type)) throw new Error(`Missing required binding: ${name}`);
}
const removed = bindings.filter(x => retired.has(x.name));
console.log(JSON.stringify({retired_binding_types:removed.map(x => ({name:x.name,type:x.type}))}));
if (removed.some(x => !['plain_text','secret_text'].includes(x.type))) throw new Error('Unexpected retired binding type');
if (removed.length) {
  const form = new FormData();
  form.append('settings', new Blob([JSON.stringify({bindings: bindings.filter(x => !retired.has(x.name))
    .map(x => ({name:x.name, type:'inherit'}))})], {type:'application/json'}), 'settings.json');
  await api('PATCH', form);
}
const after = await api('GET');
const remaining = after.bindings || [];
if (remaining.some(x => retired.has(x.name))) throw new Error('Retired bindings remain');
const retained = bindings.filter(x => !retired.has(x.name));
if (remaining.length !== retained.length || retained.some(x => !remaining.some(y => y.name === x.name && y.type === x.type))) {
  throw new Error('Unrelated binding inventory changed');
}
console.log(JSON.stringify({retired_bindings_removed:removed.map(x => x.name), unrelated_bindings_preserved:true, AI_binding_present:true}));
