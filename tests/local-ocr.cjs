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
const html=fs.readFileSync('frontend/index.html','utf8');
assert(html.includes('<h1>Extract text from anything</h1>'));assert(!html.includes('<h1>Upload.'));
assert(!/id="(?:modelSelect|switchModel|createPaperBtn)"/.test(html));
assert(html.includes('if (quota.blocked) return scanOnDevice(prepared, signal, progressText)'));
assert(html.includes('pages[i].ocrScene=saved.nativeScene||null'));

async function lifecycle(){
    const instances=[];
    class FakeWorker{constructor(url,options){this.url=url;this.options=options;instances.push(this);}postMessage(data){this.data=data;}terminate(){this.terminated=true;}}
    const context=vm.createContext({Worker:FakeWorker,WebAssembly,URL,DOMException,document:{currentScript:{src:'https://paperai.test/vendor/local-ocr.js'}},location:{href:'https://paperai.test/'}});
    vm.runInContext(fs.readFileSync('frontend/vendor/local-ocr.js','utf8'),context);
    const scan=context.PaperAILocalOCR.recognize({});
    await assert.rejects(()=>context.PaperAILocalOCR.recognize({}),/already running/);
    let worker=instances[0];worker.onmessage({data:{id:worker.data.id,type:'result',regions}});
    assert.equal((await scan).regions.length,3);assert(!worker.terminated);
    const controller=new AbortController(),cancelled=context.PaperAILocalOCR.recognize({},{signal:controller.signal});
    controller.abort();await assert.rejects(()=>cancelled,{name:'AbortError'});assert(worker.terminated);
    const again=context.PaperAILocalOCR.recognize({});worker=instances[1];
    assert.equal(worker.options.type,'module');worker.onerror();await assert.rejects(()=>again,/could not start/);assert(worker.terminated);
    const final=context.PaperAILocalOCR.recognize({});worker=instances[2];worker.onmessage({data:{id:worker.data.id,type:'result',regions}});await final;
}
lifecycle().then(()=>console.log('Local OCR: literal text, right-side marks, A4 geometry, overlap deduplication, one scan at a time, cancellation and recovery passed.')).catch(e=>{console.error(e);process.exitCode=1;});
