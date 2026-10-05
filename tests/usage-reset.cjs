const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let clock = Date.parse('2026-10-05T12:01:00Z');
class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;}}
const values = new Map();let cancelledAlarms=0;
const ctx={storage:{get:async key=>values.get(key),put:async(key,value)=>values.set(key,value),
 delete:async key=>values.delete(key),deleteAlarm:async()=>{cancelledAlarms++;}}};
const worker=vm.createContext({Date:ClockDate,URL,Request,Response,console,DurableObject:class{constructor(ctx){this.ctx=ctx;}}});
const source=fs.readFileSync('worker/src/index.js','utf8');
vm.runInContext(source.replace(/^import .*;\s*$/gm,'').replace(/export default /g,'const workerDefault = ').replace(/export class /g,'class '),worker);
const Tracker=vm.runInContext('UsageTracker',worker);const tracker=new Tracker(ctx,{});
let snapshot={report_date_utc:'2026-10-05',reported_used:740.10,fetched_at:'2026-10-05T12:00:00Z'};
const env={DB:{prepare:()=>({first:async()=>({snapshot_json:JSON.stringify(snapshot)})})},USAGE_TRACKER:{idFromName:name=>name,get:()=>({fetch:request=>tracker.fetch(new Request(request))})}};
async function observe(state){return tracker.fetch(new Request('https://usage.internal/provider-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})}));}
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
 const initial=await worker.getUsageStatus(env);
 assert.equal(initial.reported_used,740.10);assert.equal(initial.reported_remaining,9259.90);
 assert.equal(initial.reset_at,'2026-10-06T00:00:00.000Z');assert.equal(initial.estimated_used,undefined);
 await observe('quota-reached');values.set('five-minute-usage',{used:10000});
 clock+=300000;await tracker.alarm();
 const later=await worker.getUsageStatus(env);assert.equal(later.reported_used,740.10);
 assert.equal(later.provider_status.state,'quota-reached');assert.equal(cancelledAlarms,1);
 assert(!values.has('five-minute-usage'));
 clock=Date.parse('2026-10-06T00:00:01Z');const nextDay=await worker.getUsageStatus(env);
 assert.equal(nextDay.reported_used,null);assert.equal(nextDay.reported_remaining,null);
 assert.equal(nextDay.provider_status.state,'quota-reached','A clock rollover must not clear a provider rejection');
 snapshot={report_date_utc:'2026-10-06',reported_used:12.5,fetched_at:'2026-10-06T00:00:00Z'};
 await observe('accepted');assert.equal((await worker.getUsageStatus(env)).reported_used,12.5);
 assert.equal((await worker.getUsageStatus(env)).provider_status.state,'accepted');
 const missing=await worker.getUsageStatus({});assert.equal(missing.reported_used,null);assert.equal(missing.reported_remaining,null);
 snapshot.reported_used=12500;assert.equal((await worker.getUsageStatus(env)).reported_used,12500);
 assert.equal((await worker.getUsageStatus(env)).reported_remaining,0,'Do not truncate account-wide usage to the free allowance');
 snapshot.reported_used=12.5;
 const elements={};for(const name of ['quotaNow','quotaReset','quotaRemaining','quotaUsed','quotaFill','quotaPercent','quotaBadgeText','quotaMine','quotaCard','quotaBadge'])
  elements[name]={textContent:'',dataset:{},style:{},classList:{toggle(){},remove(){}}};
 const intervals=[],listeners={};let offline=false, healthOk=true, delayedHealth=null;const requests=[];const browserNetwork={onLine:true};
 const front=vm.createContext({...elements,$:id=>elements[id],navigator:browserNetwork,Date:ClockDate,Intl,Number,AbortSignal,console,API_LOCAL:'/local',API_DIRECT:'https://worker.example',
  document:{visibilityState:'visible',getElementById:id=>elements[id],addEventListener:(name,fn)=>listeners[name]=fn},
  window:{addEventListener:(name,fn)=>listeners[name]=fn},setInterval:(fn,ms)=>intervals.push({fn,ms}),
  fetch:async url=>{requests.push(url);if(url.includes('/health')){if(delayedHealth)return delayedHealth;if(!healthOk)throw new Error('backend offline');return {ok:true,json:async()=>({status:'healthy'})};}if(offline)throw new Error('offline');return {ok:true,json:()=>worker.getUsageStatus(env)};}});
 const html=fs.readFileSync('frontend/index.html','utf8');vm.runInContext(html.slice(html.indexOf('let quotaResetAt = null;'),html.indexOf('let presenceSocket = null;')),front);
 await flush();assert.equal(elements.quotaUsed.textContent,'12.5');assert.equal(elements.quotaBadgeText.textContent,'Active');
 assert(!html.includes('5 minute window') && !html.includes('Local meter resets'));
 assert(elements.quotaReset.textContent.includes('00:00 UTC'));assert(!intervals.some(x=>x.ms===300000));
 clock+=300000;vm.runInContext('updateQuotaClock()',front);assert.equal(elements.quotaUsed.textContent,'12.5');
 clock=Date.parse('2026-10-07T00:00:01Z');vm.runInContext('updateQuotaClock()',front);await flush();
 assert.equal(elements.quotaUsed.textContent,'—');assert.equal(elements.quotaRemaining.textContent,'—');
 snapshot={report_date_utc:'2026-10-07',reported_used:48,fetched_at:'2026-10-07T00:00:00Z'};listeners.online();await flush();
 assert.equal(elements.quotaUsed.textContent,'48');offline=true;await vm.runInContext('loadUsage()',front);
 assert.equal(elements.quotaUsed.textContent,'48','Failed refresh must not fabricate a full allowance');assert.equal(elements.quotaPercent.textContent,'Usage update unavailable');
 assert.equal(elements.quotaBadgeText.textContent,'Active','Usage reporting errors must not mislabel a reachable backend as Offline');
 healthOk=false;await vm.runInContext('checkServiceHealth()',front);assert.equal(elements.quotaBadgeText.textContent,'Offline');
 healthOk=true;await vm.runInContext('checkServiceHealth()',front);assert.equal(elements.quotaBadgeText.textContent,'Active');
 browserNetwork.onLine=false;listeners.offline();assert.equal(elements.quotaBadgeText.textContent,'Offline');
 const offlineRequests=requests.length;await vm.runInContext('checkServiceHealth()',front);assert.equal(requests.length,offlineRequests,'Offline browsers do not issue health requests');
 browserNetwork.onLine=true;offline=false;listeners.online();await flush();assert.equal(elements.quotaBadgeText.textContent,'Active');
 let releaseHealth;delayedHealth=new Promise(resolve=>releaseHealth=resolve);const pending=vm.runInContext('checkServiceHealth()',front);listeners.offline();
 releaseHealth({ok:true,json:async()=>({status:'healthy'})});await pending;assert.equal(elements.quotaBadgeText.textContent,'Offline','A stale health response cannot overwrite the offline event');
 delayedHealth=null;await vm.runInContext('checkServiceHealth()',front);assert.equal(elements.quotaBadgeText.textContent,'Active');
 assert(requests.every(url=>url.includes('/health')||url.includes('/api/usage')),'Connection checks never invoke AI');
 assert(html.indexOf('id="extractionNav"')<html.indexOf('id="quotaCard"'),'Back toolbar comes before usage outside the upload card');
 assert(html.includes('<details class="quota-details">'),'Detailed usage is collapsed by default');
 console.log('Cloudflare daily reporting, stale/missing data, midnight rollover, provider-only availability and UI refresh passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
