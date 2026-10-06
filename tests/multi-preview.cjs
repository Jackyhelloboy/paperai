const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('frontend/index.html', 'utf8');
const start = html.indexOf('function renderBatchPreview(');
const end = html.indexOf('\nfunction setFiles(', start);
assert(start > 0 && end > start, 'renderBatchPreview must exist');

function classes() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value)
  };
}

const batchPreview = { innerHTML: '', dataset: {}, classList: classes() };
const batchPreviewShell = { classList: classes() };
const batchPreviewCount = { textContent: '' };
const batchAddMore = { hidden: false, textContent: '' };
const nodes = new Map();

const context = vm.createContext({
  files: [],
  previewObjectUrls: [],
  batchPreview,
  batchPreviewShell,
  batchPreviewCount,
  batchAddMore,
  IMAGE_EXTS: ['jpg','jpeg','png','bmp','webp','gif','tiff','tif'],
  PDF_EXTS: ['pdf'],
  SMART_MAX_IMAGES: 5,
  URL: {
    createObjectURL: file => 'blob:' + file.name,
    revokeObjectURL() {}
  },
  esc: value => String(value),
  fmtSize: size => size + ' B',
  $: id => nodes.get(id) || null,
  renderPdfPreviewCard() {},
  updateSmartExtractionUI() {}
});

vm.runInContext(html.slice(start, end), context);

const images = Array.from({ length: 5 }, (_, index) => ({
  name: 'page-' + (index + 1) + '.jpg',
  size: 100 + index
}));

context.files = images;
context.renderBatchPreview();

assert(batchPreviewShell.classList.contains('show'), 'Selected-pages gallery must be visible');
assert(batchPreview.classList.contains('show'), 'Preview grid must be visible');
assert.equal((batchPreview.innerHTML.match(/class="batch-preview-card"/g) || []).length, 5, 'All five imported images must render as separate preview cards');
for (let page = 1; page <= 5; page++) {
  assert(batchPreview.innerHTML.includes('Page ' + page), 'Preview gallery must label Page ' + page);
  assert(batchPreview.innerHTML.includes('page-' + page + '.jpg'), 'Preview gallery must keep image ' + page + ' visible');
}
assert.equal(batchPreviewCount.textContent, '5/5 images', 'Gallery must show the selected image count');
assert.equal(batchAddMore.hidden, true, 'Add-images control hides only when five image slots are full');

context.files = images.slice(0, 3);
context.renderBatchPreview();
assert.equal((batchPreview.innerHTML.match(/class="batch-preview-card"/g) || []).length, 3, 'Gallery must update after pages are removed');
assert.equal(batchPreviewCount.textContent, '3/5 images');
assert.equal(batchAddMore.hidden, false, 'Users can add more images while slots remain');

const finalCss = html.slice(html.indexOf('/* v40 multi-page upload gallery'));
assert(finalCss.includes('grid-auto-columns: 104px !important'), 'Mobile upload preview must use compact swipeable thumbnails');
assert(finalCss.includes('overflow-x: auto !important'), 'Every imported page must remain reachable by horizontal swipe');
assert(finalCss.includes('scroll-snap-type: x proximity'), 'Mobile preview swipe should stop cleanly on page thumbnails');

console.log('All imported images remain available in a compact mobile swipe preview without vertical card stacking.');
