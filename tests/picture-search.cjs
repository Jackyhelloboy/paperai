const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Pictures=require('../frontend/vendor/picture-search.js');
const ctx=require('../frontend/vendor/commons-pictures.js');
const page=(changes={})=>({ns:6,title:'File:Duck drawing.png',imageinfo:[{
 url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Duck.png',mime:'image/png',width:800,height:600,
 extmetadata:{LicenseShortName:{value:'Public domain'},Artist:{value:'<a>Artist</a>'},ImageDescription:{value:'A simple duck drawing.'}}
}],...changes});
const req=path=>new Request('https://paper.test/api/pictures/'+path);
(async()=>{
 assert.equal(Pictures.query('सेब'),'apple');assert.equal(Pictures.query('మామిడి'),'mango');
 assert.equal(Pictures.placeholder('4. apple pic — अ').query,'apple');
 assert.equal(Pictures.placeholder('2. n tube pic').query,'inner tube');
 assert.equal(Pictures.placeholder('What do you see?'),null);
 assert.equal(Pictures.placeholder('Add picture of apple').query,'apple');
 assert.equal(Pictures.placeholder('Draw a duck').query,'duck');
 assert.equal(Pictures.placeholder('Paste mango picture').query,'mango');
 assert.equal(Pictures.placeholder('Search the whole question paper'),null);
 assert.match(Pictures.groupRequests('1. Add picture of apple\n2. Draw a duck'),/DEFAULT_PICTURE_ROW/);

 assert.match(Pictures.groupRequests('Name the fruit\n1. mango pic\n2. banana pic'),/DEFAULT_PICTURE_ROW: 1. mango pic \|\| 2. banana pic/);
 const source='duck pic\n[[SOURCE_FIGURE: original| |none]]';assert.equal(Pictures.groupRequests(source),source);
 let calls=[];
 const metadata=async url=>{calls.push(url);return Response.json({query:{pages:[page(),page({title:'File:Other.png'})]}});};
 let response=await ctx.handlePictureSearch(req('search?q=duck'),{},metadata),body=await response.json();
 assert.equal(body.results[0].title,'File:Duck drawing.png');assert(body.results[0].confident);

 const compound=page({title:'File:Duck and boat drawing.png'});
 response=await ctx.handlePictureSearch(req('search?q=duck'),{},async()=>Response.json({query:{pages:[compound]}}));
 assert.equal((await response.json()).results[0].confident,false,'Compound picture names require teacher selection');
 let broadSearchUsed=false;
 response=await ctx.handlePictureSearch(req('search?q=fish'),{},async url=>{
   const u=new URL(url);
   if(u.searchParams.get('gsrsearch')==='fish') broadSearchUsed=true;
   const pages=u.searchParams.get('gsrsearch')==='fish'?[page({title:'File:Fish drawing.png'})]:[page({title:'File:Fish and boat drawing.png'})];
   return Response.json({query:{pages}});
 });
 assert(broadSearchUsed,'Retry object-only search when styled searches lack auto-safe matches');
 assert.equal((await response.json()).results[0].title,'File:Fish drawing.png');

 const descriptionOnly=page({title:'File:Waterbird drawing.png'});
 response=await ctx.handlePictureSearch(req('search?q=duck'),{},async()=>Response.json({query:{pages:[descriptionOnly]}}));
 assert.equal((await response.json()).results[0].confident,false,'Description-only semantic matches are never auto-inserted');
 assert(!JSON.stringify(body).includes('<a>'));assert(!body.results[0].image,'Do not expose caller-controlled upstream URLs');
 assert.equal(new URL(calls[0]).hostname,'commons.wikimedia.org');
 assert.equal(new URL(calls[0]).searchParams.get('gsrnamespace'),'6');
 assert.match(new URL(calls[0]).searchParams.get('gsrsearch'),/duck black and white outline clipart/,'Searches outline clipart first');
 const outline=page({title:'File:Duck black and white outline clipart.png'});
 response=await ctx.handlePictureSearch(req('search?q=duck'),{},async()=>Response.json({query:{pages:[outline,page()]}}));
 const ranked=await response.json();
 assert.equal(ranked.results[0].title,outline.title,'Prefer simple black and white worksheet outline drawings');

 const thumbnail=page();thumbnail.imageinfo[0].thumburl='https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Duck.png/960px-Duck.png?utm_source=commons.wikimedia.org';
 thumbnail.imageinfo[0].thumbwidth=800;thumbnail.imageinfo[0].thumbheight=600;
 response=await ctx.handlePictureSearch(req('search?q=duck'),{},async()=>Response.json({query:{pages:[thumbnail]}}));
 assert.equal((await response.json()).results.length,1,'Support the current official thumbnail host and tracking URLs');
 for(const mutate of [p=>p.imageinfo[0].extmetadata.LicenseShortName.value='CC BY-SA 4.0',
  p=>p.imageinfo[0].extmetadata.LicenseShortName.value='',p=>p.imageinfo[0].url='https://evil.test/Duck.png',
  p=>p.imageinfo[0].mime='image/svg+xml',p=>p.imageinfo[0].width=20,
  p=>p.imageinfo[0].extmetadata.AttributionRequired={value:'true'}]){
   const p=page();mutate(p);
   response=await ctx.handlePictureSearch(req('search?q=duck'),{},async()=>Response.json({query:{pages:[p]}}));
   assert.equal((await response.json()).results.length,0);
 }
 assert.equal((await ctx.handlePictureSearch(req('asset?title=https://127.0.0.1/secret'),{},metadata)).status,400);
 assert.equal((await ctx.handlePictureSearch(req('search?q='+encodeURIComponent('x'.repeat(130))),{},metadata)).status,400);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=','base64');
 const assetFetch=async(url,opts)=>{
   assert.equal(opts.redirect,'error');
   if(url.startsWith('https://commons.wikimedia.org/'))return Response.json({query:{pages:[page()]}});
   assert(url.startsWith('https://upload.wikimedia.org/wikipedia/commons/'));
   return new Response(png,{headers:{'Content-Type':'image/png'}});
 };
 response=await ctx.handlePictureSearch(req('asset?title=File%3ADuck%20drawing.png'),{},assetFetch);
 assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 const badAsset=async url=>url.startsWith('https://commons.wikimedia.org/')?Response.json({query:{pages:[page()]}}):new Response('<script>bad</script>',{headers:{'Content-Type':'image/png'}});
 assert.equal((await ctx.handlePictureSearch(req('asset?title=File%3ADuck.png'),{},badAsset)).status,502);
 assert.equal((await ctx.handlePictureSearch(req('search?q=duck'),{},async()=>{throw Error('private upstream details');})).status,503);
 let count=0;
 const fakeFetch=async url=>{count++;return url.includes('/search?')?Response.json({results:[{title:'File:Duck.png',confident:true}]}):new Response(png);};
 await Promise.all([Pictures.automatic('duck',fakeFetch),Pictures.automatic('duck',fakeFetch)]);
 assert.equal(count,2,'Repeated placeholders share one lookup and download');
 await Pictures.automatic('duck',fakeFetch);
 assert.equal(count,4,'Completed picture requests must recheck current metadata and license');
 // Failed image bytes must not prevent trying the next already licensed,
 // metadata-matched illustration. Unmatched results are never downloaded.
 let tried=[];
 const failover=async url=>{
   tried.push(url);
   if(url.includes('/search?'))return Response.json({results:[
     {title:'File:Duck first.png',confident:true},
     {title:'File:Unrelated.png',confident:false},
     {title:'File:Duck second.png',confident:true}
   ]});
   if(url.includes('Duck%20first'))return new Response('Unavailable',{status:503});
   return new Response(png);
 };
 const alternate=await Pictures.automatic('duck drawing',failover);
 assert.equal(alternate.source.title,'File:Duck second.png');
 assert.equal(tried.length,3,'Try alternate validated result without downloading unrelated pictures');

 const browser=vm.createContext({PaperAICommons:{search:async q=>[{title:'File:Duck.png',subject:q}],download:async()=>new Blob([png],{type:'image/png'})},fetch:async()=>{throw Error('Gateway unavailable');}});
 vm.runInContext(fs.readFileSync('frontend/vendor/picture-search.js','utf8'),browser);
 assert.equal((await browser.PaperAIPictures.search('duck'))[0].subject,'duck');
 assert.equal((await browser.PaperAIPictures.download({title:'File:Duck.png'})).type,'image/png');
 console.log('Picture retrieval: subject identification, relevance, license, SSRF, MIME/size restrictions, source preservation, missing service and shared downloads passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
