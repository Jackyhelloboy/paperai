const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');

const resultsStart = html.indexOf('id="resBox"');
const resultsEnd = html.indexOf('</main>', resultsStart);
const results = html.slice(resultsStart, resultsEnd);

assert(resultsStart >= 0, 'Results section must exist');
assert(results.includes('class="results classic-results"') || html.includes('class="results classic-results"'), 'Classic results layout must be present');
assert(results.includes('id="outputCard"'), 'Classic results must contain the output card');
assert(results.includes('id="documentStatus"'), 'Workspace must expose one compact document status');
assert(results.indexOf('id="teachPanel"') < results.indexOf('id="outputCard"'), 'Classic Teach editor sits above the output tabs');
assert(results.indexOf('id="teachPanel"') < results.indexOf('id="textOut"'), 'Teach corrections remain separate from the extracted preview');
assert(results.includes('id="copyTextBtn"'), 'Copy must remain directly visible in the result toolbar');
assert(results.includes('>Extracted</button>') && results.includes('>Plain Text</button>'), 'Classic Extracted and Plain Text tabs are restored');
assert(results.includes('id="teachActionBtn"') && /\bTeach\b/.test(results), 'Teach must be restored as a primary action');
assert(results.includes('id="aiSuggestionEditor"'), 'Teach must include a separate editable AI suggestion box');
assert(!results.includes('id="aiSuggestBtn"'), 'Teach must not require a manual AI suggestion button');
assert(results.includes('id="previewDensityBtn"'), 'Result preview must expose a user-controlled Fit/Paper view toggle');
assert(results.includes('onclick="applyEditedAiSuggestion()"'), 'AI suggestion text must require an explicit apply action');
assert(results.includes('class="teach-panel classic-teach-panel"'), 'Classic compact Teach panel must be restored');
assert(results.includes('<div class="teach-title">Review &amp; correct'), 'Classic Review & correct heading must be restored');
assert(results.includes('class="teach-actions"'), 'Classic Save changes / Done action row must be restored');

const draftStart = html.indexOf('<div class="drafts-card" id="draftsCard">');
const draftEnd = html.indexOf('id="resBox"', draftStart);
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
assert(css.includes('v45 mobile fit preview + user-controlled density'), 'Mobile extracted preview must include the compact fit-density layer');
assert(css.includes('v46 restore compact old Teach interaction'), 'Compact old Teach layout must be present');
assert(css.includes('position:fixed !important;'), 'Mobile AI suggestions must stay visible while editing');
assert(css.includes('v47 automatic smart-suggestion Teach redesign'), 'Teach must use the automatic smart-suggestion redesign');
assert(css.includes('max-height:38vh !important;'), 'Mobile AI suggestion dock must stay compact and scroll internally');
assert(css.includes('.classic-teach-panel .teach-suggestion-card[data-state="idle"]'), 'AI suggestion card must stay hidden until requested');
assert(css.includes('height:200px !important'), 'Mobile Teach editor must remain compact rather than taking most of the screen');
assert(css.includes('.classic-output-card[data-compact="true"] .ocr-structured-table'), 'Compact mode must shrink structured tables to phone width');
assert(css.includes('v43 restore classic draft UI'), 'Classic draft UI override must be present');
assert(css.includes('height: 62px !important'), 'Phone source preview thumbnails must stay very compact');
assert(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important'), 'Phone source pages use a compact three-column layout');
assert(css.includes('.document-toolbar { flex-direction:column !important;'), 'Mobile keeps tabs and primary actions readable without hiding them');
assert(css.includes('.teach-primary-btn'), 'Teach receives clear primary-action styling');
assert(css.includes('.flagged-card {\n            display: none !important;'), 'Technical review cards must not clutter the primary workspace');

console.log('Teach automatically suggests on select/type, keeps suggestions visible, and preserves the classic compact editor.');
