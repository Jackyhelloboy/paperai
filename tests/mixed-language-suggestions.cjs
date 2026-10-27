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
async function translate(input,language,candidates){
    queue.push(candidates);
    const response=await ctx.handler.fetch(new Request('https://paperai.test/api/suggest-word',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:input,source_language:'en',language,mode:'translate',context:'Class 2 science question',
            learned_suggestions:['untrusted old correction'],local_suggestions:['untrusted local correction']})}),env);
    assert.equal(response.status,200);return response.json();
}
async function checkEditorRequests(){
    const html=fs.readFileSync('frontend/index.html','utf8');
    const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
    const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
    let submissions=0,complete;
    const ui=vm.createContext({Map,AbortSignal,aiSuggestionCache:new Map(),aiSuggestionInFlight:new Map(),aiSuggestionCalls:0,
        aiSuggestionSequence:1,activeAiButtonSequence:0,aiSuggestionTimer:null,smartComposition:{start:0},
        teachEditor:{selectionStart:0,selectionEnd:6,value:'Gingre'},teachAiBtn:{disabled:false},teachAiStatus:{},
        getTeachContext:()=> 'हिन्दी और English शब्द',uniqueStrings:a=>[...new Set(a)],
        PaperAIQuota:{isDailyError:()=>false},fetchOcrEndpoint:()=>{submissions++;return new Promise(resolve=>complete=resolve);},
        selectedTeachSegment:()=>({start:0,end:6,source:'Gingre'}),currentTeachSourceLanguage:()=> 'en',currentTeachLanguage:()=> 'hi',
        getLearnedCorrectionSuggestions:()=>[],TEACH_LANGUAGE_META:{en:{label:'English'}},renderSuggestionChips:()=>{},clearTimeout});
    ui.teachEditor.value='II. निम्नलिखित शब्दों का अर्थ लिखो\n1. Kite pic (       )';
    vm.runInContext(slice('function getTeachContext','function findInputSegmentAtCaret'),ui);
    assert(ui.getTeachContext(ui.teachEditor.value.indexOf('Kite')).includes('निम्नलिखित शब्दों'),
        'Suggestions should see the current bit instruction, not only the nearby word');
    ui.getTeachContext=()=> 'हिन्दी और English शब्द';
    ui.teachEditor.value='Gingre';
    vm.runInContext(slice('async function fetchAiTextSuggestions','function selectedTeachSegment'),ui);
    const first=ui.fetchAiTextSuggestions('Gingre','en','hi',[],[],1);
    ui.aiSuggestionSequence=2;
    const second=ui.fetchAiTextSuggestions('Gingre','en','hi',[],[],2);
    assert.equal(submissions,1,'Caret events and the AI button must share an identical pending request');
    complete(Response.json({suggestions:['Ginger']}));
    assert.deepEqual(Array.from(await first),['Ginger']);assert.deepEqual(Array.from(await second),['Ginger']);
    assert.equal(ui.aiSuggestionInFlight.size,0);
    vm.runInContext(slice('async function requestAdvancedAiSuggestions','function renderSuggestionChips'),ui);
    ui.aiSuggestionCache.clear();
    const advanced=ui.requestAdvancedAiSuggestions();assert.equal(ui.teachAiBtn.disabled,true);
    ui.aiSuggestionSequence++; // A changed selection invalidates the result.
    complete(Response.json({suggestions:['Ginger']}));await advanced;
    assert.equal(ui.teachAiBtn.disabled,false,'Discarding a stale result must still release the AI button');
    let refreshes=0;
    ui.updateTeachLanguageStatus=()=>{};ui.showSmartSuggestions=()=>refreshes++;
    vm.runInContext(slice('function refreshSmartComposition','function openTeachPanel'),ui);
    ui.smartComposition=null;ui.refreshSmartComposition();ui.refreshSmartComposition();
    assert.equal(refreshes,1,'An unchanged selection must not restart suggestion work');
}
(async()=>{
    await checkEditorRequests();
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
    result=await suggest('౨ + ೩ = ___ గణితం','తెలుగు ప్రశ్న',['౨ + ೩ = ___ గణితం','౨ + ೪ = ___ గణితం','౨ + ೩ = 5 గణితం','౨ − ೩ = ___ గణితం']);
    assert.deepEqual(result.suggestions,['౨ + ೩ = ___ గణితం'],'Native-script digits, equations and blanks must remain exact');
    result=await translate('Choose the correct answer (   )', 'te',
        ['సరైన సమాధానాన్ని ఎంచుకోండి (   )','సరైన సమాధానాన్ని ఎంచుకోండి (పిల్లి)','صحیح جواب (   )']);
    assert.deepEqual(result.suggestions,['సరైన సమాధానాన్ని ఎంచుకోండి (   )'],'Translation must preserve empty answer spaces and target script');
    assert.equal(result.mode,'translation');
    assert(requests.at(-1).messages[0].content.includes('Translate meaning'));
    result=await translate('What is ५ + ౩?', 'ta',['௫ + ౩ என்பது என்ன?','௫ + ௩ என்பது என்ன?']);
    assert.deepEqual(result.suggestions,[],'A translation must not silently convert native numeral glyphs');
    assert.equal(queue.length,0);
    console.log('Mixed-language suggestions: contextual proofreading, English inside Hindi, Roman-Hindi alternatives, unchanged equations, deduplicated requests and released busy buttons pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
