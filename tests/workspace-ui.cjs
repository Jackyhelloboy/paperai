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
assert(results.includes('>Extracted</button>') && results.includes('>Plain text</button>'), 'Extracted and plain text remain available');
assert(results.includes('id="teachActionBtn"') && /\bEdit\b/.test(results), 'Primary edit action remains visible');
assert(!results.includes('<div class="teach-title">'), 'Legacy standalone edit-card title must be removed');
assert(!results.includes('class="teach-actions"'), 'Legacy Save/Done button row must be removed');
assert(results.includes('id="aiSuggestionEditor"'), 'AI suggestions must have a separate editable text box');
assert(results.includes('id="aiSuggestionApplyBtn"'), 'Editable AI suggestions must have an explicit apply action');
assert(results.includes('onclick="applyEditedAiSuggestion()"'), 'AI suggestion apply action must be wired explicitly');

const draftStart = html.indexOf('<div class="drafts-card" id="draftsCard">');
const draftEnd = html.indexOf('<div class="results" id="resBox">', draftStart);
const draft = html.slice(draftStart, draftEnd);
assert(draft.includes('<section class="draft-sources"'), 'Source pages must stay directly visible');
assert(!draft.includes('<details class="draft-sources"'), 'Source pages must not be hidden behind disclosure');
assert(draft.includes('class="draft-document-menu"'), 'Close and delete belong in the document overflow menu');
assert(draft.includes('id="draftAddBtn"') && draft.includes('+ Add pages'), 'Add pages stays directly available');

const renderStart = html.indexOf('function renderDraftPages() {');
const renderEnd = html.indexOf('\nasync function loadDraftList()', renderStart);
const render = html.slice(renderStart, renderEnd);
assert(render.includes('class="draft-page-menu"'), 'Each source page must use one compact page menu');
assert(render.includes('data-page-preview'), 'Source thumbnails must open the full preview');
assert(!render.includes('class="draft-page-text"'), 'Long OCR snippets must not clutter source thumbnails');

const css = html.slice(html.indexOf('/* v41 unified document workspace */'));
assert(css.includes('.main.workflow-active[data-view="result"]'), 'Result mode must have a dedicated focused layout');
assert(css.includes('.output-card.editing .output-body'), 'Editing must happen in the same preview workspace');
assert(css.includes('grid-auto-columns: 82px !important'), 'Phone source previews must use a compact swipe rail instead of a tall grid');
assert(css.includes('overflow-x: auto !important'), 'Phone source previews remain reachable by horizontal swipe');
assert(css.includes('height: calc(100dvh - 145px) !important'), 'Mobile editing must stay inside a viewport-sized text scroller');
assert(css.includes('.output-tabs {\n                display: flex !important;'), 'Mobile keeps Extracted/Plain text tabs directly reachable while editing');
assert(results.includes('class="document-menu-action mobile-view-action"'), 'Extracted and Plain text remain available inside More as a secondary route');
assert(css.includes('.flagged-card {\n            display: none !important;'), 'Technical review cards must not clutter the primary workspace');

console.log('Unified workspace keeps source previews visible, adds editable AI suggestions, and keeps Extracted/Plain text synchronized and reachable.');
