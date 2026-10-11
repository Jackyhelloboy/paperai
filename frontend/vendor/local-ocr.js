(function(root){
    'use strict';
    let worker=null,pending=null,sequence=0;
    const script=document.currentScript?.src||new URL('vendor/local-ocr.js',location.href).href;
    function reset(){worker?.terminate();worker=null;}
    function recognize(blob,{signal,onProgress=()=>{}}={}){
        if(signal?.aborted)return Promise.reject(new DOMException('Scan cancelled.','AbortError'));
        if(pending)return Promise.reject(new Error('A scan is already running on this device.'));
        if(!root.Worker||!root.WebAssembly)return Promise.reject(new Error('This browser cannot run the quota-free OCR model. Use an up-to-date Chrome, Edge or Firefox browser.'));
        return new Promise((resolve,reject)=>{
            const id=++sequence;
            const finish=(error,result)=>{
                signal?.removeEventListener('abort',abort);pending=null;
                if(error){reset();reject(error);}else resolve(result);
            };
            const abort=()=>finish(new DOMException('Scan cancelled.','AbortError'));
            pending={id};signal?.addEventListener('abort',abort,{once:true});
            try{
                worker ||= new Worker(new URL('local-ocr-worker.mjs',script),{type:'module'});
                worker.onmessage=({data})=>{
                    if(data.id!==id||pending?.id!==id)return;
                    if(data.type==='progress')onProgress(data);
                    else if(data.type==='result')finish(null,data);
                    else if(data.type==='error')finish(new Error('On-device OCR: '+data.message));
                };
                worker.onerror=()=>finish(new Error('The on-device model could not start. Its first use needs an internet connection and enough device memory. Please retry or use the default AI after its reset.'));
                worker.postMessage({id,blob});
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
        for(const r of result.regions)context.fillRect(r.x,r.y,r.w,r.h);
        const scene=PaperAILocalLayout.scene(result.regions,result.width,result.height,canvas.toDataURL('image/png'));
        canvas.width=canvas.height=0;return scene;
    }
    root.PaperAILocalOCR=Object.freeze({recognize,page});
})(globalThis);
