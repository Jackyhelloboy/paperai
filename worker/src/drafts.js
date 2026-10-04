// PaperAI drafts: build one document page by page over many sessions.
//
// A draft is a list of pages. Each page holds the OCR text plus a copy of the
// page photo in R2. A draft and its photos are always deleted together 24 hours
// after the draft was created. Nothing is kept longer, so the stored photos never
// accumulate and the free storage allowance is effectively unlimited.
//
// There is no login. A draft is reachable only by its unguessable id, and every
// read and write must present the same owner key. That keeps a draft private
// without accounts, but it is not a password: anyone who obtains both the draft
// id and the owner key can read it. Do not treat a draft link as a secret.

const TTL_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PAGES_PER_DRAFT = 200;
const MAX_DRAFTS_PER_OWNER = 40;
const OWNER_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const PAGE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const now = () => Date.now();

function json(data, status, corsHeaders) {
  return Response.json(data, { status: status || 200, headers: corsHeaders });
}

function fail(message, status, corsHeaders, code) {
  return Response.json(
    code ? { error: message, code } : { error: message },
    { status: status || 400, headers: corsHeaders }
  );
}

function readOwnerKey(request, url) {
  const raw = request.headers.get('X-PaperAI-Owner') || url.searchParams.get('owner') || '';
  const key = String(raw).trim();
  return OWNER_PATTERN.test(key) ? key : null;
}

function requireOwner(request, url, corsHeaders) {
  const key = readOwnerKey(request, url);
  return key ? { ok: true, key } : { ok: false, response: fail('Missing or invalid owner key.', 401, corsHeaders, 'OWNER_REQUIRED') };
}

function newId() {
  return crypto.randomUUID();
}

function expiresAt() {
  return now() + TTL_DAYS * MS_PER_DAY;
}

// ── reads ────────────────────────────────────────────────────────────────────

async function loadDraft(env, draftId, ownerKey) {
  const draft = await env.DB.prepare(
    'SELECT id, owner_key, title, status, created_at, updated_at, expires_at FROM drafts WHERE id = ?'
  ).bind(draftId).first();
  if (!draft || draft.owner_key !== ownerKey) return null;
  return draft;
}

function serialiseDraft(draft) {
  return {
    id: draft.id,
    title: draft.title || '',
    status: draft.status,
    page_count: Number(draft.page_count) || 0,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    expires_at: draft.expires_at,
  };
}

function serialisePage(row) {
  return {
    id: row.id,
    draft_id: row.draft_id,
    position: Number(row.position),
    source_name: row.source_name || '',
    has_image: Boolean(row.image_key),
    image_bytes: Number(row.image_bytes) || 0,
    ocr_text: row.ocr_text || '',
    edited_text: row.edited_text == null ? null : row.edited_text,
    text: row.edited_text == null ? (row.ocr_text || '') : row.edited_text,
    page_profile: row.page_profile || '',
    reading: row.reading || '',
    state: row.state,
    updated_at: row.updated_at,
  };
}

async function listPages(env, draftId) {
  const result = await env.DB.prepare(
    'SELECT id, draft_id, position, source_name, image_key, image_bytes, ocr_text, edited_text, page_profile, reading, state, updated_at FROM draft_pages WHERE draft_id = ? ORDER BY position ASC'
  ).bind(draftId).all();
  return result.results || [];
}

// Marks the draft as just used without moving its expiry date. The 24 hours run
// from the moment the draft was created, because R2 deletes each photo a day
// after it is uploaded and that timer cannot be restarted.
async function touchDraft(env, draftId) {
  await env.DB.prepare('UPDATE drafts SET updated_at = ? WHERE id = ?')
    .bind(now(), draftId).run();
}

async function nextPosition(env, draftId) {
  const row = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) AS top FROM draft_pages WHERE draft_id = ?')
    .bind(draftId).first();
  return Number(row?.top ?? -1) + 1;
}

// ── images ───────────────────────────────────────────────────────────────────

