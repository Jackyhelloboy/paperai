// Keep every editable object from the supplied Word references when fitting A4.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Zip=require('../frontend/node_modules/jszip');
const {DOMParser:Parser,XMLSerializer:Serializer}=require('../frontend/node_modules/@xmldom/xmldom');
const Reference=require('../frontend/vendor/docx-reference-layout.js');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const parse=xml=>new Parser().parseFromString(xml,'application/xml');
const values=(doc,name)=>Array.from(doc.getElementsByTagNameNS(W,name)).map(x=>x.textContent);
const records=JSON.parse(fs.readFileSync('training/corpus-review.json','utf8')).records.filter(r=>r.kind==='reference'&&r.file.endsWith('.docx')&&!r.file.includes('Declaration'));
(async()=>{
    assert.equal(records.length,12,'The complete authored Word reference set must be checked');
    const results=[];
    for(const record of records){
        const bytes=fs.readFileSync(path.join('training',record.file)),before=await Zip.loadAsync(bytes);
        const output=await Reference.makeWord(bytes,{Zip,Parser,Serializer}),after=await Zip.loadAsync(await output.arrayBuffer());
        assert.deepEqual(Object.keys(after.files).sort(),Object.keys(before.files).sort(),'Package parts were removed or invented');
        for(const name of Object.keys(before.files).filter(n=>!before.files[n].dir)){
            if(/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)){
                const old=parse(await before.file(name).async('text')),doc=parse(await after.file(name).async('text'));
                assert.deepEqual(values(doc,'t'),values(old,'t'),'Question text or header text changed');
                for(const tag of ['tbl','drawing','pict','gridSpan','vMerge','tab','u','numPr','footnoteReference'])assert.equal(doc.getElementsByTagNameNS(W,tag).length,old.getElementsByTagNameNS(W,tag).length,tag+' objects changed');
                for(const size of Array.from(doc.getElementsByTagNameNS(W,'pgSz'))){assert.equal(size.getAttributeNS(W,'w'),'11906');assert.equal(size.getAttributeNS(W,'h'),'16838');}
                for(const margin of Array.from(doc.getElementsByTagNameNS(W,'pgMar')))for(const side of ['top','bottom','left','right'])assert.equal(margin.getAttributeNS(W,side),'720');
                assert.equal(doc.getElementsByTagNameNS(W,'tblpPr').length,0,'Floating tables must not wrap questions into narrow side strips');
            }else assert.deepEqual(await after.file(name).async('uint8array'),await before.file(name).async('uint8array'),name+' was altered');
        }
        const outputName=record.id+'.docx';
        if(process.env.PAPERAI_REFERENCE_OUT){fs.mkdirSync(process.env.PAPERAI_REFERENCE_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.PAPERAI_REFERENCE_OUT,outputName),Buffer.from(await output.arrayBuffer()));}
        results.push({source:record.file,output:outputName,packageParts:Object.keys(before.files).length,unchangedText:true,unchangedMediaAndStyles:true});
    }
    const xml='<w:document xmlns:w="'+W+'" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body><w:tbl><w:tblPr><w:tblW w:w="14000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="6000"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Merged question</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:extent cx="8890000" cy="4445000"/><a:graphic><a:graphicData><wps:wsp><wps:spPr><a:xfrm><a:ext cx="8890000" cy="4445000"/></a:xfrm><a:prstGeom prst="triangle"/></wps:spPr></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:left="1440"/></w:sectPr></w:body></w:document>';
    const fitted=parse(Reference.normaliseXml(xml,{Parser,Serializer}));
    assert.equal(Array.from(fitted.getElementsByTagNameNS(W,'gridCol')).reduce((n,x)=>n+Number(x.getAttributeNS(W,'w')),0),10466);
    assert.equal(fitted.getElementsByTagNameNS(W,'gridSpan')[0].getAttributeNS(W,'val'),'2');
    assert.equal(fitted.getElementsByTagNameNS(W,'vMerge')[0].getAttributeNS(W,'val'),'restart');
    const extent=fitted.getElementsByTagName('wp:extent')[0];
    assert.equal(Number(extent.getAttribute('cx')),10466*635);assert.equal(Number(extent.getAttribute('cy')),10466*635/2);
    assert.equal(fitted.getElementsByTagName('a:prstGeom')[0].getAttribute('prst'),'triangle');
    const anchored=parse(Reference.normaliseXml(xml.replace(/wp:inline/g,'wp:anchor'),{Parser,Serializer}));
    assert.equal(anchored.getElementsByTagName('wp:extent')[0].getAttribute('cx'),'8890000','Compound anchored objects must retain their internal geometry');
    const heading=parse(Reference.normaliseXml('<w:document xmlns:w="'+W+'"><w:body><w:p><w:r><w:t>V. Answer the questions.</w:t></w:r></w:p><w:p><w:r><w:t>1. Name a plant.</w:t></w:r></w:p></w:body></w:document>',{Parser,Serializer}));
    assert.equal(heading.getElementsByTagNameNS(W,'keepNext').length,1,'A native Word heading must stay attached to its first question');
    await assert.rejects(()=>Reference.makeWord(awaitableEmpty(),{Zip,Parser,Serializer}),/not a Word document/);
    if(process.env.PAPERAI_REFERENCE_OUT)fs.writeFileSync(path.join(process.env.PAPERAI_REFERENCE_OUT,'package-checks.json'),JSON.stringify(results,null,2)+'\n');
    console.log('All 12 authored Word references retain text, original media, styles, relationships and editable objects on A4; overflow geometry and merged-cell checks pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
function awaitableEmpty(){return new Zip().generateAsync({type:'uint8array'});}
