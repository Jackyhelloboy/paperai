(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PaperAIScanClient=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function create({fetcher,randomId=()=>crypto.randomUUID(),now=()=>Date.now(),
    pause=(ms,signal)=>new Promise((resolve,reject)=>{
      let finished=false;
      const close=()=>{
        if(finished)return false;finished=true;clearTimeout(timer);
        signal?.removeEventListener('abort',cancel);
        if(typeof document!=='undefined')document.removeEventListener('visibilitychange',wake);
        if(typeof window!=='undefined')window.removeEventListener('pageshow',wake);
        return true;
      };
      const cancel=()=>{if(close())reject(new DOMException('Scan cancelled.','AbortError'));};
      const wake=()=>{if(typeof document==='undefined'||document.visibilityState==='visible')if(close())resolve();};
      const timer=setTimeout(()=>{if(close())resolve();},ms);
      if(typeof document!=='undefined')document.addEventListener('visibilitychange',wake);
      if(typeof window!=='undefined')window.addEventListener('pageshow',wake);
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    })}){
    const jobs=new WeakMap();
    async function request({source,language,body,signal,onProgress=()=>{}}){
      let languages=jobs.get(source);
      if(!languages){languages=new Map();jobs.set(source,languages);}
      let job=languages.get(language);
      let submit=!job;
      if(!job){job={id:randomId()};languages.set(language,job);}
      const started=now();let deadline=started+180000,hiddenAt=null;
      const visibility=()=>{
        if(typeof document==='undefined')return;
        if(document.visibilityState==='hidden'&&hiddenAt===null)hiddenAt=now();
        else if(document.visibilityState==='visible'&&hiddenAt!==null){deadline+=Math.max(0,now()-hiddenAt);hiddenAt=null;}
      };
      if(typeof document!=='undefined'){
        document.addEventListener('visibilitychange',visibility);
        visibility();
      }
      let failures=0,submissions=0;
      try{while(now()<deadline){
        if(signal?.aborted)throw new DOMException('Scan cancelled.','AbortError');
        const controller=new AbortController();
        const cancel=()=>controller.abort();
        signal?.addEventListener('abort',cancel,{once:true});
        const timer=setTimeout(cancel,submit?30000:12000);
        let response;
        try{
          response=await fetcher(submit?'/api/ocr':'/api/ocr-status',{
            method:submit?'POST':'GET',headers:{'X-PaperAI-Request-ID':job.id},
            ...(submit?{body}:{}),cache:'no-store',signal:controller.signal
          });
          if(submit)submissions++;
        }catch(error){
          if(signal?.aborted)throw error;
          if(++failures>=4)throw new Error('The connection to PaperAI was interrupted. Retry / resume to collect this page.');
          // A failed upload may already be running. Check its ID before ever
          // uploading again; the server also deduplicates this exact ID.
          submit=false;
          onProgress('Reconnecting to this page…');
          await pause(1000*failures,signal);
          continue;
        }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
        if(response.status===404&&!submit){
          if(submissions>=2){languages.delete(language);return response;}
          submit=true;await pause(500,signal);continue;
        }
        if([502,503,504].includes(response.status)){
          let code='';try{code=(await response.clone().json()).code;}catch(_){}
          // Only transport failures are ambiguous. A completed AI error is
          // returned to the caller so any explicit retry gets a new job ID.
          if(!code||code==='OCR_PROXY_UNREACHABLE'){
            if(++failures>=4)throw new Error('PaperAI is temporarily unreachable. Retry / resume to collect this page.');
            submit=false;onProgress('Reconnecting to this page…');await pause(1000*failures,signal);continue;
          }
        }
        failures=0;
        if(response.status!==202){languages.delete(language);return response;}
        submit=false;
        onProgress('Reading this page · '+Math.round((now()-started)/1000)+'s');
        await pause(1500,signal);
      }
      throw new Error('This page is taking longer than expected. Retry / resume to collect its result.');
      }finally{if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visibility);}
    }
    return {request};
  }
  return {create};
});
