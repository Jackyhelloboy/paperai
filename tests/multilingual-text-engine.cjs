const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Text=require('../frontend/vendor/paper-text');
const build=require('../frontend/node_modules/esbuild');
const source=path.resolve('frontend');
const output=build.buildSync({stdin:{contents:'export { diffArrays } from "diff"; export { graphemeSegments } from "unicode-segmenter/grapheme";',resolveDir:source},bundle:true,format:'iife',globalName:'PaperAITextEngine',minify:true,target:'es2020',write:false});
const browser=vm.createContext({});
vm.runInContext(output.outputFiles[0].text,browser);
vm.runInContext(fs.readFileSync('frontend/vendor/paper-text.js','utf8'),browser);
assert(output.outputFiles[0].contents.length<30000,'Text utilities should stay small on phones');
const words=Array.from({length:1600},(_,i)=>'शब्द'+i);
const before=words.join(' '),after=before.replace('शब्द0 ','नया0 ').replace('शब्द1599','नया1599');
const layout='[[MATCH_ROW: '+words.slice(0,800).join(' ')+' || '+words.slice(800).join(' ')+']]';
const expected=layout.replace('शब्द0 ','नया0 ').replace('शब्द1599','नया1599');
for(const engine of [Text,browser.PaperAIText]){
 assert.equal(engine.applyEdits('[[MATCH_ROW: घर || घर]]','घर | घर','घर नया | घर'),'[[MATCH_ROW: घर नया || घर]]','An insertion before the cell separator stays in the previous cell');
 assert.equal(engine.applyEdits('पहला\nदूसरा','पहला\nदूसरा','पहला नया\nदूसरा'),'पहला नया\nदूसरा','An end-of-line insertion stays on its own question');
 assert.equal(engine.applyEdits('पहला','पहला','पहला\nनया प्रश्न'),'पहला\nनया प्रश्न','An appended new question keeps its line break');
 assert.equal(engine.applyEdits(layout,before,after),expected,'Distant corrections must not collapse the second matching cell');
 const cases=[['लड़की','लड़के'],['పిల్లి','పిల్లులు'],['தமிழ்','தமிழில்'],['ಕನ್ನಡ','ಕನ್ನಡದಲ್ಲಿ'],['മലയാളം','മലയാളത്തിൽ'],['বাংলা','বাংলায়'],['ગુજરાતી','ગુજરાતીમાં'],['ਪੰਜਾਬੀ','ਪੰਜਾਬੀ ਵਿੱਚ'],['ଓଡ଼ିଆ','ଓଡ଼ିଆରେ'],['اردو','اردو زبان'],['क्‍ष','क्ष'],['👩🏽‍🏫','👨🏽‍🏫'],['日本語','日本語です'],['ภาษาไทย','ภาษาไทยค่ะ']];
 for(const [oldWord,newWord] of cases){
  const raw='[[SOURCE_FIGURE: asset-stable| |none]]\n[[MATCH_ROW: '+oldWord+' || '+oldWord+']]';
  assert.equal(engine.applyEdits(raw,oldWord+' | '+oldWord,oldWord+' | '+newWord),raw.replace('|| '+oldWord, '|| '+newWord),'Only the selected repeated word may change: '+oldWord);
 }
 assert.equal(engine.applyEdits('[[TABLE_ROW: घर || घर]]','घर | घर','घर | [[GRID: 9x9]]'),null,'Pasted protocol cannot replace question text with a grid');
 const oldMany=Array.from({length:900},(_,i)=>'old'+i).join(' '),newMany=Array.from({length:900},(_,i)=>'new'+i).join(' ');
 assert.equal(engine.applyEdits(oldMany,oldMany,newMany),null,'Huge unrelated pastes must decline instead of moving content across cells');
}
const fallback=vm.createContext({});vm.runInContext(fs.readFileSync('frontend/vendor/paper-text.js','utf8'),fallback);
assert.equal(fallback.PaperAIText.applyEdits(layout,before,after),null,'If the bundle fails to load, the old quadratic fallback must not collapse large papers');
assert.equal(fallback.PaperAIText.applyEdits('1. घर','1. घर','1. मकान'),'1. मकान');
const clusters=[...browser.PaperAITextEngine.graphemeSegments('क्‍ष పిల్లి 👩🏽‍🏫')].map(g=>g.segment);
assert(clusters.includes('क्‍ष')&&clusters.includes('👩🏽‍🏫'),'Conjuncts and joined symbols stay whole');
const html=fs.readFileSync('frontend/index.html','utf8');
assert(html.indexOf('vendor/text-diff-engine.js')<html.indexOf('vendor/paper-text.js'));
console.log('Multilingual text engine: long-paper cell ownership, 14 script/symbol cases, Indic conjuncts, protected media/protocol, bounded work and browser/Node parity pass. Bundle '+output.outputFiles[0].contents.length+' bytes; no OCR inference.');
