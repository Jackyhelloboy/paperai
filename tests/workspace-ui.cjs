const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');
const resultsStart = html.indexOf('id="resBox"');
const resultsEnd = html.indexOf('</main>', resultsStart);
const results = html.slice(resultsStart, resultsEnd);
const css = html.slice(html.indexOf('/* v41 unified document workspace */'));

assert(resultsStart >= 0, 'Results section must exist');
assert(results.includes('Extracted Text'), 'Old Extracted Text header must be visible');
assert(results.includes('id="copyTextBtn"'), 'Copy action must stay visible');
assert(results.includes('id="downloadWordBtn"'), 'Download/export action must stay visible');
assert(results.includes('id="teachActionBtn"'), 'Teach action must stay visible');

assert(results.includes('Correct OCR to teach this browser'), 'Old Teach title must be restored');
assert(results.includes('id="teachUndoBtn"') && results.includes('id="teachRedoBtn"') && results.includes('id="teachOriginalBtn"'), 'Old Undo/Redo/Original toolbar must be restored');
assert(results.indexOf('id="teachEditor"') < results.indexOf('id="translitSuggestions"'), 'Old layout must place suggestions directly below the editor');
assert(results.includes('Save &amp; apply'), 'Old Save & apply action must be restored');
assert(results.includes('>Cancel</button>'), 'Old Cancel action must be restored');
assert(results.includes('>Extracted</button>') && results.includes('>Raw OCR</button>'), 'Old Extracted / Raw OCR tabs must be restored');

assert(results.includes('class="teach-language-bar old-ui-compat"'), 'Current language controls may remain only as hidden compatibility UI');
assert(results.includes('id="previewDensityBtn"') && results.includes('old-ui-compat'), 'New preview density control must be hidden from the old UI');

assert(css.includes('v56 exact oldest PaperAI UI restoration'), 'Final oldest-UI override must be present');
assert(css.includes('.old-ui-compat {\n            display:none !important;'), 'New compatibility controls must stay hidden');
assert(css.includes('resize:vertical !important'), 'Teach editor must expose the native bottom-right resize handle');
assert(css.includes('height:260px !important'), 'Teach editor must open at a practical old-style height');
assert(css.includes('max-height:72vh !important'), 'Teach editor must still be able to grow substantially');
assert(css.includes('flex-wrap:wrap !important'), 'Old suggestion chips must wrap naturally instead of using a forced horizontal rail');
assert(css.includes('max-height:400px !important'), 'Old extracted preview must remain a compact scrollable card');

assert(html.includes("Session-only mobile workflow"), 'Refresh/session cleanup behavior must remain intact');
assert(html.includes("$('draftsCard').hidden = true;"), 'Draft-manager clutter must remain hidden');
assert(!html.includes('await saveExtractionToPaper(assembled.ordered);'), 'Normal extraction must remain session-only');

console.log('Oldest PaperAI results/Teach UI is restored and protected while current backend/session behavior remains intact.');
