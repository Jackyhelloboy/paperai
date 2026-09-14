const API_BACKEND = 'https://paperai-ocr.mdjawaadkhan57.workers.dev';
const API_FALLBACK = 'https://paperai-backend.onrender.com';

async function proxyRequest(request, targetBase) {
  const url = new URL(request.url);
  const apiPath = url.pathname.replace('/api', '');
  const targetUrl = targetBase + '/api' + apiPath + url.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!['host', 'connection', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
          'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'cdn-loop'].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow',
  });

  return fetch(proxyReq);
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const res = await proxyRequest(request, API_BACKEND);
    const newHeaders = new Headers(res.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    try {
      const fallbackRes = await proxyRequest(request, API_FALLBACK);
      const fallbackHeaders = new Headers(fallbackRes.headers);
      fallbackHeaders.set('Access-Control-Allow-Origin', '*');
      return new Response(fallbackRes.body, {
        status: fallbackRes.status,
        statusText: fallbackRes.statusText,
        headers: fallbackHeaders,
      });
    } catch (fallbackErr) {
      return new Response(JSON.stringify({ error: 'Both backends unreachable', detail: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
}
