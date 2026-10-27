(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PaperAIScanCheckpoints=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='paperai-scan-v6-picture-evidence',TTL=24*60*60*1000,MAX_BYTES=20*1024*1024;
  // Only completed OCR pages are stored, never the uploaded PDF or credentials.
  // Re-selecting the exact PDF is required after refresh. Its complete SHA-256
  // digest, language and extraction version prevent same-name/cross-mode reuse.
  async function fingerprint(file,language='auto',version=VERSION){
    if(!globalThis.crypto?.subtle)return null;
    const digest=await globalThis.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    return version+':'+encodeURIComponent(language)+':'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  }
  function indexedStorage(indexedDB=globalThis.indexedDB){
    let database;
    const open=()=>database||(database=new Promise((resolve,reject)=>{
      if(!indexedDB){reject(new Error('Local checkpoint storage unavailable.'));return;}
      const request=indexedDB.open('paperai-local-scans',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('checkpoints',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{database=null;reject(request.error);};
    }));
    async function transaction(mode,action){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('checkpoints',mode),store=tx.objectStore('checkpoints');
        let value;
        const request=action(store);
        request.onsuccess=()=>{value=request.result;};
        tx.oncomplete=()=>resolve(value);
        tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Local checkpoint save interrupted.'));
      });
    }
    return {get:key=>transaction('readonly',s=>s.get(key)),all:()=>transaction('readonly',s=>s.getAll()),put:value=>transaction('readwrite',s=>s.put(value)),remove:key=>transaction('readwrite',s=>s.delete(key)),clear:()=>transaction('readwrite',s=>s.clear())};
  }
  function create({storage=indexedStorage(),now=()=>Date.now(),ttl=TTL,maxBytes=MAX_BYTES,onUnavailable=()=>{}}={}){
    let queue=Promise.resolve();
    const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const safe=async action=>{try{return await action();}catch(error){onUnavailable(error);return null;}};
    async function prune(){
      const entries=await storage.all();
      let total=0;
      for(const entry of entries.sort((a,b)=>b.updatedAt-a.updatedAt)){
        const size=bytes(entry);
        if(!Number.isFinite(entry.updatedAt)||now()-entry.updatedAt>ttl||entry.updatedAt>now()+60000||total+size>maxBytes)await storage.remove(entry.key);
        else total+=size;
      }
    }
    async function load(key,pageCount){
      if(!key)return null;
      await queue;
      return safe(async()=>{
        await prune();const record=await storage.get(key);
        if(!record||record.pageCount!==pageCount||!Array.isArray(record.results))return null;
        return record.results.slice(0,pageCount);
      });
    }
    function savePage(key,pageCount,index,result){
      if(!key||!Number.isInteger(pageCount)||pageCount<1||!Number.isInteger(index)||index<0||index>=pageCount||!result||typeof result.text!=='string')return Promise.resolve(false);
      // Serial read/merge/write avoids losing a peer's result when pages finish together.
      const operation=queue.then(()=>safe(async()=>{
        const prior=await storage.get(key);
        const results=prior?.pageCount===pageCount&&Array.isArray(prior.results)?prior.results.slice():[];
        results[index]=result;
        const record={key,pageCount,results,updatedAt:now()};
        // An oversized later page must not erase earlier recoverable work.
        if(bytes(record)>maxBytes)return false;
        await storage.put(record);await prune();return true;
      }));
      queue=operation.then(()=>undefined,()=>undefined);return operation;
    }
    const remove=key=>{const operation=queue.then(()=>safe(()=>storage.remove(key)));queue=operation.then(()=>undefined,()=>undefined);return operation;};
    const clear=()=>{const operation=queue.then(()=>safe(()=>storage.clear()));queue=operation.then(()=>undefined,()=>undefined);return operation;};
    return {load,savePage,remove,clear,flush:()=>queue};
  }
  return {VERSION,TTL,MAX_BYTES,fingerprint,indexedStorage,create};
});