function imageKeyFor(draftId, pageId) {
  return draftId + '/' + pageId + '.jpg';
}

async function storePageImage(env, draftId, pageId, file) {
  if (!env.PAGES_BUCKET) return { key: null, bytes: 0 };
  const type = String(file.type || '');
  if (!/^image\/(?:jpeg|jpg|png|webp)$/i.test(type)) {
    throw Object.assign(new Error('Page photo must be a JPEG, PNG or WebP image.'), { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > PAGE_IMAGE_MAX_BYTES) {
    throw Object.assign(new Error('That page photo is larger than 3 MB. Please use a smaller photo.'), { status: 413 });
  }
  const key = imageKeyFor(draftId, pageId);
  await env.PAGES_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: type },
    customMetadata: { draft: draftId, page: pageId }
  });
  return { key, bytes: bytes.byteLength };
}

async function deleteImage(env, key) {
  if (!key || !env.PAGES_BUCKET) return;
  try { await env.PAGES_BUCKET.delete(key); } catch (_) {}
}

async function deleteDraftImages(env, draftId) {
  if (!env.PAGES_BUCKET) return;
  try {
    let cursor;
    do {
      const listed = await env.PAGES_BUCKET.list({ prefix: draftId + '/', cursor });
      const keys = (listed.objects || []).map(o => o.key);
      if (keys.length) await env.PAGES_BUCKET.delete(keys);
      cursor = listed.truncated ? listed.cursor : null;
    } while (cursor);
  } catch (e) {
    console.log('[Drafts] image cleanup failed:', e?.message || e);
  }
}

// ── endpoints ────────────────────────────────────────────────────────────────

async function createDraft(request, env, corsHeaders) {
  const owner = requireOwner(request, new URL(request.url), corsHeaders);
  if (!owner.ok) return owner.response;

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS total FROM drafts WHERE owner_key = ?')
    .bind(owner.key).first();
  if (Number(countRow?.total || 0) >= MAX_DRAFTS_PER_OWNER) {
    return fail('You already have ' + MAX_DRAFTS_PER_OWNER + ' drafts. Delete one before starting another.', 409, corsHeaders, 'DRAFT_LIMIT_REACHED');
  }

  let title = '';
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      title = String(body?.title || '').slice(0, 120);
    } catch (_) {}
  }

  const id = newId();
  const stamp = now();
  await env.DB.prepare(
    'INSERT INTO drafts (id, owner_key, title, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, owner.key, title, 'building', stamp, stamp, expiresAt()).run();

  return json({ draft: { id, title, status: 'building', page_count: 0, created_at: stamp, updated_at: stamp, expires_at: expiresAt() } }, 201, corsHeaders);
}

async function listDrafts(request, env, corsHeaders, url) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const result = await env.DB.prepare(
    'SELECT d.id, d.title, d.status, d.created_at, d.updated_at, d.expires_at, (SELECT COUNT(*) FROM draft_pages p WHERE p.draft_id = d.id) AS page_count FROM drafts d WHERE d.owner_key = ? ORDER BY d.updated_at DESC LIMIT 100'
  ).bind(owner.key).all();

  return json({ drafts: (result.results || []).map(serialiseDraft) }, 200, corsHeaders);
}

async function getDraft(request, env, corsHeaders, url, draftId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  const pages = await listPages(env, draftId);
  const result = await env.DB.prepare('SELECT COUNT(*) AS total FROM draft_pages WHERE draft_id = ?').bind(draftId).first();

  return json({
    draft: serialiseDraft({ ...draft, page_count: Number(result?.total || 0) }),
    pages: pages.map(serialisePage),
    limits: { max_pages: MAX_PAGES_PER_DRAFT, max_drafts: MAX_DRAFTS_PER_OWNER, ttl_days: TTL_DAYS }
  }, 200, corsHeaders);
}

