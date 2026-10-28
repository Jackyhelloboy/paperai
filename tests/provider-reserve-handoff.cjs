const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('worker/src/index.js','utf8');
assert(source.includes('read EACH numbered item and its own response bracket'),'OCR must preserve source brackets per question');
assert(source.includes('Count the visible answer brackets'),'Image verification must cross-check option brackets');
const code=source.slice(source.indexOf('async function nearPrimaryDailyReserve('),source.indexOf('async function runBudgetedPrimary('))+'\n'+
  source.slice(source.indexOf('async function runInference('),source.indexOf('const SUGGESTION_LANGUAGES'));
let used=9500,hard=false,backupFails=false,primaryCalls=0,geminiCalls=0;
const response={response:'1. Visible question? (   )'};
const ctx=vm.createContext({Date,Promise,AbortController,console:{log(){}},PAGE_SCAN_BUDGET_MS:70000,PRIMARY_DAILY_CAP:9500,
  runBudgetedPrimary:async(env,body)=>env.AI.run('fixture-primary',body),PRIMARY_MODEL:'fixture-primary',
  getUsageStatus:async()=>({estimated_used:used,provider_limit_reached:hard}),
  confirmedFreeLimit:async()=>hard,withinScanBudget:async fn=>fn(),
  runGemini:async()=>{geminiCalls++;if(backupFails)throw Object.assign(new Error('unavailable'),{code:'AI_BUSY'});return response;},
  scanServiceError:(code,msg)=>Object.assign(new Error(msg),{code}),
  isDailyFreeLimitError:()=>false,isPaidModelRequiredError:()=>false,isTransientAiError:()=>false,isAiTimeoutError:()=>false,
  normaliseMarkerRows:String,extractAiText:r=>r.response,degenerateOcr:()=>false,invalidLayoutMarkers:()=>false});
vm.runInContext(code,ctx);
const env={GEMINI_API_KEY:'fixture',AI:{run:async()=>{primaryCalls++;return response;}}};
(async()=>{
  let state={fastScan:true};
  assert.equal(await ctx.runInference(env,{},state),response);
  assert.equal(state.provider,'gemini');assert.equal(primaryCalls,0,'At 9,500 estimated neurons use Gemini first');
  backupFails=true;state={fastScan:true};
  await assert.rejects(ctx.runInference(env,{},state),/unavailable/);
  assert.equal(primaryCalls,0,'Gemini outage must never bypass daily safety cap');
  backupFails=false;used=9499;state={fastScan:true};
  assert.equal(await ctx.runInference(env,{},state),response);
  assert.equal(primaryCalls,1,'Below the reserve continue with primary OCR');
  hard=true;state={fastScan:true};
  assert.equal(await ctx.runInference(env,{},state),response);
  assert.equal(primaryCalls,1,'A confirmed provider block never retries primary');
  assert.equal(state.provider,'gemini');
  assert.equal(geminiCalls,3);
  console.log('Provider handoff: 9,500 reserve, Gemini continuation, outage recovery, and confirmed primary limit pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
