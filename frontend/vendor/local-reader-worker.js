/* Automatic literal text reader. No question generation or answer generation. */
importScripts('local-runtime/reader.js','local-ocr-layout.js');
let reader=null,readerLanguages='',busy=false,progressId=null;
const languages={en:'eng',hi:'hin',te:'tel',ta:'tam',kn:'kan',ml:'mal',mr:'mar',bn:'ben',gu:'guj',pa:'pan',or:'ori',ur:'urd',ks:'urd'};
const scripts={Latin:'eng',Devanagari:'hin',Telugu:'tel',Tamil:'tam',Kannada:'kan',Malayalam:'mal',Bengali:'ben',Gujarati:'guj',Gurmukhi:'pan',Oriya:'ori',Arabic:'urd'};
const base=new URL('local-runtime/',self.location.href).href;
const options={workerPath:base+'reader-worker.js',corePath:base,langPath:base+'languages',
    cachePath:'paperai-language-reader-v1',gzip:true,workerBlobURL:false,
    logger:p=>{if(progressId!==null)postMessage({id:progressId,type:'progress',stage:p.status==='recognizing text'?'scan':'setup'});},
    // Report initialization errors too; upstream can otherwise leave startup pending.
    errorHandler:()=>{if(progressId!==null)postMessage({id:progressId,type:'error',message:'The reader could not start. Check your connection and retry.'});}};
async function languageFor(blob,selected){
    if(selected!=='auto')return languages[selected]||'eng';
    postMessage({id:progressId,type:'progress',stage:'detect'});
    let detector;
    try{
        let fail;const failed=new Promise((_,reject)=>{fail=reject;});
        detector=await Promise.race([Tesseract.createWorker('osd',0,{...options,legacyCore:true,legacyLang:true,errorHandler:fail}),failed]);
        const {data}=await detector.detect(blob);
        return data.script_confidence!==null&&data.script_confidence<3?'eng+hin':scripts[data.script]||'eng+hin';
    }catch(_){return 'eng+hin';}
    finally{await detector?.terminate();}
}
self.onmessage=async({data:{id,blob,language='auto'}})=>{
    if(busy){postMessage({id,type:'error',message:'A scan is already running.'});return;}
    busy=true;progressId=id;
    try{
        const detected=await languageFor(blob,language);
        const selected=detected==='eng'?'eng':detected.includes('+')?detected:detected+'+eng';
        if(!reader||readerLanguages!==selected){
            await reader?.terminate();reader=null;
            reader=await Tesseract.createWorker(selected,1,options,{load_system_dawg:'0',load_freq_dawg:'0',load_unambig_dawg:'0',load_bigram_dawg:'0'});
            readerLanguages=selected;
            await reader.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',user_defined_dpi:'300'});
        }
        postMessage({id,type:'progress',stage:'scan'});
        const bitmap=await createImageBitmap(blob),width=bitmap.width,height=bitmap.height;bitmap.close();
        const {data}=await reader.recognize(blob,{}, {blocks:true,text:true});
        const regions=PaperAILocalLayout.readerRegions(data,width,height);
        if(!regions.length)throw new Error('No readable text found. Use a clear, well-lit scan and retry.');
        postMessage({id,type:'result',regions,width,height,confidence:data.confidence,language:selected});
    }catch(error){
        await reader?.terminate();reader=null;readerLanguages='';
        postMessage({id,type:'error',message:error?.message?.startsWith('No readable')?error.message:'This page could not be read. Check your connection and use a clear scan, then retry.'});
    }finally{busy=false;progressId=null;}
};
