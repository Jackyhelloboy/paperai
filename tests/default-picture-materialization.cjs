const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const source=html.slice(html.indexOf('async function materializeDefaultPictureNotes('),html.indexOf('function pictureStatus(',html.indexOf('async function materializeDefaultPictureNotes(')));
assert.match(html,/captureMethod:'image-pixels-screenshot'/,'Image capture records the PNG screenshot method');
assert.match(html,/context\.drawImage\(source,0,0,canvas\.width,canvas\.height\)/,'Image-only canvas screenshot is taken before Word export');
const requested=[],media=[];
const ctx=vm.createContext({
 extractedMedia:media,crypto:{randomUUID:()=>String(media.length+1)},
 PaperAIPictures:{placeholder:require('../frontend/vendor/picture-search.js').placeholder,
 automatic:async query=>{requested.push(query);return {blob:{},source:{label:query,license:'Public domain'}};}},
 prepareQuestionPicture:async(blob,options)=>({dataUrl:'data:image/png;base64,iVBORw0KGgo=',w:800,h:600,...options}),
});
vm.runInContext(source,ctx);
(async()=>{
 const input='[[DEFAULT_PICTURE_ROW: 1. kite pic — तंग || 2. duck pic — तख || 3. fish pic — ढली || 4. Tap pic — ल || 5. fruits pic — ल]]\n'+
 '[[DEFAULT_PICTURE_ROW: duck pic || fish pic || kite pic]]\n[[DEFAULT_PICTURE_ROW: n tube pic || bow pic]]';
 const result=await ctx.materializeDefaultPictureNotes(input);
 assert.equal((result.match(/\[\[SOURCE_FIGURE_ROW:/g)||[]).length,3);
 assert.equal(media.length,10);
 assert(media.every(m=>m.dataUrl.startsWith('data:image/png;base64,')&&m.defaultIllustration));
 assert.match(result,/kite pic — तंग\|none/);
 assert.match(result,/duck pic\|box/,'Picture-name row retains answer boxes');
 assert(requested.includes('inner tube')&&requested.includes('archery bow'));
 assert.equal(requested.length,7,'Fetch only distinct required illustration assets');
 assert(media.every(m=>m.webSource&&m.w===800),'Preserve source credit and high-resolution pixels');
 ctx.PaperAIPictures.automatic=async()=>{throw Error('Offline');};
 const unavailable=await ctx.materializeDefaultPictureNotes('[[DEFAULT_PICTURE_ROW: 1. duck pic || 2. fish pic]]');
 assert(unavailable.includes('1. duck pic [picture needs review]')&&unavailable.includes('2. fish pic [picture needs review]'));
 assert.equal(media.length,10,'Failed searches must never insert synthetic substitutes');
 ctx.PaperAIPictures.automatic=async query=>{
   if(query==='fish')throw Error('Offline for fish');
   return {blob:{},source:{label:query,license:'Public domain'}};
 };
 const partial=await ctx.materializeDefaultPictureNotes('[[DEFAULT_PICTURE_ROW: 1. duck pic || 2. fish pic]]');
 assert.match(partial,/\[\[SOURCE_FIGURE: web-picture-/,'Keep the successfully found duck image');
 assert.match(partial,/2\. fish pic \[picture needs review\]/,'Keep the missing fish visible for review');
 assert.equal(media.length,11,'Only one valid picture is inserted on partial retrieval');

 console.log('Online pictures become PNG-backed editable Word rows, with source credits, captions, answer spaces and explicit missing-picture review.');
})().catch(e=>{console.error(e);process.exitCode=1});

