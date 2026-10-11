// Stage only deployable assets. node_modules and model weights must never become
// public Pages files. The pinned npm runtime supplies the same-origin WASM engine.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'frontend'),out=path.join(root,'build/cloudflare-pages');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
fs.cpSync(source,out,{recursive:true,filter:p=>!['node_modules','.vercel','.gitignore','package.json','package-lock.json'].includes(path.basename(p))});
const runtime=path.join(out,'vendor/local-runtime');fs.mkdirSync(runtime,{recursive:true});
for(const file of ['transformers.min.js','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']){
    const from=path.join(source,'node_modules/@huggingface/transformers/dist',file);
    if(fs.statSync(from).size>25*1024*1024)throw new Error('Pages asset exceeds 25 MiB: '+file);
    fs.copyFileSync(from,path.join(runtime,file));
}
fs.copyFileSync(path.join(source,'node_modules/@huggingface/transformers/LICENSE'),path.join(runtime,'LICENSE.txt'));
console.log('Pages assets staged with Transformers.js 3.8.1 and local WASM runtime.');
