const assert=require('node:assert/strict'),L=require('../frontend/vendor/paper-layout.js');
const source=[
 '[[SOURCE_BANNER: banner1]]','[[TABLE_ROW: Name: ___ || Class: I || Sub: Social]]','[[TABLE_ROW: Roll No: ___ || Date: ___ || Total Marks: 100]]',
 'I. Answer the following.','1. What is your school name?','II. Write any three answers.','4. Write three uses of air.',
 'Name : ______','Class : ______ Sub : ______','Roll No.: ______ Date : ______',
 '[[TABLE_REGION: 900,20,40,200]]','[[TABLE_ROW: Total Marks || ]]','III. Name any three uses of water!',
 '[[PAGE_BREAK]]','[[TABLE_ROW: Roll No.: ____ || Sub: ____]]','Date : ____','VIII. Give two examples.',
 '[[TABLE_ROW: food || cow || closed || Recreation || groups.]]','[[MATCH_ROW: 1. Teacher || [ ] || a. Depending on each other]]',
 '[[PAGE_BREAK]]','[[SOURCE_BANNER: banner2]]','[[TABLE_ROW: Name: ___ || Class: II || Sub: Social]]','I. Answer the following.','1. I come here to learn and study.',
 '[[PAGE_BREAK]]','BRILLIANT MODEL SCHOOLS','[[TABLE_ROW: Name: ___ || Class: II || Sub: Social]]','VI. Write T or F.','1. The Earth has no air or water.'
].join('\n');
const clean=L.cleanExamContent(source);
assert(!/SOURCE_BANNER|BRILLIANT|Roll No|Date :|Name :|Total Marks|TABLE_REGION/.test(clean));
assert.equal((clean.match(/Class:/g)||[]).length,2);
assert.equal((clean.match(/PAPER_BREAK/g)||[]).length,1);
for(const text of ['1. What is your school name?','4. Write three uses of air.','III. Name any three uses of water!','1. I come here to learn and study.','1. The Earth has no air or water.','[[TABLE_ROW: food || cow || closed || Recreation || groups.]]','[[MATCH_ROW: 1. Teacher || [ ] || a. Depending on each other]]'])assert(clean.includes(text),text);
assert.equal(L.cleanExamContent(clean),clean,'Cleanup must remain stable during preview/export');
assert(L.cleanExamContent('Class - II Sub. English\nI. Answer.\n1. Why does the camel put its head inside the tent?').includes('Subject: English'));
assert(L.cleanExamContent('Class - II Sub. English\nI. Answer.\n1. Why does the camel put its head inside the tent?').includes('1. Why does the camel put its head inside the tent?'));
assert(L.cleanExamContent('III. Complete this card about yourself.\n[[TABLE_ROW: Name: ___ || Class: ___]]').includes('[[TABLE_ROW: Name: ___ || Class: ___]]'),'Administrative-looking fields belonging to an actual question must survive');
const telugu=[
 '[[TABLE_ROW: పేరు: ___ || తరగతి: 5 || క్రమ సంఖ్య: ___]]',
 '[[TABLE_ROW: విషయం: తెలుగు || తేదీ: ___ || మొత్తం మార్కులు: 50]]',
 '[[SECTION_ROW: I. చదవండి. || 5M]]','1. ప్రశ్న.',
 '[[TABLE_ROW: పేరు: ___ || తరగతి: ___ || క్రమ సంఖ్య: ___]]',
 '[[SECTION_ROW: II. రాయండి. || 5M]]','2. రెండవ ప్రశ్న.'
].join('\n');
const cleanTelugu=L.cleanExamContent(L.normalise(telugu));
assert(cleanTelugu.includes('Class: 5')&&cleanTelugu.includes('Subject: తెలుగు'),'Native Telugu labels must identify the correct paper');
assert(!/పేరు:|క్రమ సంఖ్య:|మొత్తం మార్కులు:/.test(cleanTelugu),'Student fields must not appear between Telugu bits');
assert(cleanTelugu.includes('1. ప్రశ్న.')&&cleanTelugu.includes('2. రెండవ ప్రశ్న.'),'Telugu question wording must stay untouched');
assert.equal(L.cleanExamContent(cleanTelugu),cleanTelugu,'Multilingual cleanup must be idempotent');
assert.equal(L.paperIdentity('कक्षा: ५\nविषय: हिंदी').className,'५');
assert.equal(L.paperIdentity('கணிதம்\nவகுப்பு: ௫\nபாடம்: தமிழ்').subject,'தமிழ்');
for(const [heading,form] of [
 ['V. अपनी जानकारी भरिए।','[[TABLE_ROW: नाम: ____ || कक्षा: ____]]'],
 ['V. మీ వివరాలు పూరించండి.','[[TABLE_ROW: పేరు: ____ || తరగతి: ____]]'],
 ['V. உங்கள் விவரங்களை நிரப்புக.','[[TABLE_ROW: பெயர்: ____ || வகுப்பு: ____]]'],
 ['V. ನಿಮ್ಮ ವಿವರಗಳನ್ನು ತುಂಬಿರಿ.','[[TABLE_ROW: ಹೆಸರು: ____ || ತರಗತಿ: ____]]']
]){
 const question='[[SECTION_ROW: '+heading+' || 2M]]\n'+form;
 assert(L.cleanExamContent(question).includes(form),'Real native-language student-detail exercises must survive: '+heading);
 const unrelated='[[SECTION_ROW: IV. प्रश्न लिखिए। || 2M]]\n'+form;
 assert(!L.cleanExamContent(unrelated).includes(form),'Administrative furniture must still be removed outside a form exercise');
}
console.log('Clean exam content: repeated plain fields, partial metadata grids, banners removed; exact questions, word banks, matching and separate classes retained.');
