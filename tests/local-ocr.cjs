const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Layout=require('../frontend/vendor/local-ocr-layout.js'),Pdf=require('../frontend/vendor/pdf-editable-layout.js');
const tiles=Layout.tiles(1000,2400);
assert.equal(tiles[0].y,0);assert.equal(tiles.at(-1).y+tiles.at(-1).h,2400);
for(let i=1;i<tiles.length;i++)assert(tiles[i].y<tiles[i-1].y+tiles[i-1].h);
const prediction={'<OCR_WITH_REGION>':{labels:['I. Answer any ten.','(10 x 4 = 40)','1) Name the planet.'],quad_boxes:[[40,30,500,30,500,55,40,55],[800,30,940,30,940,55,800,55],[40,70,600,70,600,95,40,95]]}};
let regions=Layout.regions(prediction,1000,720);assert.equal(regions.length,3);
regions=Layout.merge([...regions,{...regions[2],y:regions[2].y+2}]);assert.equal(regions.length,3);
assert.equal(Layout.plainText(regions),'I. Answer any ten.    (10 x 4 = 40)\n1) Name the planet.');
assert.equal(Layout.regions({labels:['bad'],quad_boxes:[[NaN,0,1,2,3,4,5,6]]},100,100).length,0);
const scene=Layout.scene(regions,1000,1400,'data:image/png;base64,AA=='),xml=Pdf.documentXml([scene]);
assert(xml.includes('w:w="11906" w:h="16838"'));assert(xml.includes('w:left="720"'));
assert(xml.includes('<w:t xml:space="preserve">(10 x 4 = 40)</w:t>'));
assert.equal(scene.texts[1].x,800*595.3/1000);assert(xml.includes('behindDoc="1"'));
const grouped=Layout.readerRegions({blocks:[{paragraphs:[{lines:[{words:[
    {text:'Name',bbox:{x0:30,y0:20,x1:100,y1:50}},
    {text:'the planet.',bbox:{x0:111,y0:20,x1:240,y1:50}},
    {text:'(5)',bbox:{x0:850,y0:20,x1:900,y1:50}},
]}]}]}]},1000,1400);
assert.equal(grouped.length,2);assert.equal(grouped[0].text,'Name the planet.');assert.equal(grouped[1].text,'(5)');
assert.equal(grouped[0].erase.length,2,'Erase only actual word boxes, preserving whitespace diagrams and table rules');
assert.equal(grouped[1].x,850);
assert.equal(Layout.readerRegions({blocks:[{paragraphs:[{lines:[{words:[{text:'invalid',bbox:{x0:NaN,y0:0,x1:2,y1:3}}]}]}]}]},10,10).length,0);
const html=fs.readFileSync('frontend/index.html','utf8');
assert(html.includes('<h1>Extract text from anything</h1>'));assert(!html.includes('<h1>Upload.'));
assert(!/id="(?:modelSelect|switchModel|createPaperBtn)"/.test(html));
assert(!/id="(?:quotaRemaining|quotaUsed|quotaTrack|quotaPercent|quotaReset)"/.test(html),'Dashboard must not show shared daily percentages as paper progress');
assert(!html.includes('228 MB')&&!html.includes('MB downloaded'));
assert(html.includes('if (quota.blocked) return scanOnDevice(prepared, signal, progressText)'));
assert(html.includes('pages[i].ocrScene=saved.nativeScene||null'));

async function lifecycle(){
    const instances=[];
    class FakeWorker{constructor(url,options){this.url=url;this.options=options;instances.push(this);}postMessage(data){this.data=data;}terminate(){this.terminated=true;}}
    const context=vm.createContext({Worker:FakeWorker,WebAssembly,URL,DOMException,document:{currentScript:{src:'https://paperai.test/vendor/local-ocr.js'}},setTimeout,clearTimeout,location:{href:'https://paperai.test/'}});
    vm.runInContext(fs.readFileSync('frontend/vendor/local-ocr.js','utf8'),context);
    const scan=context.PaperAILocalOCR.recognize({});
    await assert.rejects(()=>context.PaperAILocalOCR.recognize({}),/already running/);
    let worker=instances[0];worker.onmessage({data:{id:worker.data.id,type:'result',regions}});
    assert.equal((await scan).regions.length,3);assert(!worker.terminated);
    const controller=new AbortController(),cancelled=context.PaperAILocalOCR.recognize({},{signal:controller.signal});
    controller.abort();await assert.rejects(()=>cancelled,{name:'AbortError'});assert(worker.terminated);
    const oldWorker=worker;
    const again=context.PaperAILocalOCR.recognize({});worker=instances[1];
    oldWorker.onerror();assert(!worker.terminated,'An old worker event cannot cancel a new scan');
    assert(worker.url.href.endsWith('/local-reader-worker.js'));worker.onerror();await assert.rejects(()=>again,/could not start/);assert(worker.terminated);
    const final=context.PaperAILocalOCR.recognize({});worker=instances[2];worker.onmessage({data:{id:worker.data.id,type:'result',regions}});await final;
}
async function readerBridge(){
    const messages=[],created=[];let detectError=false;
    const bbox={x0:10,y0:20,x1:150,y1:50};
    const context=vm.createContext({URL,importScripts(){},PaperAILocalLayout:Layout,self:{location:{href:'https://paperai.test/vendor/local-reader-worker.js'}},
        createImageBitmap:async()=>({width:1000,height:1400,close(){}}),postMessage:m=>messages.push(m),
        Tesseract:{createWorker:async(lang,oem,opts)=>{created.push({lang,oem,opts});return {
            detect:async()=>{if(detectError){opts.errorHandler('uncertain');throw Error('uncertain');}return {data:{script:'Devanagari'}};},
            setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{blocks:[{paragraphs:[{lines:[{words:[{text:'प्रश्न',bbox}]}]}]}]}})
        };}}});
    vm.runInContext(fs.readFileSync('frontend/vendor/local-reader-worker.js','utf8'),context);
    await context.self.onmessage({data:{id:1,blob:{}}});
    assert.deepEqual(created.map(x=>x.lang),['osd','hin+eng']);assert.equal(messages.at(-1).type,'result');
    assert(created.every(x=>x.opts.langPath.startsWith('https://paperai.test/')),'Language files must stay same-origin');
    detectError=true;await context.self.onmessage({data:{id:2,blob:{}}});
    assert.equal(messages.at(-1).type,'result','Uncertain script detection must still try English and Hindi');
    assert(!messages.some(m=>m.id===2&&m.type==='error'));
    await context.self.onmessage({data:{id:3,blob:{},language:'te'}});
    assert.equal(created.at(-1).lang,'tel+eng');assert.equal(messages.at(-1).type,'result');
}
(async()=>{await lifecycle();await readerBridge();console.log('Local OCR: literal language-aware text, word masks, right marks, A4 geometry, cancellation and recovery passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
