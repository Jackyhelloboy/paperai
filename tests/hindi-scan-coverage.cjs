// A minimal, privacy-safe structural fixture based on the two-page Class V
// handwritten Hindi scan. This verifies transformation coverage, not AI OCR.
const assert=require('node:assert/strict');
const L=require('../frontend/vendor/paper-layout.js');
const P=require('../frontend/vendor/professional-paper.js');
const source=[
 '[[TABLE_ROW: Name: ______ || Class: V || Subject: Hindi || Roll No: ____]]',
 '[[SECTION_ROW: I. निम्न लिखित प्रश्नों के उत्तर लिखिए। || 3x2=6M]]',
 '1. फूलों से हमें क्या मिलती है?',
 '२. ब्राह्मणी ने क्या पाल रखा था?',
 '3. किसकी बोली मिसरी घोलती है?',
 '[[SECTION_ROW: II. निम्न लिखित शब्दों के अंग्रेज़ी अर्थ लिखिए। || 4x1=4M]]',
 '1. कोयल = ____','२. मिसरी = ____','3. चारपाई = ____','4. साँप = ____',
 '[[SECTION_ROW: III. वचन बदलिए। || 4x1=4M]]',
 '1. पत्नी','२. घड़ा','3. चारपाई','4. लड़का',
 '[[SECTION_ROW: IV. विलोम शब्द लिखिए। || 4x1=4M]]',
 '[[PAGE_BREAK]]',
 '1. बाहर','२. कड़वे','3. विश्वास','4. ठंडे',
 '[[SECTION_ROW: V. सही शब्दों से खाली स्थान भरिए। || 4x1=4M]]',
 '1. साँप बच्चे की ____ की तरफ बढ़ने लगा। (चारपाई / टाँग)',
 '२. नारायण नाम का एक ____ था। (ब्राह्मण / किसान)',
 '3. ब्राह्मणी जल लेने के लिए ____ पर गई। (अनेक / कुएँ)',
 '4. नेवले को जन्म देकर ____ मर गई थी। (साँप / नेवली)',
 '[[SECTION_ROW: VI. सही जोड़ी बनाइए। || 3M]]',
 '[[MATCH_ROW: 1. फूल || (a) Dust]]',
 '[[MATCH_ROW: २. घोंसला || (b) cuckoo]]',
 '[[MATCH_ROW: 3. धूल || (c) colour]]',
 '[[MATCH_ROW: 4. कोयल || (d) crow]]',
 '[[MATCH_ROW: 5. रंग || (e) Flower]]',
 '[[MATCH_ROW: 6. कौआ || (f) Dirty]]'
].join('\n');
const output=P.format(L.cleanExamContent(L.normalise(source)));
const sections=[...output.matchAll(/^\s*\[\[SECTION_ROW:\s*([IVX]+)[.)]/gm)].map(m=>m[1]);
assert.deepEqual(sections,['I','II','III','IV','V','VI'],'Every original bit remains in source order');
assert(output.includes('[[PAGE_BREAK]]')&&!output.includes('[[PAPER_BREAK]]'),'Page two continues bit IV in the same paper');
assert.equal((output.match(/\[\[MATCH_ROW:/g)||[]).length,6,'All six unmatched Hindi-English pairing rows survive');
assert(!output.includes('Name:')&&!output.includes('Roll No:'),'Student form metadata does not interrupt questions');
assert(output.includes('Class: V')&&output.includes('Subject: Hindi'));
for(const phrase of ['फूलों से हमें क्या मिलती है?','ब्राह्मणी ने क्या पाल रखा था?','बाहर','नेवले को जन्म देकर','(a) Dust','(f) Dirty'])
 assert(output.includes(phrase),'Missing question or bilingual matching text: '+phrase);
assert.equal(P.format(output),output,'Word-layout preparation should remain stable on repeated runs');
console.log('Hindi scan structure: all six bits, page continuation, original marks, 25 items and mixed Hindi-English matching retained.');
