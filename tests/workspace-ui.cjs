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
assert(!results.includes('id="aiSuggestionEditor"'), 'Old Teach suggestions must not use a separate editable AI box');
assert(!results.includes('id="aiSuggestBtn"'), 'Teach must not require a manual AI suggestion button');
assert(results.includes('id="previewDensityBtn"'), 'Result preview must expose a user-controlled Fit/Paper view toggle');
assert(results.includes('id="translitSuggestions"'), 'Suggestion strip must remain part of Teach');
assert(results.indexOf('id="translitSuggestions"') < results.indexOf('id="teachEditor"'), 'Suggestions must be placed above the editable text area');
assert(results.includes('class="teach-panel classic-teach-panel"'), 'Classic compact Teach panel must be restored');
assert(results.includes('<div class="teach-title">Review &amp; correct'), 'Classic Review & correct heading must be restored');
assert(results.includes('class="teach-actions"'), 'Classic Save changes / Done action row must be restored');

assert(html.includes("Session-only mobile workflow"), 'Extraction must use the session-only workflow');
assert(html.includes("$('draftsCard').hidden = true;"), 'Draft manager must stay hidden from the normal workflow');
assert(html.includes('clearLegacyWorkingDocumentOnLoad'), 'Refresh/startup must clear the working document state');
assert(!html.includes('await saveExtractionToPaper(assembled.ordered);'), 'Normal extraction must not persist a draft automatically');

const css = html.slice(html.indexOf('/* v41 unified document workspace */'));
assert(css.includes('.main.workflow-active[data-view="result"]'), 'Result mode must have a dedicated focused layout');
assert(css.includes('v44 exact classic Extracted / Plain Text results UI'), 'Classic result UI override must be present');
assert(css.includes('.classic-output-card.editing .output-body'), 'Teach editing must keep the extracted preview visible');
assert(css.includes('v45 mobile fit preview + user-controlled density'), 'Mobile extracted preview must include the compact fit-density layer');
assert(css.includes('v46 restore compact old Teach interaction'), 'Compact old Teach layout must be present');
assert(css.includes('position:fixed !important;'), 'Mobile AI suggestions must stay visible while editing');
assert(css.includes('v47 automatic smart-suggestion Teach redesign'), 'Teach must use the automatic smart-suggestion redesign');
assert(css.includes('v51 stable Android Teach UI'), 'Stable Android Teach UI layer must be present');
assert(css.includes('v52 larger resizable Teach editor'), 'Teach editor must restore a larger editing area');
assert(css.includes('v53 viewport-aware Teach workspace'), 'Teach must use the visible Android viewport for stable sizing');
assert(css.includes('v54 focused Teach workspace'), 'Focused Teach layout must compact controls around the editor');
assert(results.includes('id="teachEditorSizeLabel"'), 'Teach must expose explicit smaller/larger editor controls');
assert(css.includes('teach-keyboard-open'), 'Teach must adapt its layout when the Android keyboard is visible');
assert(css.includes('height:calc(var(--teach-visible-height, 100dvh) - 16px) !important'), 'Teach panel must fit inside the visible viewport');
assert(css.includes('flex:1 1 auto !important'), 'Teach editor must consume the remaining visible space');
assert(css.includes('resize:none !important'), 'Mobile Teach sizing must be viewport controlled instead of unstable manual resizing');
assert(css.includes('height:320px !important'), 'Android Teach editor must open at a larger practical height');
assert(css.includes('flex-flow:row nowrap !important'), 'Suggestion chips must stay in one horizontal row');
assert(css.includes('overflow-x:auto !important'), 'Suggestion row must scroll horizontally instead of stacking');
assert(css.includes('#teachOriginalBtn'), 'Original control must remain available in the compact toolbar');
assert(css.includes('max-height:38vh !important;'), 'Mobile AI suggestion dock must stay compact and scroll internally');
assert(css.includes('.classic-output-card[data-compact="true"] .ocr-structured-table'), 'Compact mode must shrink structured tables to phone width');
assert(css.includes('v48 minimal Android session-only UI'), 'Minimal Android UI layer must be present');
assert(css.includes('#draftsCard { display:none !important; }'), 'Draft manager must be removed from the visible Android workflow');
assert(css.includes('font-size:11.5px !important'), 'Mobile extracted text must use a compact readable size');
assert(css.includes('min-height:36px !important'), 'Android action controls must use compact touch-friendly sizing');
assert(css.includes('.flagged-card {\n            display: none !important;'), 'Technical review cards must not clutter the primary workspace');

console.log('PaperAI uses a focused Android Teach workspace with suggestions above, explicit editor sizing, keyboard-aware controls, and preview below.');
