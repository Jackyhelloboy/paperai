const API_BACKEND = 'https://paperai-ocr.mdjawaadkhan57.workers.dev';

async function proxyRequest(request) {
  const url = new URL(request.url);
  const apiPath = url.pathname.replace('/api', '');
  const targetUrl = API_BACKEND + '/api' + apiPath + url.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!['host','connection','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor',
          'x-forwarded-for','x-forwarded-proto','x-real-ip','cdn-loop'].includes(lower)) {
      headers.set(key, value);
    }
  });

  return fetch(new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow',
  }));
}

export async function onRequest({ request }) {
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
    const res = await proxyRequest(request);
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-store');

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'PaperAI OCR service is temporarily unreachable.',
      code: 'OCR_PROXY_UNREACHABLE'
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
}
