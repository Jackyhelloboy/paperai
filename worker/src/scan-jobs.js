// One isolated Durable Object per random request ID. Short polling lets a
// mobile connection recover without repeating an accepted image submission.
const RETENTION_MS = 10 * 60 * 1000;
const pending = () => Response.json({status:'processing'}, {
  status:202, headers:{'Cache-Control':'no-store','Retry-After':'2'}
});
const reply = result => new Response(result.body, {
  status:result.status, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...result.headers}
});

export async function handleScanJob(owner, request, run) {
  const statusOnly = new URL(request.url).pathname === '/api/ocr-status';
  if (owner.scanPending) return pending();
  if (owner.scanResult?.expiresAt > Date.now()) return reply(owner.scanResult);
  const stored = await owner.ctx.storage.get('scan-result');
  if (stored?.complete && stored.expiresAt > Date.now()) {
    let body = '';
    for (let i=0;i<stored.chunks;i++) body += await owner.ctx.storage.get('scan-text-'+i) || '';
    owner.scanResult = {...stored,body};
    return reply(owner.scanResult);
  }
  if (statusOnly) return Response.json({code:'SCAN_NOT_FOUND',error:'This page has not been submitted.'}, {
    status:404,headers:{'Cache-Control':'no-store'}
  });
  // The input must be fully received before acknowledging the upload. Copy it
  // onto a request independent of the original connection's abort signal.
  if (owner.scanPending) return pending();
  let ready;
  const received = new Promise((resolve,reject) => {ready={resolve,reject};});
  owner.scanPending = (async () => {
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 20 * 1024 * 1024) {
        ready.resolve();
        return {status:413,headers:{},body:JSON.stringify({code:'OCR_FAILED',error:'This page is too large.'})};
      }
      const input = new Request('https://scan.internal/api/ocr', {
        method:'POST',headers:{'Content-Type':request.headers.get('Content-Type') || ''},body:bytes
      });
      ready.resolve();
      const response = await run(input);
      return {status:response.status,body:await response.text(),
        headers:response.headers.has('Retry-After')?{'Retry-After':response.headers.get('Retry-After')}:{}};
    } catch (_) {
      ready.resolve();
      return {status:503,headers:{},body:JSON.stringify({code:'AI_BUSY',error:'This page could not finish. Please retry.'})};
    }
  })().then(async result => {
    result.expiresAt = Date.now() + RETENTION_MS;
    owner.scanResult = result;
    // Each Unicode chunk stays below the Durable Object value-size limit.
    const chunks = Math.ceil(result.body.length / 16000);
    try {
      const metadata={status:result.status,headers:result.headers,expiresAt:result.expiresAt,chunks,complete:false};
      await owner.ctx.storage.put('scan-result',metadata);
      await owner.ctx.storage.setAlarm(result.expiresAt);
      for (let i=0;i<chunks;i++) await owner.ctx.storage.put('scan-text-'+i,result.body.slice(i*16000,(i+1)*16000));
      await owner.ctx.storage.put('scan-result',{...metadata,complete:true});
    } catch (_) { /* The in-memory result can still be collected immediately. */ }
  }).finally(() => {owner.scanPending=null;});
  owner.ctx.waitUntil(owner.scanPending);
  await received;
  return pending();
}
