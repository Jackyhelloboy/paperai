const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('worker/src/index.js','utf8');
const context=vm.createContext({DurableObject:class{},console,Math,setTimeout});
vm.runInContext(source.replace(/^import .*;\s*$/gm,'').replace(/export default /g,'const workerDefault = ').replace(/export class /g,'class '),context);
(async()=>{
 for(const text of ['Readable page', 'a [unclear] b [unclear]', '[[QUESTION_ITEM: 1 || ]]', '']) {
  const calls=[];const env={AI:{run:async(model,body)=>{calls.push(body);return {choices:[{message:{content:text},finish_reason:'stop'}]};}}};
  await context.runAI('IMG','image/jpeg',env,'hi','hard',{branchingLayout:true,score:5});
  assert.equal(calls.length,1,'Unclear, hard, empty and structured output must never trigger another read');
  assert.equal(calls[0].chat_template_kwargs.enable_thinking,false);
 }
 const detailCalls=[];
 await context.runAI(
  'IMG','image/jpeg',
  {AI:{run:async(model,body)=>{detailCalls.push(body);return {choices:[{message:{content:'Readable page'},finish_reason:'stop'}]};}}},
  'hi','hard',
  {structuredLayout:true,multiColumnRows:4,longHorizontalRules:5,longVerticalRules:2},
  [],
  {aiLayoutCheck:true},
  {pattern_hints:[{class:'V',sections:[{label:'IV',marks:'4x1=4M',expected_items:4}]}]},
  [{mimeType:'image/webp',base64:'DETAIL1'},{mimeType:'image/webp',base64:'DETAIL2'}]
 );
 const detailContent=detailCalls[0].messages[1].content;
 assert.equal(detailContent.filter(part=>part.type==='image_url').length,3,'Full page plus two same-page detail views must reach the model in one inference');
 const detailPrompt=detailContent.filter(part=>part.type==='text').map(part=>part.text).join('\n');
 assert(detailPrompt.includes('VISUAL LAYOUT HINT'),'Detected page geometry must reach the OCR prompt');
 assert(detailPrompt.includes('QUESTION-PAPER PATTERN MEMORY (STRUCTURE ONLY)'),'Structural paper memory must be explicit and non-semantic');
 assert(detailPrompt.includes('CURRENT PAGE PIXELS are the only source for words'),'Pattern memory must never supply missing wording');

 let failures=0;
 await assert.rejects(context.runAI('IMG','image/jpeg',{AI:{run:async()=>{failures++;throw new Error('3040: out of capacity');}}}),/capacity/);
 assert.equal(failures,2,'A transient provider failure gets exactly one same-quality automatic retry');
 console.log('OCR speed policy: one normal inference, same-call detail views, and one same-quality retry only for transient provider failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
