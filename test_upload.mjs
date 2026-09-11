export default async function run(page, ui) {
  // Create a test file via JS
  const testContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF';
  
  // Create a File object and set it on the input
  const fileInput = await page.$('input[type=file]');
  if (!fileInput) return { error: 'No file input found' };
  
  // Create temp file
  const fs = await import('fs');
  const path = await import('path');
  const tmpFile = path.join(process.env.TEMP || '/tmp', 'test_upload.pdf');
  fs.writeFileSync(tmpFile, testContent);
  
  await fileInput.setInputFiles(tmpFile);
  
  // Wait a moment for upload to start
  await page.waitForTimeout(2000);
  
  // Check for any text changes (upload success or error)
  const bodyText = await page.evaluate(() => document.body.innerText);
  
  return { 
    hasUploading: bodyText.includes('Uploading'),
    hasError: bodyText.includes('failed') || bodyText.includes('error') || bodyText.includes('Error'),
    hasProcessing: bodyText.includes('Processing') || bodyText.includes('processing'),
    hasSuccess: bodyText.includes('success') || bodyText.includes('Success'),
    bodySnippet: bodyText.substring(0, 500)
  };
}
