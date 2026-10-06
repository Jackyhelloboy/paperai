const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const OWNER = 'teacher-test-owner-'.padEnd(32,'a'), OTHER = 'other-teacher-owner-'.padEnd(32,'b');
const db = new DatabaseSync(':memory:');
for (const name of ['0001_drafts.sql','0002_provider_usage.sql','0003_persistent_papers.sql']) db.exec(fs.readFileSync('worker/migrations/'+name,'utf8'));
const query = (sql,args=[]) => ({sql,args,bind(...values){return query(sql,values)},
 async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},
 async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes},success:true}}});
const env = {DB:{prepare:query,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}}};
const ctx = vm.createContext({console});
vm.runInContext(fs.readFileSync('frontend/vendor/paperai-teacher-tools.js','utf8'),ctx);
const tools = ctx.PaperAITeacherTools;
assert.equal(tools.nativeRoman('enti','te'),'ఏంటి');assert.equal(tools.nativeRoman('enti?','te'),'ఏంటి?');
assert.equal(tools.nativeRoman('enti unknown','te'),'','Unknown words require review rather than partial guessed conversion');
assert.equal(tools.sentenceAt('First sentence. enti enduku? Last.',22).source,'enti enduku?');
assert.equal(tools.sentenceAt('First sentence. enti enduku?',27).source,'enti enduku?');
assert(tools.preservesNumbers('1. Solve 2x + 3 = 7.','1. Solve 2x + 3 = 7.'));
assert(!tools.preservesNumbers('1. Solve 2x + 3 = 7.','1. Solve 2x + 3 = 9.'));
let summary=tools.marksSummary('Total marks: 10\nI. Fill 4X1 = 4M\n1. A\n2. B\nII. Match 3 × 2 = 6 marks\n1. C');
assert.equal(summary.sectionMarks,10);assert.equal(summary.items,3);assert(summary.complete);
summary=tools.marksSummary('Total marks: 12\nI. Fill 4X1 = 5M\nII. Match 6X.M');
assert.equal(summary.warnings.length,3,'Arithmetic conflicts, unreadable expressions and mismatched totals require review');
(async()=>{
 const {handleDrafts,purgeExpiredDrafts}=await import(pathToFileURL(path.resolve('worker/src/drafts.js')).href);
 async function request(route,method='GET',body,owner=OWNER){const headers={'X-PaperAI-Owner':owner};if(body && !(body instanceof FormData))headers['Content-Type']='application/json';const req=new Request('https://paper.test/api/drafts'+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return handleDrafts(req,env,{},new URL(req.url));}
 let response=await request('','POST',{title:'Teacher paper'});assert.equal(response.status,201);
 const draft=(await response.json()).draft,id=draft.id;
 const add=async(text,pageId)=>{const form=new FormData();form.set('text',text);form.set('source_name','own-test.txt');if(pageId)form.set('page_id',pageId);return request('/'+id+'/pages','POST',form)};
 const pageId=crypto.randomUUID();response=await add('1. Original text',pageId);assert.equal(response.status,201);
 response=await add('1. Original text',pageId);assert.equal(response.status,200);assert((await response.json()).reused);
 response=await request('/'+id);let paper=await response.json();assert.equal(paper.pages.length,1);assert.equal(paper.draft.expires_at,0);
 response=await request('/'+id+'/document','PUT',{text:'1. Corrected ఏంటి',revision:paper.draft.document_revision});assert.equal(response.status,200);paper.draft=(await response.json()).draft;
 response=await request('/'+id+'/document','PUT',{text:'stale overwrite',revision:0});assert.equal(response.status,409,'Stale browser saves cannot replace current corrections');
 await add('2. Next source page');response=await request('/'+id);paper=await response.json();assert.equal(paper.draft.document_text,'1. Corrected ఏంటి\n\n2. Next source page','Appending keeps prior whole-paper corrections');
 assert.equal((await request('/'+id+'/pages/'+pageId,'PUT',{edited_text:'rescan replaces correction'})).status,409);
 assert.equal((await request('/'+id+'/document','PUT',{text:'stolen',revision:paper.draft.document_revision},OTHER)).status,404);
 response=await request('/discard','POST',{owner:OWNER});assert.equal((await response.json()).discarded,0);
 await purgeExpiredDrafts(env);response=await request('/'+id);assert.equal(response.status,200,'Refresh, unload and scheduled cleanup do not delete live drafts');
 const stored=await response.json();assert.equal(stored.draft.document_text,paper.draft.document_text);
 response=await request('/'+id,'PATCH',{title:'New title'});assert(!('owner_key' in (await response.json()).draft),'Rename must not return private owner keys');
 response=await request('','POST',{title:'Unedited reorder paper'});const second=(await response.json()).draft.id;
 const ids=[];for(const text of ['first','second']){const form=new FormData();form.set('text',text);const r=await request('/'+second+'/pages','POST',form);ids.push((await r.json()).page.id)}
 response=await request('/'+second+'/reorder','POST',{order:[ids[0],ids[0]]});assert.equal(response.status,400,'Duplicate page ids cannot corrupt ordering');
 response=await request('/'+id,'DELETE');assert.equal(response.status,200);assert.equal((await request('/'+id)).status,404,'Only explicit owner DELETE removes a saved draft');
 db.close();console.log('Real SQLite migrations verify persistence, idempotent append, corrections, conflicts, owner privacy and manual deletion; sentence and marks tools pass.');
})().catch(error=>{console.error(error);process.exitCode=1});
