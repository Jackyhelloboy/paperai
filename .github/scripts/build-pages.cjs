// Stage only deployable assets. Dependencies stay out of the public tree; the
// document libraries are copied explicitly; no model files are shipped.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'frontend'),out=path.join(root,'build/cloudflare-pages');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
fs.cpSync(source,out,{recursive:true,filter:p=>!['node_modules','.vercel','.gitignore','package.json','package-lock.json','local-ocr-check.html','local-ocr-worker.mjs','usage.json'].includes(path.basename(p))});
const release=process.env.GITHUB_SHA||process.env.CF_PAGES_COMMIT_SHA||'local';
if(!/^(?:[a-f0-9]{40}|local)$/.test(release))throw new Error('Invalid release identifier');
const homeFile=path.join(out,'index.html');
const home=fs.readFileSync(homeFile,'utf8').replace('<head>','<head>\n<meta name="paperai-release" content="'+release+'">')
    .replace(/((?:src|href)=")(\.?\/?vendor\/[^"?]+\.(?:js|css))(")/g,(_,open,src,close)=>open+src+'?v='+release+close);
fs.writeFileSync(homeFile,home);
// Two small text utilities, bundled locally: no CDN, model or document upload.
require(path.join(source,'node_modules/esbuild')).buildSync({
    stdin:{contents:'export { diffArrays } from "diff"; export { graphemeSegments } from "unicode-segmenter/grapheme";',resolveDir:source,sourcefile:'text-engine-entry.js'},
    bundle:true,format:'iife',globalName:'PaperAITextEngine',minify:true,target:'es2020',
    legalComments:'linked',outfile:path.join(out,'vendor/text-diff-engine.js')
});
// PDF.js 4 uses modules. Bundle its compatibility reader as the same classic
// global API, and keep the module worker on exactly the reader's release URL.
require(path.join(source,'node_modules/esbuild')).buildSync({
    entryPoints:[path.join(source,'node_modules/pdfjs-dist/legacy/build/pdf.mjs')],
    bundle:true,platform:'browser',format:'iife',globalName:'pdfjsLib',minify:true,target:'es2020',legalComments:'linked',
    outfile:path.join(out,'vendor/document-reader.js')
});
fs.appendFileSync(path.join(out,'vendor/document-reader.js'),'\nif(document.currentScript)pdfjsLib.GlobalWorkerOptions.workerSrc=new URL("./document-worker.js"+new URL(document.currentScript.src).search,document.currentScript.src).href;\n');
for(const [from,to] of [['cmaps','pdf-cmaps'],['standard_fonts','pdf-fonts']])
    fs.cpSync(path.join(source,'node_modules/pdfjs-dist',from),path.join(out,'vendor',to),{recursive:true});
// Script-only fallback faces: Tahoma remains the primary paper/Word font.
// Fonts load only for matching Unicode ranges; no external font service is
// required to display the supported Indian scripts in previews and Teach.
const fontFamilies=[['noto-sans-devanagari','devanagari','Noto Sans Devanagari'],['noto-sans-telugu','telugu','Noto Sans Telugu'],['noto-sans-tamil','tamil','Noto Sans Tamil'],['noto-sans-kannada','kannada','Noto Sans Kannada'],['noto-sans-malayalam','malayalam','Noto Sans Malayalam'],['noto-sans-bengali','bengali','Noto Sans Bengali'],['noto-sans-gujarati','gujarati','Noto Sans Gujarati'],['noto-sans-gurmukhi','gurmukhi','Noto Sans Gurmukhi'],['noto-sans-oriya','oriya','Noto Sans Oriya'],['noto-naskh-arabic','arabic','Noto Naskh Arabic']];
const fontOut=path.join(out,'vendor/paper-fonts');fs.mkdirSync(fontOut,{recursive:true});
let fontCss='';
for(const [family,subset] of fontFamilies){
    const dir=path.join(source,'node_modules/@fontsource',family);
    fs.copyFileSync(path.join(dir,'LICENSE'),path.join(fontOut,family+'-LICENSE.txt'));
    for(const weight of [400,700]){
        const faces=fs.readFileSync(path.join(dir,weight+'.css'),'utf8').match(/@font-face\s*\{[^}]+\}/g)||[];
        const face=faces.find(face=>face.includes('-'+subset+'-'+weight+'-normal.woff2'));
        if(!face)throw new Error('Missing script font '+family+' '+weight);
        fontCss+=face.replace(/url\(\.\/files\/([\w.-]+)\)/g,(_,name)=>{
            fs.copyFileSync(path.join(dir,'files',name),path.join(fontOut,name));
            return 'url(./paper-fonts/'+name+')';
        })+'\n';
    }
}
fontCss+='\n.paper-preview,.paper-preview .output-heading,.paper-preview .ocr-section-row,.teach-editor,.output-raw{font-family:Tahoma,'+fontFamilies.map(f=>'"'+f[2]+'"').join(',')+',Arial,sans-serif!important;}\n';
fs.writeFileSync(path.join(out,'vendor/worksheet-fonts.css'),fontCss);
for(const [name,to] of [['diff','text-diff-LICENSE.txt'],['unicode-segmenter','text-segmentation-LICENSE.txt']])
    fs.copyFileSync(path.join(source,'node_modules',name,'LICENSE'),path.join(out,'vendor',to));
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
    ['pdfjs-dist/legacy/build/pdf.worker.min.mjs','document-worker.js'],
    ['jszip/dist/jszip.min.js','archive-reader.js'],
    ['xlsx/dist/xlsx.full.min.js','sheet-reader.js'],
])fs.copyFileSync(path.join(source,'node_modules',from),path.join(out,'vendor',to));
for(const [from,to] of [
    ['pdfjs-dist/LICENSE','document-reader-LICENSE.txt'],
    ['jszip/LICENSE.markdown','archive-reader-LICENSE.txt'],
    ['xlsx/LICENSE','sheet-reader-LICENSE.txt'],
])fs.copyFileSync(path.join(source,'node_modules',from),path.join(out,'vendor',to));
console.log('Pages assets staged. Model inference stays on the backend.');
