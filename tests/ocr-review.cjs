const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),ctx);
const worker=fs.readFileSync('worker/src/index.js','utf8');
vm.runInContext(worker.slice(worker.indexOf('function shouldAcceptVerifiedText('),worker.indexOf('function mergeAiUsage(')),ctx);
assert.equal(ctx.ocrReviewWarnings('१. कितने [unclear] हैं?\n2. [unclear: letter]').find(w=>w.type==='unclear_source').count,2);
assert.equal(ctx.ocrReviewWarnings('తెలుగు தமிழ் മലയാളം বাংলা اردو').length,0);
assert(ctx.ocrReviewWarnings('Word \ufffd')[0].type==='invalid_character');
assert(ctx.ocrReviewWarnings('[[PICTURE: tiger pic]]')[0].type==='missing_source_picture');
for(const native of ['यह वास्तविक प्रश्न पत्र की मूल भाषा है। इसे ठीक वैसे ही रखना चाहिए।','ఇది ప్రశ్న పత్రంలోని అసలు తెలుగు భాష వాక్యం అలాగే ఉంచాలి','یہ سوالیہ پرچے کی اصل عبارت ہے اسے اسی زبان میں محفوظ رکھیں']){
  assert(ctx.losesSourceScript(native,'This question paper has been translated into English.'));
  assert(!ctx.shouldAcceptVerifiedText(native,'This question paper has been translated into English.',{structuredLayout:true}));
  assert(!ctx.losesSourceScript(native,native+' [unclear]'));
}
assert(!ctx.losesSourceScript('Class: 1 Subject: हिंदी','Class: 1 Subject: हिन्दी'),'Short header spelling corrections remain eligible');
console.log('OCR review: unclear regions, replacement characters, missing illustrations and native-script retention pass.');
