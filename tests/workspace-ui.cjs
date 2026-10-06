const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');

const resultsStart = html.indexOf('<div class="results" id="resBox">');
const resultsEnd = html.indexOf('</main>', resultsStart);
const results = html.slice(resultsStart, resultsEnd);

assert(results.includes('id="outputCard"'), 'Results must use one document workspace');
assert(results.includes('id="documentStatus"'), 'Workspace must expose one compact document status');
assert(results.indexOf('id="teachPanel"') < results.indexOf('id="outputCard"'), 'Classic Teach editor sits above the output tabs');
assert(results.indexOf('id="teachPanel"') < results.indexOf('id="textOut"'), 'Teach corrections remain separate from the extracted preview');
assert(results.includes('id="copyTextBtn"'), 'Copy must remain directly visible in the result toolbar');
assert(results.includes('>Extracted</button>') && results.includes('>Plain Text</button>'), 'Classic Extracted and Plain Text tabs are restored');
assert(results.includes('id="teachActionBtn"') && /\bTeach\b/.test(results), 'Teach must be restored as a primary action');
assert(results.includes('id="aiSuggestionEditor"'), 'Teach must include a separate editable AI suggestion box');
assert(results.includes('onclick="applyEditedAiSuggestion()"'), 'AI suggestion text must require an explicit apply action');
assert(!results.includes('<div class="teach-title">'), 'Legacy standalone edit-card title must be removed');
assert(!results.includes('class="teach-actions"'), 'Legacy Save/Done button row must be removed');

const draftStart = html.indexOf('<div class="drafts-card" id="draftsCard">');
const draftEnd = html.indexOf('<div class="results" id="resBox">', draftStart);
const draft = html.slice(draftStart, draftEnd);
assert(draft.includes('<details class="draft-sources" open>'), 'Classic source-pages disclosure is restored and open by default');
assert(draft.includes('id="draftCloseBtn"') && draft.includes('>Close</button>'), 'Classic Close control is directly visible');
assert(draft.includes('id="draftDeleteBtn"') && draft.includes('>Delete</button>'), 'Classic Delete control is directly visible');
assert(draft.includes('id="draftAddBtn"') && draft.includes('<span>Add pages</span>'), 'Classic Add pages button is restored');
assert(draft.includes('id="draftTeachBtn"') && draft.includes('Teach paper'), 'Classic draft Teach action is restored');

const renderStart = html.indexOf('function renderDraftPages() {');
const renderEnd = html.indexOf('\nasync function loadDraftList()', renderStart);
const render = html.slice(renderStart, renderEnd);
assert(render.includes('class="draft-page-tools"'), 'Classic per-page controls are restored');
assert(render.includes('data-page-preview'), 'Source thumbnails still open the full preview');
assert(render.includes('class="draft-page-text"'), 'Classic page cards retain a short text hint');
assert(render.includes('data-page-fix'), 'Page-level Edit remains directly available');

const css = html.slice(html.indexOf('/* v41 unified document workspace */'));
assert(css.includes('.main.workflow-active[data-view="result"]'), 'Result mode must have a dedicated focused layout');
assert(css.includes('v44 exact classic Extracted / Plain Text results UI'), 'Classic result UI override must be present');
assert(css.includes('.classic-output-card.editing .output-body'), 'Teach editing must keep the extracted preview visible');
assert(css.includes('v43 restore classic draft UI'), 'Classic draft UI override must be present');
assert(css.includes('height: 62px !important'), 'Phone source preview thumbnails must stay very compact');
assert(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important'), 'Phone source pages use a compact three-column layout');
assert(css.includes('.document-toolbar { flex-direction:column !important;'), 'Mobile keeps tabs and primary actions readable without hiding them');
assert(css.includes('.teach-primary-btn'), 'Teach receives clear primary-action styling');
assert(css.includes('.flagged-card {\n            display: none !important;'), 'Technical review cards must not clutter the primary workspace');

console.log('Classic PaperAI UI restores Extracted/Plain Text tabs, separate Teach editing, compact drafts, and editable AI suggestions.');
