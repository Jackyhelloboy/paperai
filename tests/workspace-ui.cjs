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
assert(results.includes('id="copyTextBtn"'), 'Copy must remain directly visible in the result toolbar');
assert(results.includes('>Extracted</button>') && results.includes('>Plain text</button>'), 'Extracted and plain text remain directly available');
assert(results.includes('id="teachActionBtn"') && /\bTeach\b/.test(results), 'Teach must be restored as a primary action');
assert(results.includes('id="aiSuggestionEditor"'), 'Teach must include a separate editable AI suggestion box');
assert(results.includes('onclick="applyEditedAiSuggestion()"'), 'AI suggestion text must require an explicit apply action');
assert(!results.includes('<div class="teach-title">'), 'Legacy standalone edit-card title must be removed');
assert(!results.includes('class="teach-actions"'), 'Legacy Save/Done button row must be removed');

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
assert(css.includes('max-height:84px !important'), 'Phone source previews must stay small and compact');
assert(css.includes('grid-template-columns:repeat(4,minmax(0,1fr)) !important'), 'Phone source previews use a compact multi-column grid');
assert(css.includes('.document-toolbar { flex-direction:column !important;'), 'Mobile keeps tabs and primary actions readable without hiding them');
assert(css.includes('.teach-primary-btn'), 'Teach receives clear primary-action styling');
assert(css.includes('.flagged-card {\n            display: none !important;'), 'Technical review cards must not clutter the primary workspace');

console.log('Teach-first workspace keeps previews compact, exposes core actions, and makes AI suggestions editable before apply.');
