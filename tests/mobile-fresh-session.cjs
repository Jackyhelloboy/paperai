const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('frontend/index.html','utf8');

assert(html.includes('/* v43 mobile UI rebuild'), 'Latest mobile rebuild stylesheet must be present');
assert(!html.includes('/* v42 mobile-first simplification'), 'Old mobile patch layer must be removed');

assert(html.includes('function clearTransientBrowserSession()'), 'Reload must clear transient browser state');
assert(html.includes('localStorage.removeItem(ACTIVE_PAPER_STORAGE)'), 'Active paper pointer must clear on full reload');
assert(html.includes('localStorage.removeItem(PENDING_SOURCE_STORAGE)'), 'Pending page recovery must clear on full reload');
assert(html.includes("key.startsWith('paperai_unsaved_paper_v2_')"), 'Unsaved browser recovery copies must clear on full reload');
assert(html.includes('discardStaleSessionDraftOnLoad().finally(loadDraftList);'), 'Temporary scan draft must be discarded before the saved-paper library is shown');
assert(!html.includes("if (id && draftItems.some(draft => draft.id === id)) openDraft(id);"), 'Reload must never reopen the previous paper automatically');

assert(html.includes('id="savedPapersToggle"'), 'Saved papers must be opt-in on mobile');
assert(html.includes('id="keepPaperBtn"'), 'Temporary scans must have an explicit Save paper action');
assert(html.includes("markSessionAutoDraft(activeDraft.id)"), 'Automatically-created scan drafts must be marked temporary');
assert(html.includes("markSessionAutoDraft('')"), 'Temporary marker must be removable when the user saves a paper');
assert(html.includes("$('extractionBack').onclick = returnToStart;"), 'Back must use the temporary-session cleanup path');

const css = html.slice(html.indexOf('/* v43 mobile UI rebuild'));
assert(css.includes('.quota-card') && css.includes('display: none !important'), 'Mobile start screen must hide technical quota UI');
assert(css.includes('.saved-papers-toggle'), 'Saved papers must collapse to one clean row');
assert(css.includes('grid-auto-columns: 96px !important'), 'Upload pages must use a compact swipe rail');
assert(css.includes('grid-auto-columns: 72px !important'), 'Saved source pages must use a compact swipe rail');
assert(css.includes('.document-toolbar') && css.includes('position: fixed !important'), 'Result actions must stay in one fixed bottom bar');
assert(css.includes('.main.editing-document .drafts-card'), 'Edit mode must hide surrounding page chrome');
assert(css.includes('height: calc(100dvh - 166px - env(safe-area-inset-bottom)) !important'), 'Editor must fit the mobile viewport');

console.log('Mobile UI starts fresh, keeps scans temporary by default, and uses one clean document workspace.');
