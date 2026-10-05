const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');

const resultsStart = html.indexOf('<div class="results" id="resBox">');
const resultsEnd = html.indexOf('</main>', resultsStart);
const results = html.slice(resultsStart, resultsEnd);

assert(results.includes('id="outputCard"'), 'Results must use one document workspace');
assert(results.includes('id="documentStatus"'), 'Workspace must expose one compact document status');
assert(results.indexOf('id="teachPanel"') > results.indexOf('id="outputCard"'), 'Editor belongs inside the document workspace');
assert(results.indexOf('id="teachPanel"') < results.indexOf('id="textOut"'), 'Inline editor replaces the preview surface instead of opening another card');
assert(results.includes('class="document-more"'), 'Secondary actions must live in one compact More menu');
assert(results.includes('>Preview</button>') && results.includes('>Plain text</button>'), 'Preview and plain text remain available');
assert(results.includes('id="teachActionBtn"') && /\bEdit\b/.test(results), 'Primary edit action remains visible');
assert(!results.includes('<div class="teach-title">'), 'Legacy standalone edit-card title must be removed');
assert(!results.includes('class="teach-actions"'), 'Legacy Save/Done button row must be removed');

const draftStart = html.indexOf('<div class="drafts-card" id="draftsCard">');
const draftEnd = html.indexOf('<div class="results" id="resBox">', draftStart);
const draft = html.slice(draftStart, draftEnd);
assert(draft.includes('<section class="draft-sources"'), 'Source pages must stay directly visible');
assert(!draft.includes('<details class="draft-sources"'), 'Source pages must not be hidden behind disclosure');
assert(draft.includes('class="draft-document-menu"'), 'Close and delete belong in the document overflow menu');
assert(draft.includes('id="draftAddBtn"') && draft.includes('>+ Add</button>'), 'Add pages stays directly available with the compact mobile label');

const renderStart = html.indexOf('function renderDraftPages() {');
const renderEnd = html.indexOf('\nasync function loadDraftList()', renderStart);
const render = html.slice(renderStart, renderEnd);
assert(render.includes('class="draft-page-menu"'), 'Each source page must use one compact page menu');
assert(render.includes('data-page-preview'), 'Source thumbnails must open the full preview');
assert(!render.includes('class="draft-page-text"'), 'Long OCR snippets must not clutter source thumbnails');

const css = html.slice(html.indexOf('/* v43 mobile UI rebuild'));
assert(css.includes('.main.workflow-active[data-view="result"]'), 'Result mode must have a focused mobile document layout');
assert(css.includes('grid-auto-columns: 72px !important'), 'Saved source pages use a compact swipe rail on phones');
assert(css.includes('grid-auto-columns: 96px !important'), 'New upload previews use compact swipe thumbnails');
assert(css.includes('position: fixed !important') && css.includes('.document-toolbar'), 'Primary document actions stay in a fixed bottom bar');
assert(css.includes('height: calc(100dvh - 166px - env(safe-area-inset-bottom)) !important'), 'Mobile editing stays inside the phone viewport');
assert(css.includes('.main.editing-document .drafts-card'), 'Edit mode removes source/navigation chrome so the text gets the screen');
assert(css.includes('.quota-card') && css.includes('display: none !important'), 'Technical quota card is removed from the mobile primary flow');
assert(results.includes('class="document-menu-action mobile-view-action"'), 'Preview and Plain text remain available inside More on mobile');
assert(html.includes('id="savedPapersToggle"') && html.includes('id="draftLibrary"'), 'Saved papers remain available behind one compact opt-in row');
assert(css.includes('.flagged-card') && css.includes('.paper-marks'), 'Technical review metadata stays out of the mobile workspace');

console.log('Mobile workspace is a clean scan/document flow with swipe previews, bottom actions, focused editing and opt-in saved papers.');
