// Language packs are pinned, self-hosted and cached. Only the detected/selected
// language is fetched by the browser; no inference request leaves the device.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const revision='87416418657359cb625c412a48b6e1d6d41c29bd';
const languages=['osd','eng','hin','tel','tam','kan','mal','mar','ben','guj','pan','ori','urd'];
async function stageReader(source,out){
    const runtime=path.join(out,'vendor/local-runtime'),packs=path.join(runtime,'languages');
    fs.mkdirSync(packs,{recursive:true});
    for(const [from,to] of [['tesseract.js/dist/tesseract.min.js','reader.js'],['tesseract.js/dist/worker.min.js','reader-worker.js'],
        ...['','-simd','-lstm','-simd-lstm'].map(v=>['tesseract.js-core/tesseract-core'+v+'.wasm.js','tesseract-core'+v+'.wasm.js']),
        ['tesseract.js/LICENSE.md','LICENSE.txt'],['tesseract.js/dist/tesseract.min.js.LICENSE.txt','reader.js.LICENSE.txt'],['tesseract.js/dist/worker.min.js.LICENSE.txt','reader-worker.js.LICENSE.txt'],['tesseract.js-core/LICENSE','core-LICENSE.txt']]){
        fs.copyFileSync(path.join(source,'node_modules',from),path.join(runtime,to));
    }
    const manifest={runtime:'tesseract.js@6.0.1',revision,files:[]};
    const download=async name=>{
        const url=`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${revision}/${name}`;
        const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
        if(!response.ok)throw new Error('Reader asset unavailable: '+name+' ('+response.status+')');
        return Buffer.from(await response.arrayBuffer());
    };
    // Bound build traffic; every asset must fit the Pages per-file limit.
    for(let i=0;i<languages.length;i+=3){
        await Promise.all(languages.slice(i,i+3).map(async code=>{
            const bytes=zlib.gzipSync(await download(code+'.traineddata'));
            if(bytes.length>25*1024*1024)throw new Error('Reader pack exceeds asset limit: '+code);
            fs.writeFileSync(path.join(packs,code+'.traineddata.gz'),bytes);
            manifest.files.push({code,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
        }));
    }
    fs.writeFileSync(path.join(packs,'LICENSE.txt'),await download('LICENSE'));
    manifest.files.sort((a,b)=>a.code.localeCompare(b.code));
    fs.writeFileSync(path.join(runtime,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    return manifest;
}
module.exports={stageReader,languages,revision};
