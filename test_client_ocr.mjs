export default async function run(page, ui) {
  const fs = await import('fs');
  const path = await import('path');

  // Create a test image with text
  const { createCanvas } = await import('canvas').catch(() => ({ createCanvas: null }));

  // Use a simpler approach - create a minimal PNG with text via page
  const testPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 100);
    ctx.fillStyle = 'black';
    ctx.font = '24px Arial';
    ctx.fillText('Hello World', 50, 55);
    ctx.fillText('Test OCR 123', 50, 85);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  const tmpFile = path.join(process.env.TEMP || '/tmp', 'test_ocr.png');
  fs.writeFileSync(tmpFile, Buffer.from(testPng, 'base64'));

  // Upload file
  const fileInput = await page.$('input[type=file]');
  if (!fileInput) return { error: 'No file input found' };

  await fileInput.setInputFiles(tmpFile);

  // Wait for processing (client-side OCR takes a few seconds)
  await page.waitForTimeout(15000);

  const bodyText = await page.evaluate(() => document.body.innerText);

  return {
    hasResult: bodyText.includes('Extracted Text') || bodyText.includes('Done') || bodyText.includes('complete'),
    hasConfidence: bodyText.includes('Confidence'),
    hasWords: bodyText.includes('Words'),
    bodySnippet: bodyText.substring(0, 500)
  };
}
