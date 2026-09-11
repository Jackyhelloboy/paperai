export default async function run(page, ui) {
  const fs = await import('fs');
  const path = await import('path');
  
  // Create a test PDF
  const testPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000206 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n281\n%%EOF';
  const tmpFile = path.join(process.env.TEMP || '/tmp', 'test_upload.pdf');
  fs.writeFileSync(tmpFile, testPdf);
  
  // Upload file
  const fileInput = await page.$('input[type=file]');
  if (!fileInput) return { error: 'No file input found' };
  
  await fileInput.setInputFiles(tmpFile);
  
  // Wait for processing to start
  await page.waitForTimeout(3000);
  
  // Check status
  const bodyText1 = await page.evaluate(() => document.body.innerText);
  
  // Wait longer for processing
  await page.waitForTimeout(15000);
  
  const bodyText2 = await page.evaluate(() => document.body.innerText);
  
  return { 
    after3s: bodyText1.substring(0, 300),
    after18s: bodyText2.substring(0, 300)
  };
}
