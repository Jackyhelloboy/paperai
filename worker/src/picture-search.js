import CommonsPictures from '../../frontend/vendor/commons-pictures.js';

// Broad image discovery is opt-in and separate from embeddable media search. Without a server-side Brave key, preserve
// the current licensed Wikimedia flow and its Word-export compatibility.
export async function handlePictureSearch(request, corsHeaders = {}, env = {}, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/pictures/search' || url.searchParams.get('discover') !== '1' || !String(env.BRAVE_SEARCH_API_KEY || '').trim()) {
    return CommonsPictures.handlePictureSearch(request, corsHeaders, fetcher);
  }
  const q = (url.searchParams.get('q') || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 80 || !/^[\p{L}\p{M}\p{N} -]+$/u.test(q))
    return Response.json({code:'PICTURE_SEARCH_UNAVAILABLE',error:'Enter a short picture subject.'},{status:400,headers:corsHeaders});
  try {
    const endpoint = new URL('https://api.search.brave.com/res/v1/images/search');
    endpoint.searchParams.set('q', q + ' black and white outline clipart');
    endpoint.searchParams.set('count', '50');
    endpoint.searchParams.set('safesearch', 'strict');
    const result = await fetcher(endpoint.toString(), {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(12000),
      headers:{'Accept':'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY}
    });
    if (!result.ok) throw Error('provider unavailable');
    const data = await result.json();
    // Search-engine results do not establish reuse rights or verify the image
    // contents. Expose them for discovery/review only; never silently embed
    // an unlicensed remote thumbnail in a distributed Word document.
    const results = (Array.isArray(data.results) ? data.results : []).slice(0,50).map(item => {
      const title = String(item.title || '').replace(/<[^>]*>/g,'').slice(0,160);
      const sourceUrl = String(item.url || '');
      const previewUrl = String(item.thumbnail?.src || '');
      if (!/^https:\/\//.test(sourceUrl) || !/^https:\/\//.test(previewUrl)) return null;
      return {title, label:title, sourceUrl, previewUrl, license:'Unverified', confident:false, provider:'brave'};
    }).filter(Boolean).slice(0,24);
    if (results.length) return Response.json({query:q,results,provider:'brave'}, {headers:{...corsHeaders,'Cache-Control':'no-store'}});
  } catch (_) { /* Search fallback does not expose credentials or upstream errors. */ }
  return CommonsPictures.handlePictureSearch(request,corsHeaders,fetcher);
}
