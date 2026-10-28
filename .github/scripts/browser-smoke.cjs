// Real Chromium checks against the staged app. AI endpoints are stubbed;
// PDF parsing/rendering, local pictures, editing and Word export are real.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),assets=path.join(root,'build/cloudflare-pages');
const {chromium}=require(path.join(root,'frontend/node_modules/playwright'));
const JSZip=require(path.join(root,'frontend/node_modules/jszip'));
const mime={'.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf','.pdf':'application/pdf'};
const fixture='Class: I\nSubject: Hindi\nI. शब्द लिखो।\n1. घर\n2. फल\nIII. चित्र देखकर खाली जगह में सही अक्षर भरो।\n1. kite pic — तंग\n2. duck pic — तख\n3. fish pic — छली\n4. Tap pic — ल\n5. fruits pic — ल';
(async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');
  const file=url.pathname==='/fixture.pdf'?path.join(root,'training/fa-2 sci.pdf'):path.resolve(assets,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(file!==path.join(root,'training/fa-2 sci.pdf')&&!file.startsWith(assets+path.sep)){res.writeHead(403).end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/usage'?{date_utc:'2026-10-28',provider_limit_reached:false,reset_at:'2026-10-29T00:00:00Z'}:{sections:[],ai_checked:false}});
    return route.continue();
   });
   await page.goto(base,{waitUntil:'load'});
   assert(!(await page.locator('meta[name=viewport]').getAttribute('content')).includes('user-scalable=no'),'Teachers must be able to zoom a paper on phones');
   const fonts=await page.evaluate(async()=>{
    const samples=[['Noto Sans Devanagari','शब्द'],['Noto Sans Telugu','పిల్లి'],['Noto Sans Tamil','தமிழ்'],['Noto Sans Kannada','ಕನ್ನಡ'],['Noto Sans Malayalam','മലയാളം'],['Noto Sans Bengali','বাংলা'],['Noto Sans Gujarati','ગુજરાતી'],['Noto Sans Gurmukhi','ਪੰਜਾਬੀ'],['Noto Sans Oriya','ଓଡ଼ିଆ'],['Noto Naskh Arabic','اردو']];
    return Promise.all(samples.map(async([family,text])=>({family,loaded:(await document.fonts.load('12px "'+family+'"',text)).length>0})));
   });
   assert(fonts.every(f=>f.loaded),'Script fonts failed: '+fonts.filter(f=>!f.loaded).map(f=>f.family).join(', '));
   const pdf=await page.evaluate(async()=>{
    const pdf=await pdfjsLib.getDocument({url:'/fixture.pdf',isEvalSupported:false,cMapUrl:'/vendor/pdf-cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdf-fonts/'}).promise;
    try{let rendered=0,ink=0;
     for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),canvas=document.createElement('canvas'),viewport=page.getViewport({scale:.6});canvas.width=viewport.width;canvas.height=viewport.height;
      try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
       const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let pageInk=0;for(let i=0;i<data.length;i+=4)if(data[i]<200&&data[i+1]<200&&data[i+2]<200)pageInk++;
       if(pageInk<=200)throw Error('Reference page '+n+' rendered blank');rendered++;ink+=pageInk;
      }finally{page.cleanup();canvas.width=canvas.height=0;}
     }
     return {pages:pdf.numPages,rendered,ink,worker:pdfjsLib.GlobalWorkerOptions.workerSrc};
    }finally{await pdf.destroy();}
   });
   assert.equal(pdf.pages,12);assert.equal(pdf.rendered,12);assert(pdf.ink>200);assert(pdf.worker.includes('document-worker.js'));
   await page.locator('#fileInput').setInputFiles({name:'browser-reference.txt',mimeType:'text/plain',buffer:Buffer.from(fixture)});
   await page.locator('#resBox.show').waitFor({timeout:20000});
   assert.equal(await page.locator('#textOut .ocr-figure-cell img').count(),5,'Five requested pictures must appear in the actual browser');
   await page.evaluate(()=>openTeachPanel());
   const original=await page.locator('#teachEditor').inputValue();
   await page.locator('#teachEditor').fill(original.replace('1. घर','1. मेरा घर'));
   await page.locator('#teachUndoBtn').click();assert.equal(await page.locator('#teachEditor').inputValue(),original);
   await page.locator('#teachRedoBtn').click();assert((await page.locator('#teachEditor').inputValue()).includes('मेरा घर'));
   await page.getByRole('button',{name:'Save & apply',exact:true}).click();
   const download=page.waitForEvent('download');await page.locator('#downloadWordBtn').click();
   const file=await(await download).path(),zip=await JSZip.loadAsync(fs.readFileSync(file));
   const xml=await zip.file('word/document.xml').async('text');
   assert(xml.includes('मेरा घर'));assert.equal((xml.match(/<wp:inline /g)||[]).length,5);assert(!xml.includes('<w:tbl>')&&!xml.includes('needs review'));
   const clipped=await page.locator('button:visible').evaluateAll(buttons=>buttons.filter(button=>{const box=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect();return text.width>0&&(text.left<box.left-1||text.right>box.right+1||text.top<box.top-2||text.bottom>box.bottom+2);}).map(button=>button.textContent.trim()));
   assert.deepEqual(clipped,[],'Visible button labels must stay inside their buttons');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,'Mobile/desktop page must not overflow horizontally');
   assert.deepEqual(errors,[],'No uncaught browser errors');
   await page.evaluate(()=>document.fonts.ready);
   if(process.env.PAPERAI_BROWSER_QA_DIR){fs.mkdirSync(process.env.PAPERAI_BROWSER_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PAPERAI_BROWSER_QA_DIR,'browser-'+width+'.png'),fullPage:true});if(width===390)fs.copyFileSync(file,path.join(process.env.PAPERAI_BROWSER_QA_DIR,'browser-paper.docx'));}
   console.log(JSON.stringify({viewport:width,pdfPages:pdf.pages,pdfRendered:true,pictures:5,wordMedia:5,localScriptFonts:fonts.length,undoRedo:true,horizontalOverflow:overflow,uncaughtErrors:errors.length,ai:'stubbed'}));
   await page.evaluate(()=>clearPaperData());assert.equal(await page.locator('#fileInput').inputValue(),'');assert.equal(await page.evaluate(()=>lastResult),null);assert.equal(await page.locator('#teachEditor').inputValue(),'');assert.equal(await page.locator('#textOut').textContent(),'');
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
