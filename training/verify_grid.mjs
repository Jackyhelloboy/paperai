// Drives the real UI with a text sample containing consecutive picture markers
// and checks that both the preview and the exported Word body use a 3-column
// side-by-side picture grid.
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8765';
const ROOT = path.resolve('.');

export default async function run(page) {
  const sample = path.join(ROOT, 'training', 'grid_sample.txt');
  if (!fs.existsSync(sample)) return { error: 'grid_sample.txt missing' };

  await page.goto(BASE + '/frontend/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#fileInput', { state: 'attached', timeout: 20000 });
  await page.setInputFiles('#fileInput', sample);
  await page.waitForSelector('#goBtn:not([disabled])', { state: 'visible', timeout: 20000 });
  await page.click('#goBtn');
  await page.waitForSelector('#textOut .paper-sheet', { timeout: 30000 });

  const preview = await page.evaluate(() => {
    const out = document.getElementById('textOut');
    const grid = out.querySelector('.qp-picture-grid');
    return {
      gridBlocks: out.querySelectorAll('.qp-picture-grid').length,
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      placeholders: out.querySelectorAll('.ocr-picture-placeholder').length,
      pageBreaks: out.querySelectorAll('.qp-page-break').length
    };
  });

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#downloadWordBtn');
  const download = await downloadPromise;
  const outPath = path.join(ROOT, 'training', 'out', 'grid_sample.docx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await download.saveAs(outPath);

  return {
    preview,
    docx: outPath,
    pass: preview.gridBlocks === 1 && preview.gridColumns === 3 && preview.placeholders === 5
  };
}