const API_BACKEND = 'https://paperai-ocr.mdjawaadkhan57.workers.dev';
const API_FALLBACK = 'https://paperai-backend.onrender.com';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const apiPath = url.pathname.replace('/api', '');
  const targetUrl = API_BACKEND + '/api' + apiPath;

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow',
  });

  try {
    const res = await fetch(proxyReq);
    const newHeaders = new Headers(res.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.delete('x-powered-by');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    try {
      const fallbackUrl = API_FALLBACK + '/api' + apiPath;
      const fallbackReq = new Request(fallbackUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow',
      });
      const fallbackRes = await fetch(fallbackReq);
      const fallbackHeaders = new Headers(fallbackRes.headers);
      fallbackHeaders.set('Access-Control-Allow-Origin', '*');
      return new Response(fallbackRes.body, {
        status: fallbackRes.status,
        statusText: fallbackRes.statusText,
        headers: fallbackHeaders,
      });
    } catch (fallbackErr) {
      return new Response(JSON.stringify({ error: 'Both backends unreachable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
}
