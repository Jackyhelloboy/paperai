const assert=require('node:assert/strict'),fs=require('node:fs'),P=require('../frontend/vendor/picture-search.js');
(async()=>{
 for(const subject of ['kite','duck','fish','tap','apple','banana','grapes','bow','fruits']){
  const art=P.reviewedArtwork(subject);assert(art&&art.reviewMethod==='curated visual inspection');
  const bytes=fs.readFileSync('frontend'+art.assetUrl);assert(bytes.length>1000);
  assert.equal(bytes.readUInt32BE(16),640);assert(bytes.readUInt32BE(20)>=480);
  const found=await P.reviewed(subject,async url=>{assert.equal(url,art.assetUrl);return new Response(bytes,{headers:{'Content-Type':'image/png'}})});
  assert.equal(found.blob.size,bytes.length);assert(found.source.sourceUrl.startsWith('https://openmoji.org/'));
 }
 assert.equal(P.reviewedArtwork('tube'),null);assert.equal(P.reviewedArtwork('unicorn'),null);
 assert.equal(await P.reviewed('arbitrary request',()=>{throw Error('must not fetch')}),null);
 await assert.rejects(P.reviewed('duck',async()=>new Response('<html>error</html>',{headers:{'Content-Type':'image/png'}})),/Invalid/);
 console.log('Reviewed raster catalog: provenance, dimensions, exact subjects and PNG signatures pass.');
})().catch(e=>{console.error(e);process.exitCode=1});