async function renameDraft(request, env, corsHeaders, url, draftId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  let title = '';
  try {
    const body = await request.json();
    title = String(body?.title || '').slice(0, 120);
  } catch (_) {
    return fail('Expected a JSON body with a title.', 400, corsHeaders);
  }

  await env.DB.prepare('UPDATE drafts SET title = ?, updated_at = ? WHERE id = ?')
    .bind(title, now(), draftId).run();

  return json({ draft: { id: draftId, title, status: draft.status, page_count: 0, created_at: draft.created_at, updated_at: now(), expires_at: draft.expires_at } }, 200, corsHeaders);
}

async function deleteDraft(request, env, corsHeaders, url, draftId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  const pages = await listPages(env, draftId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM draft_pages WHERE draft_id = ?').bind(draftId),
    env.DB.prepare('DELETE FROM drafts WHERE id = ?').bind(draftId)
  ]);
  await deleteDraftImages(env, draftId);

  return json({ deleted: true, pages_removed: pages.length }, 200, corsHeaders);
}

async function addPage(request, env, corsHeaders, url, draftId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS total FROM draft_pages WHERE draft_id = ?').bind(draftId).first();
  if (Number(countRow?.total || 0) >= MAX_PAGES_PER_DRAFT) {
    return fail('This draft already has the maximum of ' + MAX_PAGES_PER_DRAFT + ' pages.', 409, corsHeaders, 'PAGE_LIMIT_REACHED');
  }

  const form = await request.formData();
  const file = form.get('file');
  const text = String(form.get('text') || '');
  const sourceName = String(form.get('source_name') || '').slice(0, 160);
  const profile = String(form.get('page_profile') || '').slice(0, 400);

  const pageId = newId();
  let image = { key: null, bytes: 0 };
  if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
    try {
      image = await storePageImage(env, draftId, pageId, file);
    } catch (e) {
      return fail(e.message || 'Could not store that page photo.', e.status || 400, corsHeaders, 'IMAGE_REJECTED');
    }
  }

  const stamp = now();
  const position = await nextPosition(env, draftId);
  await env.DB.prepare(
    'INSERT INTO draft_pages (id, draft_id, position, source_name, image_key, image_bytes, ocr_text, edited_text, page_profile, reading, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)'
  ).bind(pageId, draftId, position, sourceName, image.key, image.bytes, text, profile, text ? 'ready' : 'pending', stamp, stamp).run();
  await touchDraft(env, draftId);

  const pages = await listPages(env, draftId);
  return json({ page: serialisePage(pages.find(p => p.id === pageId)), page_count: pages.length }, 201, corsHeaders);
}

async function updatePage(request, env, corsHeaders, url, draftId, pageId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  const existing = await env.DB.prepare('SELECT * FROM draft_pages WHERE id = ? AND draft_id = ?').bind(pageId, draftId).first();
  if (!existing) return fail('Page not found.', 404, corsHeaders, 'PAGE_NOT_FOUND');

  const contentType = String(request.headers.get('content-type') || '');

  // JSON: save a Teach correction for this page only.
  if (contentType.includes('application/json')) {
    let body;
    try { body = await request.json(); } catch (_) { return fail('Expected a JSON body.', 400, corsHeaders); }
    if (!Object.prototype.hasOwnProperty.call(body || {}, 'edited_text')) {
      return fail('Expected an edited_text field.', 400, corsHeaders);
    }
    const edited = body.edited_text == null ? null : String(body.edited_text);
    await env.DB.prepare('UPDATE draft_pages SET edited_text = ?, updated_at = ? WHERE id = ? AND draft_id = ?')
      .bind(edited, now(), pageId, draftId).run();
    await touchDraft(env, draftId);
    const pages = await listPages(env, draftId);
    return json({ page: serialisePage(pages.find(p => p.id === pageId)) }, 200, corsHeaders);
  }

  // Multipart: the page photo was wrong, so read it again and swap it in place.
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
    return fail('Send the new page photo as a file.', 400, corsHeaders);
  }
  const text = String(form.get('text') || '');
  const profile = String(form.get('page_profile') || '').slice(0, 400);

  let image;
  try {
    image = await storePageImage(env, draftId, pageId, file);
  } catch (e) {
    return fail(e.message || 'Could not store that page photo.', e.status || 400, corsHeaders, 'IMAGE_REJECTED');
  }

  await env.DB.prepare(
    'UPDATE draft_pages SET image_key = ?, image_bytes = ?, ocr_text = ?, edited_text = NULL, page_profile = ?, reading = NULL, state = ?, source_name = ?, updated_at = ? WHERE id = ? AND draft_id = ?'
  ).bind(image.key, image.bytes, text, profile, text ? 'ready' : 'pending', String(form.get('source_name') || existing.source_name || '').slice(0, 160), now(), pageId, draftId).run();
  await touchDraft(env, draftId);

  const pages = await listPages(env, draftId);
  return json({ page: serialisePage(pages.find(p => p.id === pageId)) }, 200, corsHeaders);
}

