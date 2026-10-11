// Exercise upload selection -> processing -> auto layout -> editable preview.
// AI is stubbed at the provider boundary; no corpus files are sent to a service.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Layout=require('../frontend/vendor/paper-layout.js');
const html=fs.readFileSync('frontend/index.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function buildDocxBody'))[1];
const slice=(a,b)=>code.slice(code.indexOf(a),code.indexOf(b,code.indexOf(a)+1));
assert(!html.includes('startBlankPaper')&&!html.includes('insertPaperBlock')&&!html.includes('Create question paper'));
assert(html.includes('id="fileInput" class="file-input-hidden" multiple'));
assert(html.includes('prefers-reduced-motion: reduce'));
const classes=()=>{const set=new Set();return {add:v=>set.add(v),remove:v=>set.delete(v),has:v=>set.has(v),toggle:(v,on)=>on?set.add(v):set.delete(v)};};
function setup(){
 const nodes={};const field=id=>nodes[id]||=( {value:'',checked:false,disabled:false,textContent:'',innerHTML:'',style:{},classList:classes(),attrs:{},
  setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}} );
 const files=[];let finish,reading=0;
 const ctx=vm.createContext({PaperAILayout:Layout,$:field,console,
  file:null,fileBatch:[],lastResult:null,showingRaw:false,processingUpload:false,uploadRun:0,extractedMedia:[],
  ...Object.fromEntries(['dropZone','fileInput','goBtn','languageSelect','filePreview','fileThumb','fileTypeIcon','fileName','fileMeta','clearBtn','prog','pFill','pPct','pMsg','resBox','teachPanel','textOut'].map(k=>[k,field(k)])),
  IMAGE_EXTS:['png','jpg'],PDF_EXTS:['pdf'],DOC_EXTS:['docx'],PPT_EXTS:[],XLS_EXTS:[],TXT_EXTS:['txt'],ALLOWED_EXTS:['png','jpg','pdf','docx','txt'],BLOCKED_EXTS:['mp4'],
  FileReader:class{readAsDataURL(f){this.onload({target:{result:'data:image/png;base64,test'}});}},fmtSize:n=>String(n),hideErr(){ctx.error=null;},showErr:m=>{ctx.error=m;},
  setTimeout:()=>{},repairLegacyBranchDiagram:s=>s,formatOutput:s=>'<paper>'+s+'</paper>',updateResultActionsForTab(){},loadUsage:async()=>{},
  PaperAIPdfEditable:{preview:()=>'<native>original layout</native>'},window:{matchMedia:()=>({matches:false})},
  extractOneFile:async f=>{files.push(f);reading++;return new Promise((resolve,reject)=>{finish={resolve,reject};});}
 });
 vm.runInContext(slice('const setProg =','let quotaResetAt')+'this.updateProgress=setProg;',ctx);
 vm.runInContext(slice('function getFileCategory','function median'),ctx);
 vm.runInContext(slice('function configureAutomaticPaper','function applyPaperFormat'),ctx);
 vm.runInContext(slice('goBtn.onclick = async','function dlBlob'),ctx);
 return {ctx,nodes,files,complete:part=>finish.resolve(part),fail:()=>finish.reject(new Error('Free AI scanning paused')),reads:()=>reading};
}
const page={text:'Subject: Science\nI. Name the shapes. 2M\n[[SHAPE_ROW: circle|none || square|box]]\n[[TABLE_ROW: Name || Class]]',plain:'Subject: Science\nI. Name the shapes. 2M',raw:'original wording'};
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
(async()=>{
 const f={name:'photo.png',type:'image/png',size:1024},pdf={name:'paper.pdf',type:'application/pdf',size:1234};
 const t=setup();t.ctx.setFiles([f]);
 assert.equal(t.reads(),1,'Selecting a file must start processing with no Extract click');
 assert.equal(t.ctx.processingUpload,true);assert.equal(t.nodes.fileInput.disabled,true);assert.equal(t.nodes.clearBtn.disabled,true);
 await t.ctx.goBtn.onclick();t.ctx.setFiles([pdf]);t.ctx.clearFile();
 assert.equal(t.reads(),1,'Clicks, replacements and remove while processing must not duplicate OCR');assert.equal(t.ctx.file,f);
 t.ctx.updateProgress(48,'Reading page 1/3');assert.equal(t.nodes.pPct.textContent,'Working…');assert(!('aria-valuenow' in t.nodes.scanProgress.attrs));
 t.ctx.updateProgress(18,'Preparing scan');assert.equal(t.nodes.pPct.textContent,'Working…','Slow AI preparation must not make a fake percentage regress');
 t.complete(page);await settle();
 assert.equal(t.ctx.processingUpload,false);assert.equal(t.nodes.fileInput.disabled,false);assert(t.nodes.resBox.classList.has('show'));
 assert(!t.nodes.goBtn.classList.has('show'),'Successful uploads must not invite a second AI request');
 assert.equal(t.nodes.paperFormat.value,'science');assert.equal(t.nodes.paperFont.value,'10');assert.equal(t.nodes.paperLine.value,'1');
 assert.equal(t.ctx.lastResult.text,page.text,'Auto layout must not change wording, solve questions or strip structures');
 assert(t.nodes.textOut.innerHTML.includes('SHAPE_ROW')&&t.nodes.textOut.innerHTML.includes('TABLE_ROW'));
 assert.equal(t.nodes.pPct.textContent,'100%');assert.equal(t.nodes.scanProgress.attrs['aria-valuenow'],'100');
 t.ctx.setFiles([pdf]);t.complete({...page,nativePdfPages:[{page:1}]});await settle();
 assert.equal(t.ctx.lastResult.native_pdf_pages.length,1);assert.equal(t.nodes.paperFlow.value,'source');assert.equal(t.nodes.paperFormat.value,'custom');
 t.ctx.setFiles([{name:'original.docx',type:'application/octet-stream',size:100}]);t.complete(page);await settle();
 assert(t.ctx.lastResult.native_docx_file);assert.equal(t.nodes.paperWordFormat.checked,true,'Auto defaults must preserve the original Word objects');
 t.ctx.setFiles([f]);t.fail();await settle();
 assert(t.nodes.goBtn.classList.has('show'));assert(!t.nodes.prog.classList.has('show'));assert.equal(t.ctx.processingUpload,false);
 assert(!t.nodes.resBox.classList.has('show'),'An unrelated previous document must not be presented as the failed scan');
 const retry=t.ctx.goBtn.onclick();t.complete(page);await retry;assert.equal(t.ctx.lastResult.source_file,f);
 const second={name:'photo-2.png',type:'image/png',size:100};
 t.ctx.setFiles([f,second]);t.complete(page);await settle();
 t.complete({text:'2. Continue the questions. ______',plain:'2. Continue the questions. ______',raw:'2. Continue the questions. ______'});await settle();
 assert(t.ctx.lastResult.text.includes('[[PAGE_BREAK]]')&&!t.ctx.lastResult.text.includes('[[PAPER_BREAK]]'),'Consecutive photos must not force a new paper per page');
 assert(!Layout.compactPages(t.ctx.lastResult.text).includes('[[PAGE_BREAK]]'),'Continuous photographed questions must compact onto A4');
 t.ctx.clearFile();assert.equal(t.ctx.lastResult,null);assert.equal(t.ctx.extractedMedia.length,0);
 t.ctx.setFiles([{name:'unsupported.mp4',type:'video/mp4',size:100}]);assert(t.ctx.error);assert.equal(t.reads(),7);
 assert.equal(Layout.automaticFormat('Subject: English\nI. Read.').name,'humanities');
 assert.equal(Layout.automaticFormat('IV-SCIENCE\nI. Answer.').name,'science');
 assert.equal(Layout.automaticFormat('Worksheet\n1. Complete.').name,'worksheet');
 assert.equal(Layout.automaticFormat('1. Explain science in social studies.').name,'compact','Question topics must not choose a reference');
 console.log('Automatic upload: selection starts once; concurrent UI guarded; retry works; source Word/PDF layouts preserved; structures and wording unchanged; progress has no guessed percentages.');
})().catch(e=>{console.error(e);process.exitCode=1;});
