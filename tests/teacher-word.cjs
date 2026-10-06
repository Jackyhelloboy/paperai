const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const deps=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const docx=require(deps?path.join(deps,'docx'):'docx'),JSZip=require('jszip'),sax=require('sax');
const ctx=vm.createContext({Blob,Uint8Array,URL,AbortSignal,console,window:{docx,docxShapes:{ShapeCanvasRun:class{}},JSZip:{loadAsync:async value=>JSZip.loadAsync(value?.arrayBuffer?new Uint8Array(await value.arrayBuffer()):value)},
 fetch:async url=>({ok:true,arrayBuffer:async()=>Uint8Array.from(fs.readFileSync(path.join('frontend',String(url)))).buffer})}});
for(const name of ['paperai-document-model.js','paperai-math.js','paperai-word-engine.js','paperai-word-fonts.js'])vm.runInContext(fs.readFileSync('frontend/vendor/'+name,'utf8'),ctx);
const source=String.raw`Teacher question paper
Total marks: 10
I. Short answers 4 × 1 = 4M
1. తెలుగు పదం ఏంటి? हिंदी पाठ।
2. Simplify $\frac{x+1}{2}$.
3. Write $x_{n}^{2}+\sqrt[3]{8}$.
4. Read $\int_{0}^{1} x^2 dx$ and $\sum_{n=1}^{4} n$.
[[PAGE_BREAK]]
II. Matrices 3 × 2 = 6M
1. Copy $\begin{bmatrix}1&2\\3&4\end{bmatrix}$.
2. Preserve unsupported notation $\unknown{x}$ for teacher review.
3. Explain the symbol $\theta \leq \pi$.
`;
(async()=>{
 const math=ctx.window.PaperAIMath;
 assert(math.preview('$\\frac{1}{2}$').includes('<mfrac>'));
 assert.equal(math.preview('$\\unsupported{x}$'),'$\\unsupported{x}$','Unsupported notation remains visible');
 assert(!math.preview('<script>bad</script>').includes('<script>'),'Preview escapes arbitrary input');
 let blob=await ctx.window.PaperAIWordEngine.makeDocx(source);
 blob=await ctx.window.PaperAIWordFonts.finalize(blob,source);
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());
 for(const file of Object.values(zip.files))if(!file.dir && /\.xml$|\.rels$/.test(file.name))sax.parser(true,{xmlns:true}).write(await file.async('string')).close();
 const xml=await zip.file('word/document.xml').async('string');
 for(const tag of ['m:oMath','m:f','m:rad','m:sSubSup','m:m','m:mr'])assert(xml.includes('<'+tag),'Missing editable equation '+tag);
 assert(xml.includes('\\unknown{x}'),'Unsupported math never disappears');
 assert(!xml.includes('w:type="page"'),'Upload boundaries must not create page breaks');
 for(const name of ['PaperAIDevanagari','PaperAITelugu'])assert(zip.file('word/fonts/'+name+'.odttf'));
 for(const run of xml.match(/<w:r(?=\s|>)[^>]*>[\s\S]*?<\/w:r>/g)||[]) {
  if(/[\u0900-\u097f]/u.test(run))assert(run.includes('w:ascii="PaperAIDevanagari"'));
  if(/[\u0c00-\u0c7f]/u.test(run))assert(run.includes('w:ascii="PaperAITelugu"'));
 }
 if(process.argv[2])fs.writeFileSync(process.argv[2],Buffer.from(await blob.arrayBuffer()));
 console.log('Hindi/Telugu fonts embedded, mixed-script runs valid, native editable equations/matrices present, unsupported math preserved, uploads flow continuously.');
})().catch(e=>{console.error(e);process.exitCode=1});