async function deletePage(request, env, corsHeaders, url, draftId, pageId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  const existing = await env.DB.prepare('SELECT * FROM draft_pages WHERE id = ? AND draft_id = ?').bind(pageId, draftId).first();
  if (!existing) return fail('Page not found.', 404, corsHeaders, 'PAGE_NOT_FOUND');

  await env.DB.prepare('DELETE FROM draft_pages WHERE id = ? AND draft_id = ?').bind(pageId, draftId).run();
  await deleteImage(env, existing.image_key);
  await compactPositions(env, draftId);
  await touchDraft(env, draftId);

  const pages = await listPages(env, draftId);
  return json({ deleted: true, pages: pages.map(serialisePage) }, 200, corsHeaders);
}

async function compactPositions(env, draftId) {
  const pages = await listPages(env, draftId);
  const statements = pages.map((page, index) =>
    env.DB.prepare('UPDATE draft_pages SET position = ? WHERE id = ? AND draft_id = ?').bind(index, page.id, draftId)
  );
  if (statements.length) await env.DB.batch(statements);
}

async function reorderPages(request, env, corsHeaders, url, draftId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  let order;
  try {
    const body = await request.json();
    order = Array.isArray(body?.order) ? body.order.map(String) : null;
  } catch (_) { order = null; }
  if (!order) return fail('Expected an order array of page ids.', 400, corsHeaders);

  const pages = await listPages(env, draftId);
  const known = new Set(pages.map(p => p.id));
  if (order.length !== pages.length || order.some(id => !known.has(id))) {
    return fail('The new page order must list every page in this draft exactly once.', 400, corsHeaders, 'ORDER_MISMATCH');
  }

  await env.DB.batch(order.map((id, index) =>
    env.DB.prepare('UPDATE draft_pages SET position = ? WHERE id = ? AND draft_id = ?').bind(index, id, draftId)
  ));
  await touchDraft(env, draftId);

  const updated = await listPages(env, draftId);
  return json({ pages: updated.map(serialisePage) }, 200, corsHeaders);
}

async function getPageImage(request, env, corsHeaders, url, draftId, pageId) {
  const owner = requireOwner(request, url, corsHeaders);
  if (!owner.ok) return owner.response;

  const page = await env.DB.prepare('SELECT image_key FROM draft_pages WHERE id = ? AND draft_id = ?').bind(pageId, draftId).first();
  if (!page || !page.image_key) return fail('No photo stored for that page.', 404, corsHeaders, 'IMAGE_NOT_FOUND');
  if (!env.PAGES_BUCKET) return fail('Page photo storage is not available.', 503, corsHeaders, 'STORAGE_UNAVAILABLE');

  const draft = await loadDraft(env, draftId, owner.key);
  if (!draft) return fail('Draft not found.', 404, corsHeaders, 'DRAFT_NOT_FOUND');

  const object = await env.PAGES_BUCKET.get(page.image_key);
  if (!object) return fail('No photo stored for that page.', 404, corsHeaders, 'IMAGE_NOT_FOUND');

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=86400');
  return new Response(object.body, { headers });
}

