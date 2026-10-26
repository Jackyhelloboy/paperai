const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('worker/src/index.js','utf8');
const code=source.slice(source.indexOf('async function runInference('),source.indexOf('const SUGGESTION_LANGUAGES'));
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
(async()=>{
 for(const winner of ['primary','gemini','primary-after-backup-failure']){
  const primary=defer(),backup=defer();let primaryCalls=0,backupCalls=0;
  const ctx=vm.createContext({console:{log(){}},Date,Promise,AbortController,PRIMARY_MODEL:'primary',PAGE_SCAN_BUDGET_MS:70000,
   confirmedFreeLimit:async()=>false,nearPrimaryDailyReserve:async()=>false,runGemini:()=>{backupCalls++;return backup.promise;},
   withinScanBudget:async fn=>fn(),scanServiceError:(code,message)=>Object.assign(new Error(message),{code}),
   isDailyFreeLimitError:()=>false,isPaidModelRequiredError:()=>false,isTransientAiError:()=>false,isAiTimeoutError:()=>false,
   normaliseMarkerRows:String,extractAiText:r=>r.text,degenerateOcr:()=>false,invalidLayoutMarkers:()=>false});
  vm.runInContext(code,ctx);
  const result=ctx.runInference({GEMINI_API_KEY:'test',AI:{run:()=>{primaryCalls++;return primary.promise;}}},{},{fastScan:true,parallelProviders:true});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(primaryCalls,1);assert.equal(backupCalls,1,'Both readers start before either finishes or any wait timer');
  if(winner==='gemini')backup.resolve({text:'1. Literal question.'});
  else {if(winner.includes('failure'))backup.reject(new Error('Unavailable'));primary.resolve({text:'1. Literal question.'});}
  assert.equal((await result).text,'1. Literal question.');
 }
 assert(source.includes('parallelProviders:imageMeta?.parallelProviders===true'));
 assert(fs.readFileSync('frontend/index.html','utf8').includes('parallelProviders:true'));
 console.log('Parallel providers: both launch immediately, either usable reader can win, backup failure retains original primary.');
})().catch(e=>{console.error(e);process.exitCode=1;});
