// Exercise the real suggestion endpoint with deterministic provider responses.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const requests=[],queue=[];
const ctx=vm.createContext({Request,Response,Headers,URL,TextDecoder,Uint8Array,btoa,AbortController,AbortSignal,setTimeout,clearTimeout,
    console:{log(){}},DurableObject:class{},PAPER_LAYOUT_RULES:'fixture layout rules',normaliseMarkerRows:s=>s,
    DICTIONARY:{},getDictionaryWords:()=>[],isInDictionary:()=>false,autoCorrect:s=>s,verifyWord:()=>({}),getSuggestions:()=>[],CONFUSION_PAIRS:{}});
vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),ctx);
vm.runInContext(fs.readFileSync('worker/src/index.js','utf8').replace(/^import .*;\n/gm,'').replace('export default {','const handler = {').replace('export class UsageTracker','class UsageTracker')+'\nthis.handler=handler;',ctx);
const env={AI:{run:async(model,request)=>{requests.push(request);return {response:JSON.stringify({suggestions:queue.shift()}),usage:{}};}}};
async function suggest(input,context,candidates){
    queue.push(candidates);
    const response=await ctx.handler.fetch(new Request('https://paperai.test/api/suggest-word',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:input,source_language:'en',language:'hi',mode:'contextual',context})}),env);
    assert.equal(response.status,200);return response.json();
}
(async()=>{
    let result=await suggest('Gingre','हिन्दी शब्द से English शब्द जोड़ो।',['Ginger','जिंजर','中文','Ginger 9','The answer is Ginger']);
    assert.deepEqual(result.suggestions,['Ginger','जिंजर'],'English candidates must survive inside a Hindi document; unrelated scripts and extra answers must not');
    assert.equal(result.mode,'contextual_proofread');
    const prompt=requests.at(-1).messages.map(m=>m.content).join('\n');
    assert(prompt.includes('Preserve genuine English')&&prompt.includes('Romanized Hindi')&&prompt.includes('Never complete a blank'));
    result=await suggest('Angraz','हिन्दी शब्द से Angraz शब्द जोड़ो।',['अंग्रेज़ी','Angrez','中文']);
    assert.deepEqual(result.suggestions,['अंग्रेज़ी','Angrez'],'Roman-Hindi and English-script alternatives should use context rather than a forced target script');
    result=await suggest('2. गाडा + 3','हिन्दी प्रश्न',['2. गाड़ी + 3','3. गाड़ी + 3','2. गाड़ी = 3','2. गाड़ी + 9']);
    assert.deepEqual(result.suggestions,['2. गाड़ी + 3'],'Suggestions must preserve all numbers/operators');
    result=await suggest('Gingre','Correct the English spelling.',['Ginger','जिंजर','中文']);
    assert.deepEqual(result.suggestions,['Ginger'],'An English-only selection/context must not force Hindi transliteration');
    assert.equal(queue.length,0);
    console.log('Mixed-language suggestions: automatic contextual proofreading, English inside Hindi, Roman-Hindi alternatives, script boundaries and unchanged question numbers/equations pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
