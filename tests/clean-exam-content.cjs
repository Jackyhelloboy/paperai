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
console.log('Clean exam content: repeated plain fields, partial metadata grids, banners removed; exact questions, word banks, matching and separate classes retained.');
