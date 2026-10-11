(function(root){
    'use strict';
    let worker=null,pending=null,sequence=0;
    const script=document.currentScript?.src||new URL('vendor/local-ocr.js',location.href).href;
    function reset(){worker?.terminate();worker=null;}
    function recognize(blob,{signal,language='auto',onProgress=()=>{}}={}){
        if(signal?.aborted)return Promise.reject(new DOMException('Scan cancelled.','AbortError'));
        if(pending)return Promise.reject(new Error('A scan is already running on this device.'));
        if(!root.Worker||!root.WebAssembly)return Promise.reject(new Error('This browser cannot run the PaperAI scanner. Use an up-to-date Chrome, Edge or Firefox browser.'));
        return new Promise((resolve,reject)=>{
            const id=++sequence;
            const finish=(error,result)=>{
                if(pending?.id!==id)return;
                signal?.removeEventListener('abort',abort);clearTimeout(timer);pending=null;
                if(error){reset();reject(error);}else resolve(result);
            };
            const abort=()=>finish(new DOMException('Scan cancelled.','AbortError'));
            const timer=setTimeout(()=>finish(new Error('Reading took too long. Please check your connection and retry; completed PDF pages are kept.')),180000);
            pending={id};signal?.addEventListener('abort',abort,{once:true});
            try{
                worker ||= new Worker(new URL('local-reader-worker.js',script));
                worker.onmessage=({data})=>{
                    if(data.id!==id||pending?.id!==id)return;
                    if(data.type==='progress')onProgress(data);
                    else if(data.type==='result')finish(null,data);
                    else if(data.type==='error')finish(new Error(data.message || 'This page could not be read. Please try again.'));
                };
                worker.onerror=()=>finish(new Error('The PaperAI scanner could not start. Its first use needs an internet connection and enough device memory. Please retry or use the scanner after the daily reset.'));
                worker.postMessage({id,blob,language});
            }catch(error){finish(error);}
        });
    }
    async function page(blob,result){
        const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
        canvas.width=bitmap.width;canvas.height=bitmap.height;
        const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
        // Remove recognized source glyphs only. Unread text, drawings, boxes and table
        // borders remain source pixels, so the fallback never invents an illustration.
        context.fillStyle='#ffffff';
        for(const r of result.regions)for(const box of r.erase||[r])context.fillRect(Math.max(0,box.x-1),Math.max(0,box.y-1),box.w+2,box.h+2);
        const scene=PaperAILocalLayout.scene(result.regions,result.width,result.height,canvas.toDataURL('image/png'));
        canvas.width=canvas.height=0;return scene;
    }
    root.PaperAILocalOCR=Object.freeze({recognize,page});
})(globalThis);
