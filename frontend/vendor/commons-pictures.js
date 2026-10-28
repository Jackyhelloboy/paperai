(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PaperAICommons=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
// Public-domain/CC0 educational picture retrieval. Never fetch a caller's URL.
// MediaWiki API: https://www.mediawiki.org/wiki/API:Imageinfo
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const MAX_BYTES = 4 * 1024 * 1024;
const unsafe = /\b(?:porn|nude|naked|sexual|genital|gore|corpse|fetish|hentai)\b/i;
const unrelated = /\b(?:dead|hunt|hunting|skeleton|dissected|digesting|aircraft|netsuke|adhesive|logo|illusion|stamp contest|patent|grinder|blossoms|industries|cotton|textile)\b/i;
const outlineSearchPhrases = subject => [
  subject + ' black and white outline clipart',
  subject + ' black and white line drawing',
  subject + ' outline coloring page',
  subject + ' drawing'
];
const schoolSubjects = new Set(['duck','apple','fish','banana','cherry','coconut','fig','grapes','guava','lemon','mango','papaya','peach','pear','pineapple','plum','pomegranate','strawberry','watermelon','cat','dog','cow','lion','elephant','fruit']);
const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
const words = value => plain(value).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];

function uploadURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname) ||
      !url.pathname.startsWith('/wikipedia/commons/') || url.username || url.password || url.port || url.hash) return null;
    // Current Imageinfo URLs include tracking parameters; no query is needed for pixels.
    url.search = '';
    return url.href;
  } catch (_) { return null; }
}
function candidate(page, query = '') {
  const info = page.imageinfo?.[0], meta = info?.extmetadata || {};
  if (!info || page.ns !== 6 || !String(page.title).startsWith('File:')) return null;
  // The CC0 notice on Commons metadata is NOT the image's license.
  const license = plain(meta.LicenseShortName?.value);
  if (!/^(?:CC0(?: 1\.0)?|Public domain)$/i.test(license) ||
      /true/i.test(String(meta.AttributionRequired?.value)) || plain(meta.Restrictions?.value)) return null;
  const image = uploadURL(info.thumburl || info.url);
  const mime = info.thumbmime || info.mime;
  const width = Number(info.thumbwidth || info.width), height = Number(info.thumbheight || info.height);
  if (!image || !/^image\/(png|jpeg|webp)$/.test(mime || '') || width < 180 || height < 140 ||
      width > 1600 || height > 1600 || width / height > 3 || height / width > 3) return null;
  const title = plain(page.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''));
  const description = plain(meta.ImageDescription?.value);
  if (unsafe.test(title + ' ' + description) || (unrelated.test(title) && !unrelated.test(query))) return null;
  const terms = words(query), titleWords = words(title.replace(/_/g, ' ')), descriptionWords = words(description);
  const matched = terms.filter(term => titleWords.includes(term)).length;
  const relevant = !terms.length || terms.every(term => titleWords.includes(term) || descriptionWords.includes(term));
  if (!relevant) return null;
  const simple = /drawing|illustration|clip.?art|outline|isolated|white background/i.test(title + ' ' + description);
  const outlineStyle = /outline|line[ -]?art|line drawing|black and white|black-and-white|colouring|coloring|clip.?art/i.test(title + ' ' + description);
  // Filename relevance is not the same as visual correctness. Distinguish an
  // exact depicted subject from a labelled diagram, collection or scene.
  // Auto-insertion must not rely on description-only matches or a compound
  // ambiguous title; those candidates stay available in the teacher picker.
  const allowedTitleModifiers = /^(?:a|an|the|simple|clean|clear|black|white|and|of|on|isolated|outline|outlined|drawing|illustration|clipart|clip|art|picture|photo|photograph|icon|coloring|colouring|page|public|domain|psf|png|jpg|jpeg|webp|transparent|background|side|view|single|one|animal|fruit)$/i;
  const extraTitleWords=titleWords.filter(word=>!terms.includes(word)&&!allowedTitleModifiers.test(word));
  const autoSafe=terms.length>0 && matched===terms.length && extraTitleWords.length===0;
  return {title: page.title, label: title, width, height, license,
    creator: plain(meta.Artist?.value), sourceUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')),
    assetUrl: '/api/pictures/asset?title=' + encodeURIComponent(page.title),
    // A conservative text match, not a claim of visual verification.
    confident: autoSafe,
    score: matched * 10 + (autoSafe ? 40 : 0) + (outlineStyle ? 24 : 0) + (/\(PSF\)/i.test(title)?30:0) + (/drawing|illustration|clip.?art|outline/i.test(title)?10:0) + (simple ? 6 : 0) - Math.abs(Math.log(width / height)), image, mime};
}
async function metadata(params, fetcher) {
  const url = new URL(COMMONS);
  const all = {origin: '*', action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
    iiprop: 'url|size|mime|thumbmime|extmetadata', iiurlwidth: '960', iiurlheight: '960',
    iiextmetadatafilter: 'LicenseShortName|AttributionRequired|Restrictions|Artist|ImageDescription', ...params};
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
  const response = await fetcher(url.href, {redirect: 'error', signal: AbortSignal.timeout(15000),
    credentials: 'omit', headers: typeof window === 'undefined' ? {'User-Agent': 'PaperAI/1.0 (https://github.com/Jackyhelloboy/paperai)'} : {}, cf: {cacheTtl: 1800, cacheEverything: true}});
  if (!response.ok) throw new Error('PICTURE_SOURCE_HTTP_' + response.status);
  const data = await response.json();
  if (data.error || !Array.isArray(data.query?.pages)) return [];
  return data.query.pages;
}
function publicCandidate(item) { const {image, mime, score, ...result} = item; return {...result, previewUrl: image}; }
async function limitedBytes(response) {
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw new Error('Image too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty image');
  let length = 0; const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('Image too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}
function realImage(bytes, mime) {
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n);
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return mime === 'image/webp' && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
}

async function handlePictureSearch(request, corsHeaders = {}, fetcher = (...args) => fetch(...args)) {
  const url = new URL(request.url);
  const fail = (message, status = 503, sourceStatus = undefined) => Response.json({code: 'PICTURE_SEARCH_UNAVAILABLE', error: message, source_status: sourceStatus},
    {status, headers: {...corsHeaders, 'Cache-Control': 'no-store'}});
  if (request.method !== 'GET') return fail('Use GET for picture search.', 405);
  try {
    if (url.pathname === '/api/pictures/search') {
      const raw = url.searchParams.get('q') || '';
      const query = raw.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (query.length < 2 || query.length > 80 || raw.length > 120 || unsafe.test(query)) return fail('Enter a short school picture subject, such as duck or mango.', 400);
      const subject = query.toLowerCase();
      const lookups = outlineSearchPhrases(query).slice(0,3).map(phrase => metadata({generator: 'search', gsrnamespace: '6', gsrlimit: '20',
        gsrsearch: phrase}, fetcher));
      // The publisher's donated textbook illustrations are preferred when present.
      // Missing files simply disappear; every returned file still passes current licensing checks.
      if (schoolSubjects.has(subject)) lookups.push(metadata({titles: 'File:' + subject[0].toUpperCase() + subject.slice(1) + ' (PSF).png'}, fetcher));
      const lookedUp = await Promise.allSettled(lookups);
      if (lookedUp.every(result=>result.status==='rejected')) throw lookedUp[0].reason;
      let pages = lookedUp.filter(result=>result.status==='fulfilled').flatMap(result=>result.value);
      let items = pages.map(page => candidate(page, query)).filter(Boolean);
      // Styled searches may return relevant pictures but none safe for automatic
      // insertion. Also inspect a broader object-only search in that case.
      if (!items.some(item=>item.confident)) {
        try {
          const extra = await metadata({generator:'search',gsrnamespace:'6',gsrlimit:'50',gsrsearch:query},fetcher);
          items = items.concat(extra.map(page=>candidate(page,query)).filter(Boolean));
        } catch (_) { /* Keep the successful outline search results. */ }
      }
      const unique = [...new Map(items.map(item=>[item.title,item])).values()];
      const results = unique.sort((a,b) => b.score-a.score).slice(0,8).map(publicCandidate);
      return Response.json({query, results}, {headers: {...corsHeaders, 'Cache-Control': 'public, max-age=300'}});
    }
    if (url.pathname === '/api/pictures/asset') {
      const title = url.searchParams.get('title') || '';
      if (!/^File:[^|\[\]{}<>\r\n]{1,220}\.(?:png|jpe?g|webp|svg)$/i.test(title) || unsafe.test(title)) return fail('Choose a picture from the search results.', 400);
      const pages = await metadata({titles: title}, fetcher);
      const item = pages.map(page => candidate(page)).find(Boolean);
      if (!item) return fail('This picture is no longer available under a supported public-domain license.', 404);
      const response = await fetcher(item.image, {redirect: 'error', signal: AbortSignal.timeout(15000), cf: {cacheTtl: 86400, cacheEverything: true}});
      const mime = response.headers.get('Content-Type')?.split(';')[0];
      if (!response.ok || !/^image\/(png|jpeg|webp)$/.test(mime || '')) return fail('This picture could not be downloaded. Choose another result.', 502);
      const bytes = await limitedBytes(response);
      if (!realImage(bytes, mime)) return fail('This result did not contain a valid picture.', 502);
      return new Response(bytes, {headers: {...corsHeaders, 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff'}});
    }
    return fail('Picture route not found.', 404);
  } catch (error) {
    const status = /^PICTURE_SOURCE_HTTP_(\d{3})$/.exec(error?.message || '');
    return fail('Online pictures are temporarily unavailable. Retry or upload a picture.',503,status?Number(status[1]):undefined);
  }
}

async function search(query,fetcher){
 const response=await handlePictureSearch(new Request('https://paperai.invalid/api/pictures/search?q='+encodeURIComponent(query)),{},fetcher);
 const body=await response.json();
 if(!response.ok)throw new Error(body.error||'Online picture search unavailable.');
 return body.results;
}
async function download(item,fetcher){
 const response=await handlePictureSearch(new Request('https://paperai.invalid/api/pictures/asset?title='+encodeURIComponent(item.title)),{},fetcher);
 if(!response.ok)throw new Error('This picture could not be downloaded. Choose another result.');
 return response.blob();
}
return {handlePictureSearch,search,download};
});
