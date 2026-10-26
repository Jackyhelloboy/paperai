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
const hindiScan=[
 '[[SECTION_ROW: I. निम्न लिखित प्रश्नों के उत्तर लिखिए। || 6M]]',
 '1. फूलों से हमें क्या मिलती है?',
 '२. ब्राह्मणी ने क्या पात्र रखा था?',
 '3. किसकी बोली मिसरी घोलती है?',
 '[[SECTION_ROW: II. अंग्रेजी अर्थ लिखिए। || 4M]]',
 '1. कोयल =','२. मिसरी =','3. चारपाई =','4. साँप =',
 '[[SECTION_ROW: III. वचन बदलिए। || 4M]]',
 '1. पत्नी','२. घड़ा','3. चारपाई','4. लड़का',
 '[[SECTION_ROW: IV. विलोम शब्द लिखिए। || 4M]]',
 '1. बाहर','२. कड़वे','3. विश्वास','4. ठंडे'
].join('\n');
const missingBitOne=hindiScan.slice(hindiScan.indexOf('[[SECTION_ROW: II.'));
assert(ctx.losesSourceSections(hindiScan,missingBitOne),'Losing bit I must reject a replacement transcription');
assert(ctx.losesSourceQuestions(hindiScan,hindiScan.replace('२. ब्राह्मणी ने क्या पात्र रखा था?\n','')),'Losing one Hindi question must reject verification');
assert(!ctx.shouldAcceptVerifiedText(hindiScan,hindiScan.replace('२. ब्राह्मणी ने क्या पात्र रखा था?\n',''),{structuredLayout:true}), 'Verification cannot silently delete a handwritten question');
assert(!ctx.losesSourceQuestions(hindiScan,hindiScan+'\n5. अतिरिक्त प्रश्न'),'Extra visually verified content remains eligible');
assert(!ctx.losesSourceQuestions('[[SECTION_ROW: V. शब्द भरिए। || 4M]]\n1. खाली','[[SECTION_ROW: V. शब्द भरिए। || 4M]]\n1. खाली\n२. अगला'),'More questions in the same bit are allowed');
console.log('OCR review: unclear regions, replacement characters, missing illustrations and native-script retention pass.');
