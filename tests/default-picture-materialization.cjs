const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('frontend/index.html','utf8');
const source=html.slice(html.indexOf('async function materializeDefaultPictureNotes('),html.indexOf('function pictureStatus(',html.indexOf('async function materializeDefaultPictureNotes(')));
const requested=[],media=[];
const ctx=vm.createContext({
 extractedMedia:media,crypto:{randomUUID:()=>String(media.length+1)},
 fetch:async url=>{requested.push(url);return {ok:true,blob:async()=>({})}},
 createImageBitmap:async()=>({close(){}}),
 document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(){},set fillStyle(v){}}),toDataURL:()=> 'data:image/png;base64,iVBORw0KGgo='})},
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
 assert(requested.includes('/default-tube.svg')&&requested.includes('/default-bow.svg'));
 assert.equal(requested.length,7,'Fetch only distinct required illustration assets');
 console.log('Picture fallback becomes PNG-backed editable Word image rows, preserving visible text and answer spaces.');
})().catch(e=>{console.error(e);process.exitCode=1});
