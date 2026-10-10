const assert = require('node:assert/strict');
const {documentXml, pageGeometry, makePdfWord} = require('../frontend/vendor/pdf-word-layout.js');

async function main() {
    const pages = Array.from({length:12},(_,i)=>({width:i===1?842:595.32,height:i===1?595:841.92}));
    const xml = documentXml(pages);
    assert.equal((xml.match(/<wp:inline /g)||[]).length,12);
    assert.equal((xml.match(/<w:sectPr>/g)||[]).length,12);
    assert(!xml.includes('wp:anchor') && !xml.includes('position:absolute'));
    for(let i=1;i<=12;i++) assert(xml.includes('r:embed="rIdPage'+i+'"'));
    assert(xml.includes('w:w="16840" w:h="11900"'), 'landscape size lost');
    assert(Math.max(...Object.values(pageGeometry(4000,8000)))<=31680);
    assert.throws(()=>pageGeometry(NaN,20));
    assert.throws(()=>documentXml([]));

    // Exercise orchestration and package relationships, not just XML strings.
    let files, destroyed=0, cleaned=0;
    class Zip {
        constructor(){files=new Map();}
        file(name,data){files.set(name,data);return this;}
        async generateAsync(){return files;}
    }
    const pdf={numPages:12,async getPage(i){return {
        getViewport({scale}){return {width:pages[i-1].width*scale,height:pages[i-1].height*scale};},
        render(){return {promise:Promise.resolve()};},cleanup(){cleaned++;}
    };},async destroy(){destroyed++;}};
    const pdfjs={getDocument(){return {promise:Promise.resolve(pdf)};}};
    const canvases=[];
    const createCanvas=()=>{const c={getContext(){return {};},toBlob(cb){cb({arrayBuffer:async()=>new ArrayBuffer(4)});}};canvases.push(c);return c;};
    await makePdfWord({arrayBuffer:async()=>new ArrayBuffer(1)},{pdfjs,Zip,createCanvas});
    assert.equal(files.size,16);
    assert.equal(cleaned,12);assert.equal(destroyed,1);
    assert(canvases.every(c=>c.width===0&&c.height===0));
    assert.equal((files.get('word/_rels/document.xml.rels').match(/<Relationship /g)||[]).length,12);
    assert(files.has('word/media/page-12.png'));
    const badCanvas=()=>({getContext(){return {};},toBlob(cb){cb(null);}});
    await assert.rejects(makePdfWord({arrayBuffer:async()=>new ArrayBuffer(1)},{pdfjs,Zip,createCanvas:badCanvas}),/Could not render PDF page 1/);
    assert.equal(destroyed,2, 'PDF must be released after failures');
    console.log('PDF Word regression: 12 distinct inline pages, mixed page sizes, image relationships and cleanup pass.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
