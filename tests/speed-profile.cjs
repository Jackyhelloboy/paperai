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
 let failures=0;
 await assert.rejects(context.runAI('IMG','image/jpeg',{AI:{run:async()=>{failures++;throw new Error('3040: out of capacity');}}}),/capacity/);
 assert.equal(failures,1,'Transient provider failures need an explicit manual Retry');
 console.log('Single-read policy: one inference, no reasoning, no verification and no automatic capacity retry.');
})().catch(e=>{console.error(e);process.exitCode=1;});
