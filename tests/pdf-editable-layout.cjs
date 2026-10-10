const assert=require('node:assert/strict');
const fs=require('node:fs');
const pdfjs=require('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.js');
const JSZip=require('../frontend/node_modules/jszip');
const {DOMParser}=require('../frontend/node_modules/@xmldom/xmldom');
const Edit=require('../frontend/vendor/pdf-editable-layout.js');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=';
(async()=>{
    const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('training/fa-2 sci.pdf')),isEvalSupported:false,fontExtraProperties:true}).promise;
    const pages=[];
    try{for(let n=1;n<=pdf.numPages;n++)pages.push(await Edit.scene(await pdf.getPage(n),pdfjs));}finally{await pdf.destroy();}
    assert.equal(pages.length,12);assert(pages.every(p=>p.supported),'FA2 source must use measured layout');
    assert.equal(pages.reduce((n,p)=>n+p.images.length,0),12);
    assert.equal(pages[1].images.length,5,'Matching pictures must stay separate');
    assert.equal(pages[5].images.length,0,'Text-only pages must not become page pictures');
    assert(pages[3].images[0].w>450&&pages[3].images[0].h>350,'Plant diagram lost its measured extent');
    const g=Edit.geometry(pages);
    for(const p of pages)for(const b of [...p.texts,...p.images,...p.shapes]){
        assert(g.dx+b.x*g.scale>=35.99&&g.dy+b.y*g.scale>=35.99);
        assert(g.dx+(b.x+b.w+(b.text?3:0))*g.scale<=559.31);
        assert(g.dy+(b.y+b.h)*g.scale<=805.91);
    }
    for(const p of pages)for(const im of p.images)im.dataUrl='data:image/png;base64,'+png;
    const blob=await Edit.makeWord(pages,{Zip:JSZip}),zip=await JSZip.loadAsync(await blob.arrayBuffer());
    const xml=await zip.file('word/document.xml').async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    assert.equal(doc.getElementsByTagName('parsererror').length,0);
    assert.equal(doc.getElementsByTagName('w:sectPr').length,12,'Each source page needs one Word section');
    assert.equal(doc.getElementsByTagName('wps:txbx').length,pages.reduce((n,p)=>n+p.texts.length,0),'PDF text was flattened into pictures');
    assert.equal(doc.getElementsByTagName('pic:pic').length,12);
    for(const pic of [...doc.getElementsByTagName('pic:pic')]){
        let parent=pic;while(parent&&parent.tagName!=='wp:anchor')parent=parent.parentNode;
        assert.equal(parent.getAttribute('behindDoc'),'1','Source pictures must not cover overlaid class text');
    }
    assert(xml.includes('UKG-SCIENCE')&&!xml.includes('caption needs review')&&!xml.includes('>none<'));
    assert.equal((xml.match(/UKG-SCIENCE/g)||[]).length,1,'Header class text duplicated');
    assert(xml.includes('w:w="11906" w:h="16838"')&&xml.includes('w:top="720" w:right="720" w:bottom="720" w:left="720"'));
    assert.equal(Object.keys(zip.files).filter(n=>n.endsWith('.png')).length,12);
    const rels=await zip.file('word/_rels/document.xml.rels').async('text');
    for(let n=1;n<=12;n++)assert(rels.includes('rIdPicture'+n+'"'));
    assert.throws(()=>Edit.documentXml([{supported:false}]),/OCR layout path/,'Unsupported drawing geometry must not silently disappear');
    console.log('Measured PDF: all 12 FA2 pages, 12 separate source pictures, editable text/rules, banner layering and A4 narrow bounds pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
