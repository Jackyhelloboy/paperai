// Server-only gateway. Never copy the backend address into browser assets.
const API_BACKEND = 'https://paperai-ocr.mdjawaadkhan57.workers.dev';
const ROUTES = Object.freeze({
  '/api/ocr': 'POST', '/api/ocr-status': 'GET', '/api/suggest-word': 'POST', '/api/generate-picture': 'POST',
  '/api/usage': 'GET', '/api/live': 'GET', '/api/health': 'GET',
  '/api/pictures/search': 'GET', '/api/pictures/asset': 'GET',
});
const ERRORS = Object.freeze({
  FREE_AI_LIMIT_REACHED: 'Scanning is temporarily unavailable. Please retry later. Editing and Word export remain available.',
  SCAN_SERVICE_UNAVAILABLE: 'Scanning is temporarily unavailable. Editing and Word export remain available.',
  AI_BUSY: 'PaperAI is temporarily busy. Please try again shortly.',
  AI_TIMEOUT: 'This scan took too long. Please retry a clearer or smaller page.',
  OCR_OUTPUT_INVALID: 'This page could not be read reliably. Please retry or review the source.',
  FREE_MODEL_UNAVAILABLE: 'Scanning is temporarily unavailable. Editing and Word export remain available.',
  AI_OCR_FAILED: 'This page could not be scanned. Please try again.',
  OCR_FAILED: 'This file could not be read. Please check the file and try again.',
  OCR_PROXY_UNREACHABLE: 'PaperAI is temporarily unreachable. Please try again shortly.',
  IMAGE_GENERATION_UNAVAILABLE: 'AI pictures are not enabled for this website. You can still insert an uploaded picture.',
  IMAGE_GENERATION_LIMIT: 'AI picture generation has reached its daily limit. Try again tomorrow or upload a picture.',
  IMAGE_GENERATION_FAILED: 'AI could not generate this picture. Try another description or upload an image.',
  PICTURE_SEARCH_UNAVAILABLE: 'Online pictures are temporarily unavailable. Try another subject or upload a picture.',
  SCAN_NOT_FOUND: 'This page has not been submitted.',
});
function json(body, status = 200, extra = {}) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...extra}});
}
function publicResult(body) {
  // Keep document content verbatim, including technology names in the paper.
  // Only application-owned metadata is reduced to fields used by the editor.
  if (!body.result || typeof body.result !== 'object') return body;
  const result = {...body.result};
  for (const key of ['engine','model','revision','architecture','platform','provider']) delete result[key];
  if (result.metadata) {
    result.metadata = Object.fromEntries(Object.entries(result.metadata).filter(([key]) =>
      ['filename','total_pages','total_characters','char_count','language','requested_language',
        'detected_language','layout','detected_lines'].includes(key)));
  }
  return {status: body.status, result};
}
export async function onRequest({request, env = {}, fetcher = fetch}) {
  const url = new URL(request.url), method = ROUTES[url.pathname];
  if (!method) return json({error: 'Not found', code: 'NOT_FOUND'}, 404);
  if (request.method !== method) return json({error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED'}, 405, {Allow: method});
  if (Number(request.headers.get('Content-Length')) > 51 * 1024 * 1024)
    return json({error: 'Please upload a file smaller than 50 MB.', code: 'FILE_TOO_LARGE'}, 413);
  const target = new URL(url.pathname === '/api/health' ? '/health' : url.pathname,
    env.PAPERAI_BACKEND_URL || API_BACKEND);
  if (url.pathname.startsWith('/api/pictures/')) target.search = url.search;
  const headers = new Headers();
  for (const name of ['Content-Type','X-PaperAI-Request-ID','Upgrade','Sec-WebSocket-Key','Sec-WebSocket-Version','Sec-WebSocket-Protocol']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  try {
    const upstream = await fetcher(new Request(target, {
      method, headers, body: method === 'GET' ? undefined : request.body,
      redirect: 'manual', duplex: 'half',
    }));
    // Preserve the original upgrade response and its live socket.
    if (upstream.status === 101 && url.pathname === '/api/live') return upstream;
    if (url.pathname === '/api/pictures/asset' && upstream.ok && /^image\/(png|jpeg|webp)(?:;|$)/.test(upstream.headers.get('Content-Type') || ''))
      return new Response(upstream.body, {headers: {'Content-Type': upstream.headers.get('Content-Type'), 'Cache-Control':'public, max-age=86400', 'X-Content-Type-Options':'nosniff'}});
    if (!(upstream.headers.get('Content-Type') || '').includes('application/json'))
      return json({error: ERRORS.OCR_PROXY_UNREACHABLE, code: 'OCR_PROXY_UNREACHABLE'}, 502);
    const body = await upstream.json();
    if (!upstream.ok) {
      const code = Object.hasOwn(ERRORS, body.code) ? body.code : 'OCR_FAILED';
      const error = {code, error: ERRORS[code]};
      if (code === 'FREE_AI_LIMIT_REACHED' && Number.isFinite(Date.parse(body.reset_at))) error.reset_at = body.reset_at;
      const retry = upstream.headers.get('Retry-After');
      return json(error, upstream.status, /^\d+$/.test(retry || '') ? {'Retry-After': retry} : {});
    }
    if (url.pathname === '/api/health') return json({status: 'healthy'});
    if (url.pathname === '/api/usage') return json({
      date_utc: body.date_utc, provider_limit_reached: body.provider_limit_reached,
      reset_at: body.reset_at,
    });
    if (url.pathname === '/api/suggest-word') return json({suggestions: body.suggestions || []});
    if (url.pathname === '/api/generate-picture') return json({image:body.image || null});
    if (url.pathname === '/api/pictures/search') return json({query:body.query, results:body.results || []});
    return json(publicResult(body),upstream.status,upstream.status===202?{'Retry-After':'2'}:{});
  } catch (_) {
    return json({error: ERRORS.OCR_PROXY_UNREACHABLE, code: 'OCR_PROXY_UNREACHABLE'}, 502);
  }
}

