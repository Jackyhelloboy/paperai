import {Florence2ForConditionalGeneration,AutoProcessor,RawImage,env} from './local-runtime/transformers.min.js';
import './local-ocr-layout.js';

const MODEL='onnx-community/Florence-2-base-ft';
const REVISION='e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f';
env.allowLocalModels=false;
env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths=new URL('./local-runtime/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let loading=null,busy=false;
function hasInk(image){
    let dark=0,samples=0;
    for(let i=0;i<image.data.length;i+=image.channels*4){
        const gray=(image.data[i]+image.data[i+Math.min(1,image.channels-1)]+image.data[i+Math.min(2,image.channels-1)])/3;
        if(gray<180)dark++;samples++;
    }
    return dark>Math.max(10,samples*.0008);
}
async function load(id){
    if(!loading)loading=(async()=>{
        const model=await Florence2ForConditionalGeneration.from_pretrained(MODEL,{revision:REVISION,device:'wasm',
            dtype:{embed_tokens:'q8',vision_encoder:'q8',encoder_model:'q4',decoder_model_merged:'q4'},
            progress_callback:p=>{
                if(['initiate','progress','done'].includes(p.status))postMessage({id,type:'progress',stage:'download',file:p.file,loaded:p.loaded,total:p.total,status:p.status});
            }});
        const processor=await AutoProcessor.from_pretrained(MODEL,{revision:REVISION});
        return {model,processor};
    })();
    try{return await loading;}catch(e){loading=null;throw e;}
}
async function readTile(image,tile,model,processor,depth=0){
    const crop=await image.crop([tile.x,tile.y,tile.x+tile.w-1,tile.y+tile.h-1]);
    if(!hasInk(crop))return [];
    const task='<OCR_WITH_REGION>',inputs=await processor(crop,processor.construct_prompts(task));
    let ids,decoded;
    try{
        ids=await model.generate({...inputs,max_new_tokens:768,num_beams:1,do_sample:false});
        decoded=processor.batch_decode(ids,{skip_special_tokens:false})[0];
    }finally{for(const v of Object.values(inputs))v?.dispose?.();ids?.dispose?.();}
    if(!decoded.includes('</s>')){
        if(depth>=2)throw new Error('A dense region exceeded the local reading limit. The default AI will be used again after its reset.');
        const middle=Math.round(tile.h/2),overlap=Math.min(middle-1,Math.round(tile.w*.03));
        const top={...tile,h:middle+overlap},bottom={...tile,y:tile.y+middle-overlap,h:tile.h-middle+overlap};
        return [...await readTile(image,top,model,processor,depth+1),...await readTile(image,bottom,model,processor,depth+1)];
    }
    return PaperAILocalLayout.regions(processor.post_process_generation(decoded,task,crop.size),crop.width,crop.height,tile.y);
}
self.onmessage=async event=>{
    const {id,blob}=event.data||{};
    if(busy){postMessage({id,type:'error',message:'Another local scan is already running.'});return;}
    busy=true;let url;
    try{
        postMessage({id,type:'progress',stage:'loading'});
        const {model,processor}=await load(id);
        url=URL.createObjectURL(blob);
        const image=await RawImage.read(url),tiles=PaperAILocalLayout.tiles(image.width,image.height),all=[];
        for(let i=0;i<tiles.length;i++){
            const tile=tiles[i];
            postMessage({id,type:'progress',stage:'scan',current:i+1,total:tiles.length});
            all.push(...await readTile(image,tile,model,processor));
        }
        const regions=PaperAILocalLayout.merge(all);
        if(!regions.length)throw new Error('The on-device model could not read this page. Keep the source and retry the default AI after its reset.');
        postMessage({id,type:'result',regions,width:image.width,height:image.height,model:MODEL,revision:REVISION});
    }catch(error){postMessage({id,type:'error',message:error?.message||String(error)});}
    finally{if(url)URL.revokeObjectURL(url);busy=false;}
};
