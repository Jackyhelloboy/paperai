(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PaperAIPagePipeline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // Each page may itself use an automatic backup. Keep the default conservative
  // so a large document cannot flood shared provider capacity or phone memory.
  const DEFAULT_CONCURRENCY=2;
  // Browser hints are optional (Safari and privacy settings often omit them).
  // Never infer capacity from screen size: a phone may open a desktop viewport.
  function recommendedConcurrency(device={}){
    const memory=Number(device.deviceMemory),cores=Number(device.hardwareConcurrency);
    if(Number.isFinite(memory)&&memory>0&&memory<=2)return 1;
    if(memory>=8&&cores>=4&&!device.connection?.saveData)return 3;
    return DEFAULT_CONCURRENCY;
  }
  async function run({items,results=[],process,signal,concurrency=DEFAULT_CONCURRENCY,onProgress=()=>{}}){
    const limit=Math.max(1,Math.min(4,Math.floor(Number(concurrency)||DEFAULT_CONCURRENCY)));
    const pending=items.map((_,index)=>index).filter(index=>!results[index]);
    const active=new Set(),errors=[];
    let next=0;
    const snapshot=()=>({total:items.length,completed:results.filter(Boolean).length,active:[...active],failed:errors.length});
    const report=()=>onProgress(snapshot());
    report();
    async function worker(){
      while(next<pending.length&&!signal?.aborted&&!errors.length){
        const index=pending[next++];
        active.add(index);report();
        try {
          const result=await process(items[index],index,signal);
          // A successful in-flight peer is still valuable after another page
          // failed or the user cancelled. Save it before stopping this worker.
          if(result==null)throw new Error('A page returned no result.');
          results[index]=result;
        } catch(error) { errors.push({index,error}); }
        finally { active.delete(index);report(); }
      }
    }
    await Promise.all(Array.from({length:Math.min(limit,pending.length)},worker));
    return {...snapshot(),results,errors,cancelled:!!signal?.aborted};
  }
  return {DEFAULT_CONCURRENCY,recommendedConcurrency,run};
});
