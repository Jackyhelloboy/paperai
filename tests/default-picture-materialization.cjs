const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8'),Pictures=require('../frontend/vendor/picture-search.js');
const source=html.slice(html.indexOf('async function materializeDefaultPictureNotes('),html.indexOf('function pictureStatus(',html.indexOf('async function materializeDefaultPictureNotes(')));
const requested=[],media=[];let serial=0;
const ctx=vm.createContext({extractedMedia:media,crypto:{randomUUID:()=>String(++serial)},
 PaperAIPictures:{placeholder:Pictures.placeholder,reviewed:async subject=>{requested.push(subject);const art=Pictures.reviewedArtwork(subject);return art?{blob:{},source:art}:null;}},
 prepareQuestionPicture:async(blob,options)=>({dataUrl:'data:image/png;base64,iVBORw0KGgo=',w:640,h:640,...options}),
});
vm.runInContext(source,ctx);
(async()=>{
 const input='[[DEFAULT_PICTURE_ROW: 1. kite pic — तंग || 2. duck pic — तख || 3. fish pic — ढली || 4. Tap pic — ल || 5. fruits pic — ल]]\n'+
 '[[DEFAULT_PICTURE_ROW: duck pic || fish pic || kite pic]]\n[[DEFAULT_PICTURE_ROW: n tube pic || bow pic]]';
 const result=await ctx.materializeDefaultPictureNotes(input);
 assert.equal((result.match(/\[\[SOURCE_FIGURE_ROW:/g)||[]).length,2);
 assert.equal(media.length,9,'Ambiguous tube must not receive a guessed picture');
 assert(result.includes('n tube pic')&&!result.includes('[picture needs review]'));
 assert.match(result,/kite pic — तंग\|none/);assert.match(result,/duck pic\|box/);
 assert.equal(requested.length,7,'Repeated exact requests share one local artwork load');
 assert(media.every(m=>m.webSource?.license==='CC BY-SA 4.0'&&m.webSource.reviewMethod==='curated visual inspection'));
 const original='[[SOURCE_FIGURE: original|duck pic|none]]';
 assert.equal(await ctx.materializeDefaultPictureNotes(original),original,'Original source pixels must not be replaced');
 ctx.PaperAIPictures.reviewed=async subject=>{if(subject==='fish')throw Error('Offline');return {blob:{},source:Pictures.reviewedArtwork(subject)}};
 const partial=await ctx.materializeDefaultPictureNotes('[[DEFAULT_PICTURE_ROW: 1. duck pic || 2. fish pic]]');
 assert.match(partial,/\[\[SOURCE_FIGURE: reviewed-picture-/);assert(partial.includes('2. fish pic'));
 assert(!partial.includes('Offline')&&!partial.includes('needs review'));
 console.log('Reviewed PNGs preserve explicit requests, captions, original drawings, partial success and answer spaces.');
})().catch(e=>{console.error(e);process.exitCode=1});
