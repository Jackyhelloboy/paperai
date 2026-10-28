// Evaluation only. Never imported by the browser or production OCR Worker.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const API='https://aip.baidubce.com';
const TASK='/rest/2.0/brain/online/v2/unlimited-ocr-parser/task';
const MAX_JSON=32*1024*1024;
function fail(message){throw new Error(message);}
async function readJson(response){
 if(!response.ok)fail('Baidu OCR service returned HTTP '+response.status+'.');
 const reader=response.body?.getReader();if(!reader)fail('Baidu returned an empty response.');
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
  if(size>MAX_JSON){await reader.cancel();fail('Baidu result exceeded the evaluation size limit.');}chunks.push(value);
 }}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Baidu returned invalid JSON.');}
}
export function resultURL(value){
 let u;try{u=new URL(value);}catch{fail('Baidu result URL is invalid.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||
    !/^[a-z0-9.-]+\.bcebos\.com$/i.test(u.hostname))fail('Baidu result URL is not an approved BOS host.');
 return u.href;
}
export function createClient({apiKey,secretKey,fetcher=fetch}){
 if(!apiKey||!secretKey)fail('Set BAIDU_API_KEY and BAIDU_SECRET_KEY in the environment or GitHub secrets.');
 let accessToken;
 async function token(){
  if(accessToken)return accessToken;
  // Baidu requires OAuth query parameters. These server-only URLs and errors
  // must never be printed, returned to the public app, or saved in artifacts.
  const u=new URL('/oauth/2.0/token',API);u.search=new URLSearchParams({grant_type:'client_credentials',client_id:apiKey,client_secret:secretKey});
  let data;try{data=await readJson(await fetcher(u,{redirect:'error',signal:AbortSignal.timeout(30000)}));}catch{fail('Baidu authentication failed. Check the server-side credentials.');}
  if(typeof data.access_token!=='string'||!data.access_token)fail('Baidu authentication failed.');
  accessToken=data.access_token;return accessToken;
 }
 async function request(endpoint,body){
  const u=new URL(endpoint,API);u.searchParams.set('access_token',await token());
  let data;try{data=await readJson(await fetcher(u,{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}));}
  catch{fail('Baidu request failed. A saved task can be resumed without submitting the PDF again.');}
  if(Number(data.error_code||0)!==0)fail('Baidu OCR rejected the request (code '+Number(data.error_code)+').');
  if(!data.result||typeof data.result!=='object')fail('Baidu OCR returned an incomplete task response.');
  return data.result;
 }
 return {
  async submit(bytes,fileName){
   if(!/\.(?:pdf|png|jpe?g)$/i.test(fileName)||!bytes.length||bytes.length>50*1024*1024)fail('Use a non-empty PDF/PNG/JPEG smaller than 50 MB.');
   const pdf=/\.pdf$/i.test(fileName),png=/\.png$/i.test(fileName);
   const valid=pdf?bytes.subarray(0,5).toString()==='%PDF-':png?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   if(!valid||(!pdf&&bytes.length>10*1024*1024))fail('The file bytes do not match a supported PDF or image (images must be under 10 MB).');
   const r=await request(TASK,{file_name:path.basename(fileName),file_data:bytes.toString('base64'),erase_seal:'false',erase_watermark:'false'});
   if(typeof r.task_id!=='string'||!/^[-a-zA-Z0-9_]{1,200}$/.test(r.task_id))fail('Baidu did not return a valid task ID.');
   return r.task_id;
  },
  async query(taskId){return request(TASK+'/query',{task_id:taskId});},
  async result(url){
   try{return await readJson(await fetcher(resultURL(url),{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(60000)}));}
   catch{fail('Baidu result download failed; retain the checkpoint and retry.');}
  }
 };
}
export async function evaluate({input,out,expectedPages,client,maxPolls=36,pause=()=>new Promise(r=>setTimeout(r,5000))}){
 if(!Number.isInteger(expectedPages)||expectedPages<1||expectedPages>500)fail('Provide the original document page count (1–500).');
 const bytes=await fs.readFile(input),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 await fs.mkdir(out,{recursive:true});const checkpointPath=path.join(out,'checkpoint.json');
 let saved;try{saved=JSON.parse(await fs.readFile(checkpointPath,'utf8'));}catch(error){if(error.code!=='ENOENT')fail('Invalid evaluation checkpoint. Use a different output directory.');}
 if(saved&&(saved.source_sha256!==sha||saved.expected_pages!==expectedPages))fail('Checkpoint belongs to a different source PDF or page count. Use a different output directory.');
 if(saved?.status==='completed'){
  try{const result=JSON.parse(await fs.readFile(path.join(out,'result.json'),'utf8'));
   if(Array.isArray(result.pages)&&result.pages.length===expectedPages&&result.pages.every((p,i)=>p.page_num===i))return {status:'completed',pages:result.pages.length,resumed:true};
  }catch{/* A missing result can be downloaded again using the saved task. */}
 }
 const save=async value=>{await fs.writeFile(checkpointPath+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await fs.rename(checkpointPath+'.tmp',checkpointPath);};
 let taskId=saved?.task_id;
 if(!taskId){taskId=await client.submit(bytes,path.basename(input));await save({status:'pending',task_id:taskId,source_sha256:sha,expected_pages:expectedPages});}
 for(let i=0;i<maxPolls;i++){
  await pause();const r=await client.query(taskId);
  if(['pending','running'].includes(r.status))continue;
  if(r.status==='failed')fail('Baidu OCR task failed. Check the provider console; the task ID is retained.');
  if(r.status!=='success'||!r.parse_result_url)fail('Baidu OCR returned an unsupported task state.');
  const result=await client.result(r.parse_result_url);
  if(!Array.isArray(result.pages)||result.pages.length!==expectedPages)fail('OCR result page count differs from the source. Do not use it for production.');
  const numbers=result.pages.map(p=>p.page_num);
  if(numbers.some((n,index)=>!Number.isInteger(n)||n!==index))fail('OCR result pages are missing, duplicated or out of order.');
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
  await save({status:'completed',task_id:taskId,source_sha256:sha,expected_pages:expectedPages,pages:result.pages.length});
  return {status:'completed',pages:result.pages.length,resumed:!!saved};
 }
 return {status:'pending',resumed:!!saved};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
 try{
  if(!args.includes('--input')||!args.includes('--out')||!args.includes('--expected-pages'))fail('Usage: node scripts/evaluate-baidu-unlimited.mjs --input paper.pdf --out evaluation-dir --expected-pages 22');
  const client=createClient({apiKey:process.env.BAIDU_API_KEY,secretKey:process.env.BAIDU_SECRET_KEY});
  const summary=await evaluate({input:get('--input'),out:get('--out'),expectedPages:Number(get('--expected-pages')),client});
  console.log(JSON.stringify({mode:'evaluation-only',provider:'Baidu Unlimited OCR cloud API',...summary}));
  if(summary.status!=='completed')process.exitCode=2;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
