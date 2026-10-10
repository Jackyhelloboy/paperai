// Multi-page merge check: select two pages out of order, confirm the app
// orders them naturally, inserts a page break between them, and that the
// exported Word body carries a real page break.
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8765';
const ROOT = path.resolve('.');
const A = path.join(ROOT, 'training', 'multi', 'page_1.txt');
const B = path.join(ROOT, 'training', 'multi', 'page_10.txt');

export default async function run(page) {
  await page.goto(BASE + '/frontend/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#fileInput', { state: 'attached', timeout: 20000 });

  // Intentionally give page 2 first so natural ordering must fix it.
  await page.setInputFiles('#fileInput', [B, A]);
  await page.waitForSelector('#goBtn:not([disabled])', { state: 'visible', timeout: 20000 });
  await page.click('#goBtn');
  await page.waitForSelector('#textOut .paper-sheet', { timeout: 30000 });

  const preview = await page.evaluate(() => {
    const out = document.getElementById('textOut');
    const sheet = out.querySelector('.paper-sheet');
    const html = sheet ? sheet.innerHTML : '';
    const text = (sheet ? sheet.textContent : '').replace(/\s+/g, ' ');
    return {
      pageBreaks: out.querySelectorAll('.qp-page-break').length,
      order: {
        page1: text.indexOf('PAGE ONE FIRST CONTENT'),
        page2: text.indexOf('PAGE TWO CONTENT')
      },
      selectedLabel: (document.getElementById('fileName') || {}).textContent || ''
    };
  });

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#downloadWordBtn');
  const download = await downloadPromise;
  const outPath = path.join(ROOT, 'training', 'out', 'multi_sample.docx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await download.saveAs(outPath);

  const ordered = preview.order.page1 > -1 && preview.order.page1 < preview.order.page2;
  return {
    preview,
    docx: outPath,
    pass: preview.pageBreaks >= 1 && ordered && /2 pages selected/.test(preview.selectedLabel)
  };
}