// ── scheduled cleanup ────────────────────────────────────────────────────────

// Runs once a day. The R2 lifecycle rule removes the photos; this removes the
// rows and drafts that pointed at them, so a draft never outlives its own photo.
export async function purgeExpiredDrafts(env) {
  const stamp = now();

  const drafts = await env.DB.prepare('SELECT id FROM drafts WHERE expires_at < ? LIMIT 200').bind(stamp).all();
  const stale = drafts.results || [];
  for (const draft of stale) await deleteDraftImages(env, draft.id);

  const orphanPages = await env.DB.prepare(
    'SELECT p.id, p.image_key FROM draft_pages p LEFT JOIN drafts d ON d.id = p.draft_id WHERE d.id IS NULL OR p.updated_at < ? LIMIT 500'
  ).bind(stamp - TTL_DAYS * MS_PER_DAY).all();
  for (const page of (orphanPages.results || [])) await deleteImage(env, page.image_key);

  if (stale.length) {
    const ids = stale.map(d => d.id);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM draft_pages WHERE draft_id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids),
      env.DB.prepare('DELETE FROM drafts WHERE id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids)
    ]);
  }

  const orphanIds = (orphanPages.results || []).map(p => p.id);
  if (orphanIds.length) {
    for (let i = 0; i < orphanIds.length; i += 50) {
      const slice = orphanIds.slice(i, i + 50);
      await env.DB.prepare('DELETE FROM draft_pages WHERE id IN (' + slice.map(() => '?').join(',') + ')').bind(...slice).run();
    }
  }

  return { drafts_removed: stale.length, pages_removed: orphanIds.length };
}

// ── router ───────────────────────────────────────────────────────────────────

export async function handleDrafts(request, env, corsHeaders, url) {
  if (url.pathname === '/api/drafts' && request.method === 'POST') return createDraft(request, env, corsHeaders);
  if (url.pathname === '/api/drafts' && request.method === 'GET') return listDrafts(request, env, corsHeaders, url);
  if (url.pathname === '/api/drafts/purge' && request.method === 'POST') return purgeRoute(request, env, corsHeaders);

  let match = url.pathname.match(/^\/api\/drafts\/([A-Za-z0-9-]{8,64})$/);
  if (match) {
    const draftId = match[1];
    if (request.method === 'GET') return getDraft(request, env, corsHeaders, url, draftId);
    if (request.method === 'PATCH') return renameDraft(request, env, corsHeaders, url, draftId);
    if (request.method === 'DELETE') return deleteDraft(request, env, corsHeaders, url, draftId);
  }

  match = url.pathname.match(/^\/api\/drafts\/([A-Za-z0-9-]{8,64})\/pages$/);
  if (match && request.method === 'POST') return addPage(request, env, corsHeaders, url, match[1]);

  match = url.pathname.match(/^\/api\/drafts\/([A-Za-z0-9-]{8,64})\/reorder$/);
  if (match && request.method === 'POST') return reorderPages(request, env, corsHeaders, url, match[1]);

  match = url.pathname.match(/^\/api\/drafts\/([A-Za-z0-9-]{8,64})\/pages\/([A-Za-z0-9-]{8,64})$/);
  if (match) {
    if (request.method === 'PUT') return updatePage(request, env, corsHeaders, url, match[1], match[2]);
    if (request.method === 'DELETE') return deletePage(request, env, corsHeaders, url, match[1], match[2]);
  }

  match = url.pathname.match(/^\/api\/drafts\/([A-Za-z0-9-]{8,64})\/pages\/([A-Za-z0-9-]{8,64})\/image$/);
  if (match && request.method === 'GET') return getPageImage(request, env, corsHeaders, url, match[1], match[2]);

  return fail('Unknown drafts route.', 404, corsHeaders, 'NOT_FOUND');
}

async function purgeRoute(request, env, corsHeaders) {
  const result = await purgeExpiredDrafts(env);
  return json({ purged: true, ...result }, 200, corsHeaders);
}