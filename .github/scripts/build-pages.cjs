// Stage only deployable assets. Dependencies stay out of the public tree; the
// document libraries are copied explicitly; no model files are shipped.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'frontend'),out=path.join(root,'build/cloudflare-pages');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
fs.cpSync(source,out,{recursive:true,filter:p=>!['node_modules','.vercel','.gitignore','package.json','package-lock.json','local-ocr-check.html','local-ocr-worker.mjs','usage.json'].includes(path.basename(p))});
const release=process.env.GITHUB_SHA||process.env.CF_PAGES_COMMIT_SHA||'local';
if(!/^(?:[a-f0-9]{40}|local)$/.test(release))throw new Error('Invalid release identifier');
const homeFile=path.join(out,'index.html');
fs.writeFileSync(homeFile,fs.readFileSync(homeFile,'utf8').replace('<head>','<head>\n<meta name="paperai-release" content="'+release+'">'));
// Advanced-mode code runs on the server, not as a downloadable browser script.
const gateway=fs.readFileSync(path.join(root,'functions/api/[[path]].js'),'utf8');
fs.writeFileSync(path.join(out,'_worker.js'),gateway+`\nexport default {fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/vendor/local-runtime/') || ['/vendor/pdf-word-layout.js','/local-ocr-check','/local-ocr-check.html','/_worker.js','/vendor/local-ocr-worker.mjs','/vendor/local-reader-worker.js','/vendor/local-ocr.js','/vendor/local-ocr-layout.js'].includes(path))
        return new Response('Not found', {status: 404});
    if (path.startsWith('/api/')) return onRequest({request, env});
    return env.ASSETS.fetch(request);
}};\n`);
fs.writeFileSync(path.join(out,'_routes.json'),JSON.stringify({version:1,
    include:['/api/*','/vendor/pdf-word-layout.js','/local-ocr-check','/local-ocr-check.html','/_worker.js','/vendor/local-ocr-worker.mjs','/vendor/local-runtime/*','/vendor/local-reader-worker.js','/vendor/local-ocr.js','/vendor/local-ocr-layout.js'],exclude:[]}));
for(const [from,to] of [
    ['pdfjs-dist/build/pdf.min.js','document-reader.js'],
    ['pdfjs-dist/build/pdf.worker.min.js','document-worker.js'],
    ['jszip/dist/jszip.min.js','archive-reader.js'],
    ['xlsx/dist/xlsx.full.min.js','sheet-reader.js'],
])fs.copyFileSync(path.join(source,'node_modules',from),path.join(out,'vendor',to));
for(const [from,to] of [
    ['pdfjs-dist/LICENSE','document-reader-LICENSE.txt'],
    ['jszip/LICENSE.markdown','archive-reader-LICENSE.txt'],
    ['xlsx/LICENSE','sheet-reader-LICENSE.txt'],
])fs.copyFileSync(path.join(source,'node_modules',from),path.join(out,'vendor',to));
console.log('Pages assets staged. Model inference stays on the backend.');
