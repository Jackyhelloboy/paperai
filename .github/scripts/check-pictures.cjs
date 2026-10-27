// Bounded, real production retrieval check. No paid image generation or OCR.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.PAPERAI_PICTURE_TEST_BASE||'https://paperai-5up.pages.dev';
const report={base,checked_at:new Date().toISOString(),pictures:[]};
(async()=>{
 for(const subject of ['duck','apple']){
   const response=await fetch(base+'/api/pictures/search?q='+subject,{signal:AbortSignal.timeout(45000)});
   assert.equal(response.status,200,'Search '+subject+' returned HTTP '+response.status);
   const body=await response.json(),item=body.results?.[0];
   assert(item,'No public-domain picture found for '+subject);
   const image=await fetch(base+'/api/pictures/asset?title='+encodeURIComponent(item.title),{signal:AbortSignal.timeout(45000)});
   assert.equal(image.status,200,'Image retrieval failed');
   assert(/^image\/(png|jpeg|webp)/.test(image.headers.get('Content-Type')));
   const bytes=Buffer.from(await image.arrayBuffer());assert(bytes.length>1000);
   fs.mkdirSync('build/picture-verification',{recursive:true});
   const ext=image.headers.get('Content-Type').split('/')[1];
   fs.writeFileSync('build/picture-verification/'+subject+'.'+ext,bytes);
   report.pictures.push({subject,title:item.title,license:item.license,source:item.sourceUrl,bytes:bytes.length});
 }
 fs.writeFileSync('build/picture-verification/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
