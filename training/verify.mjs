// End-to-end check: upload a real training question paper, read the A4 preview
// the app renders, export the DOCX through the real Download Word button.
// Usage: node <skill>/browser.mjs http://localhost:8765/frontend/index.html --script training/verify.mjs
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8765';
const ROOT = path.resolve('.');
const SAMPLES = [
  'training/out/Class_4_Science_Annual.docx',
  'training/out/Social 7.docx'
];
const OUT_DIR = path.join(ROOT, 'training', 'out');

export default async function run(page, ui) {
  const results = [];

  for (const sample of SAMPLES) {
    const fileAbs = path.join(ROOT, sample);
    if (!fs.existsSync(fileAbs)) {
      results.push({ sample, error: 'file not found' });
      continue;
    }

    await page.goto(BASE + '/frontend/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#fileInput', { state: 'attached', timeout: 20000 });

    await page.setInputFiles('#fileInput', fileAbs);
    await page.waitForSelector('#goBtn:not([disabled])', { state: 'visible', timeout: 20000 });
    await page.click('#goBtn');

    try {
      await page.waitForSelector('#textOut .paper-sheet', { timeout: 30000 });
    } catch (e) {
      const err = await page.evaluate(() => document.getElementById('errText')?.textContent || '');
      results.push({ sample, error: 'preview did not render', errText: err });
      continue;
    }

    const preview = await page.evaluate(() => {
      const out = document.getElementById('textOut');
      const sheet = out.querySelector('.paper-sheet');
      const cs = getComputedStyle(sheet);
      const rect = sheet.getBoundingClientRect();
      const errEl = document.getElementById('errText');

      const blocks = [];
      for (const el of sheet.children) {
        if (el.classList && el.classList.contains('qp-header-banner')) continue;
        const cls = el.className || '';
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (el.matches('table.qp-table')) {
          blocks.push({
            type: 'table',
            rows: [...el.querySelectorAll('tr')].map(tr =>
              [...tr.querySelectorAll('td,th')].map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()))
          });
        } else if (el.classList && el.classList.contains('qp-picture-grid')) {
          for (const ph of el.querySelectorAll('.ocr-picture-placeholder')) {
            const lbl = ph.querySelector('.ocr-picture-label');
            blocks.push({ type: 'picture', text: (lbl ? lbl.textContent : '').replace(/\s+/g, ' ').trim() });
          }
        } else if (cls.includes('paper-title')) {
          blocks.push({ type: 'title', text });
        } else if (cls.includes('qp-section')) {
          blocks.push({
            type: 'section',
            text: (el.querySelector('.qp-section-text')?.textContent || '').replace(/\s+/g, ' ').trim(),
            marks: (el.querySelector('.qp-marks')?.textContent || '').replace(/\s+/g, ' ').trim()
          });
        } else if (el.querySelector('.ocr-picture-placeholder')) {
          blocks.push({ type: 'picture', text });
        } else if (el.querySelector('.ocr-option-row')) {
          blocks.push({
            type: 'options',
            rows: [[...el.querySelectorAll('.ocr-option-item')].map(s => (s.textContent || '').replace(/\s+/g, ' ').trim())]
          });
        } else if (text) {
          blocks.push({ type: 'text', text });
        }
      }

      return {
        errText: errEl && errEl.textContent ? errEl.textContent.slice(0, 200) : '',
        sheetWidthPx: Math.round(rect.width),
        layoutWidthPx: sheet.offsetWidth,
        zoom: cs.zoom,
        paddingLeft: cs.paddingLeft,
        paddingTop: cs.paddingTop,
        fontSize: cs.fontSize,
        overflowX: out.scrollWidth - out.clientWidth,
        blocks,
        title: out.querySelector('.paper-title')?.textContent.trim().slice(0, 90) || '',
        sectionCount: out.querySelectorAll('.qp-section').length,
        sections: [...out.querySelectorAll('.qp-section-text')].map(e => e.textContent.trim()).slice(0, 6),
        marks: [...out.querySelectorAll('.qp-marks')].map(e => e.textContent.trim()).slice(0, 6),
        tableCount: out.querySelectorAll('table.qp-table').length,
        tableRows: [...out.querySelectorAll('table.qp-table')].map(t => t.querySelectorAll('tr').length),
        pictureCount: out.querySelectorAll('.ocr-picture-placeholder').length,
        pictureSrcKinds: [...new Set([...out.querySelectorAll('.ocr-picture-placeholder img')]
          .map(i => { const s = i.getAttribute('src') || ''; return s.startsWith('data:') ? 'data:' + s.slice(5, 40) : s; }))],
        optionRowCount: out.querySelectorAll('.ocr-option-row').length,
        answerBlanks: (out.innerHTML.match(/_{6,}/g) || []).length,
        sheetCount: out.querySelectorAll('.paper-sheet').length,
        htmlLength: out.innerHTML.length
      };
    });

    const stem = path.basename(sample).replace(/\.\w+$/, '');
    const previewPath = path.join(OUT_DIR, stem + '.preview.json');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(previewPath, JSON.stringify({ sample, blocks: preview.blocks }, null, 1));
    preview.blockCount = preview.blocks.length;
    delete preview.blocks;

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#downloadWordBtn');
    let docxInfo = {};
    try {
      const download = await downloadPromise;
      const outPath = path.join(OUT_DIR, stem + '.docx');
      fs.mkdirSync(OUT_DIR, { recursive: true });
      await download.saveAs(outPath);
      docxInfo = { file: outPath, bytes: fs.statSync(outPath).size };
    } catch (e) {
      docxInfo = { error: String(e && e.message || e) };
    }

    results.push({ sample, preview, docx: docxInfo });
  }

  return { results };
}
