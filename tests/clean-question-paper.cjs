const assert=require('node:assert/strict');
const L=require('../frontend/vendor/paper-layout.js');
const fs=require('node:fs');
(async()=>{
 const source=fs.readFileSync('worker/src/paper-layout-rules.js','utf8');
 const W=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const input='[[QUESTION_ROW: 1. [[STRIKE: wrong]] [[REPLACE: old -> [[INSERT: final]]]] [[HIGHLIGHT: wording]] || 2M]]\n[[ANSWER: 18]]\n[[MATCH_ROW: Leaf || Root]]\n[[TABLE_ROW: 12 + 6 || ______]]';
 for(const clean of [L.normalise(input),W.normaliseMarkerRows(input)]){
  assert(!/STRIKE|REPLACE|INSERT|HIGHLIGHT|ANSWER:|wrong|old|18/.test(clean));
  assert(clean.includes('final wording'));assert(clean.includes('Leaf || Root'));assert(clean.includes('12 + 6 || ______'));assert(clean.includes('|| 2M'));
 }
 for(const text of ['2 marks 1. Name a plant.','1. Name 2 marks a plant.','१. नाम लिखिए। २ अंक']){
  const row=L.normalise(text);assert(row.includes('[[QUESTION_ROW:'));assert(row.includes(' || '));
 }
 assert.equal(L.normalise('[[SECTION_ROW: I. Write. | 2M]]'),'[[SECTION_ROW: I. Write. || 2M]]');
 assert.equal(W.normaliseMarkerRows('[[QUESTION_ROW: 1. Add. | 2M]]'),'[[QUESTION_ROW: 1. Add. || 2M]]');
 assert.equal(L.cleanQuestionPaper('Answer: 18\n1. Add 12 + 6.'),'____________________\n1. Add 12 + 6.');
 assert.equal(L.section('1. Evaluate f(5)'),null);
 assert.equal(L.section('1. Plot (2, 3)'),null);
 assert.equal(L.section('1. Draw a 2m line.'),null);
 assert(!W.PAPER_LAYOUT_RULES.includes('transcribe it faithfully'));
 const reversed='[[SOURCE_PAGE: 2]]\n2. Continue.\n[[PAGE_BREAK]]\n[[SOURCE_PAGE: 1]]\nClass: II\n1. Start.';
 const ordered=L.orderPages(reversed);assert(ordered.indexOf('1. Start.')<ordered.indexOf('2. Continue.'));assert(!ordered.includes('SOURCE_PAGE'));
 const unknown='2. Continue.\n[[PAGE_BREAK]]\n[[SOURCE_PAGE: 1]]\n1. Start.';
 assert(L.orderPages(unknown).indexOf('2. Continue.')<L.orderPages(unknown).indexOf('1. Start.'),'Missing page numbers must never guess ordering');
 const headerFirst=L.orderPages('5. Continue.\n[[PAGE_BREAK]]\n[[SOURCE_BANNER: school]]\nClass: II\n[[SECTION_ROW: I. Start. || 2M]]');assert(headerFirst.startsWith('[[SOURCE_BANNER:'),'A sole real school header and section I must precede continuation pages');
 const alternative=headerFirst.replace('SECTION_ROW: I.','QUESTION_ROW: I.');assert(L.orderPages('5. Continue.\n[[PAGE_BREAK]]\n'+alternative).startsWith('[[SOURCE_BANNER:'));
 assert(L.normalise('[[QUESTION_ROW: I अ से श्र तक लिखो। || 25M]]').startsWith('[[SECTION_ROW:'));
 const duplicate=reversed.replace('SOURCE_PAGE: 2','SOURCE_PAGE: 1');assert(L.orderPages(duplicate).startsWith('2. Continue.'));
 const separate=reversed+'\n[[PAPER_BREAK]]\n[[SOURCE_PAGE: 1]]\nAnother paper';assert(L.orderPages(separate).endsWith('Another paper'));
 const banner='20,20,960,140';
 const fields='[[BANNER: '+banner+']]\n[[TABLE_REGION: 880,20,100,100]]\n[[TABLE_ROW: Marks || 100]]\n[[TABLE_REGION: 20,110,960,60]]\n[[TABLE_ROW: CLASS II || Name ____]]\n[[SECTION_ROW: I. Write. || 2M]]';
 const region=L.bannerRegion(banner,fields);assert.equal(region.w,858);assert.equal(region.h,88);
 assert.equal(L.bannerRegion(banner,'[[TABLE_REGION: 20,110,960,60]]\n[[TABLE_ROW: Plant || Leaf]]').h,140,'An unrelated table must never trim a source illustration');
 assert.equal(L.cleanQuestionPaper(String.raw`\_\_\_`),'___');
 const emptyRepair=L.reconcileEmptyGrids('[[GRID_ROW: [unclear] || [unclear]]]\nQuestion two\n[[GRID: 2x1]]',[{columns:2,rows:1,x:100,y:100,w:200,h:30},{columns:2,rows:1,x:100,y:200,w:200,h:30}]);assert(!emptyRepair.includes('[unclear]'));
 const headerFixture=require('node:fs').readFileSync('tests/fixtures/exam-header.pgm');
 const headerMeta=headerFixture.toString('ascii',0,50).match(/^P5\n(\d+) (\d+)\n255\n/),hw=+headerMeta[1],hh=+headerMeta[2],headerPixels=headerFixture.subarray(headerMeta[0].length),rgba=new Uint8ClampedArray(hw*hh*4);
 for(let i=0;i<headerPixels.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=headerPixels[i];rgba[i*4+3]=255;}
 const inkBounds=L.bannerInkBounds(rgba,hw,hh);assert(inkBounds&&inkBounds.h<hh*.82&&inkBounds.h>hh*.65,'Measured title/address must exclude the following editable field row');
 assert(inkBounds.w<hw*.92&&inkBounds.w>hw*.85,'The tall total-marks divider must stay outside the school banner: '+JSON.stringify({inkBounds,hw,hh}));
 assert.equal(L.bannerInkBounds(new Uint8ClampedArray(hw*hh*4).fill(255),hw,hh),null,'An empty or unrelated crop must not receive a guessed banner cut');
 const mdHeader=L.normalise('| CLASS: || II - HINDI || TIME: 2h |\n| Name: ______ || Roll: ____ || 100 |');
 assert(mdHeader.includes('[[TABLE_ROW: CLASS: || II - HINDI || TIME: 2h]]'));
 assert(mdHeader.includes('[[TABLE_ROW: Name: ______ || Roll: ____ || 100]]'));
 assert.equal(L.normalise('|x| + |y|'),'|x| + |y|','Absolute-value notation is not a header table');
 assert.equal(L.normalise('I अ से श्र तक लिखो। || 25M'),'[[SECTION_ROW: I अ से श्र तक लिखो। || 25M]]');
 assert.equal(L.normalise('1. अपना नाम लिखिए। || 2M'),'[[QUESTION_ROW: 1. अपना नाम लिखिए। || 2M]]');
 assert.equal(L.normalise('1. च :- [[GRID: 13x1| |none]] none'),'1. च :-\n[[GRID: 13x1]]');
 assert.equal(W.normaliseMarkerRows('[[GRID: 13x1| |none]] none'),'[[GRID: 13x1]]');
 const continuationHeaders=[
  '[[TABLE_ROW: Name: ____ || Class: I || Roll No: ____]]','[[TABLE_ROW: Sub: Social || Date: ____ || Total Marks: 50]]',
  '[[SECTION_ROW: I. Answer. || 10M]]','1. First question.','[[PAGE_BREAK]]',
  '[[TABLE_ROW: Name: ____ || Class: ____ || Roll No: ____]]','[[TABLE_ROW: Sub: ____ || Date: ____ || Total Marks: ____]]',
  '[[SECTION_ROW: III. Continue. || 5M]]','1. Continued question.'
 ].join('\n');
 const headerFixed=L.normalise(continuationHeaders);
 assert.equal((headerFixed.match(/\bName:/g)||[]).length,1,'Continuation pages must not insert identity fields between question sections');
 assert(headerFixed.includes('Class: I')&&headerFixed.includes('Sub: Social'),'The first paper header keeps its visible class and subject');
 assert.equal(W.normaliseMarkerRows(continuationHeaders),headerFixed,'Server and browser must suppress the same continuation header');
 const orphan='[[SECTION_ROW: II. Answer. || 5M]]\n1. Question.\n[[TABLE_ROW: Name: ____ || Class: I || Roll No: ____]]\n[[SECTION_ROW: III. Continue. || 5M]]';
 for(const clean of [L.normalise(orphan),W.normaliseMarkerRows(orphan)])assert(!clean.includes('Name:'),'Continuation fields must be suppressed even when a page has no initial header');
 const malformed='[[SOURCE_BANNER: school]]\n[[TABLE_ROW: Name: ____ || Class: III || Roll No: ____ || Marks: ____ ||  ||  ||  ]]\n[[TABLE_ROW: Name: ____ || Class: III || Roll No: ____]]\n[[TABLE_ROW: Sub: Social || Name of the Examination: ____ || Marks: ____]]\n[[SECTION_ROW: I. Answer. || 10M]]';
 const malformedFixed=L.normalise(malformed);
 assert.equal((malformedFixed.match(/\bName:/g)||[]).length,1,'A malformed wide duplicate must not precede a cleaner exam header');
 const texFields=String.raw`[[TABLE_ROW: Name:- \underline{\hspace{4cm}} || Class: \underline{\hspace{1cm} III} || Roll No: \hspace{2cm}]]`;
 const texFixed=L.normalise(texFields);
 assert(!/\\(?:underline|hspace|hline)|\\n\b/.test(texFixed));assert(texFixed.includes('Class: ____ III'));
 assert.equal(W.normaliseMarkerRows(texFields),texFixed);
 const identity=L.paperIdentity('[[TABLE_ROW: Name: ____ || Class: III || Roll No: ____]]\n[[TABLE_ROW: Sub: Social || Marks: 50]]');
 assert.deepEqual(identity,{className:'III',subject:'Social'});assert.equal(L.automaticFormat('[[TABLE_ROW: Class: III || Sub: Social]]\nI. Answer.').name,'humanities');
 const joined=L.normalise('IV.\n[[QUESTION_ROW: बारहखड़ी लिखिए। || 5x2=10]]');assert(joined.includes('[[SECTION_ROW: IV. बारहखड़ी लिखिए। || 5x2=10]]'));
 const misplaced='[[GRID: 13x1]]\n5. न :-\n[[GRID: 13x1]]\n6. प :-\n[[SECTION_ROW: IV. Write. || 2M]]';
 const aligned=L.alignLeadingGridLabels(misplaced,2);assert(aligned.indexOf('5. न')<aligned.indexOf('[[GRID:'));assert(aligned.indexOf('6. प')<aligned.lastIndexOf('[[GRID:'));
 assert.equal(L.alignLeadingGridLabels(misplaced,3),misplaced,'Unmatched physical evidence must not reassign grids');
 const metric=L.measuredGrid({w:329,h:254},8);const ratio=metric.width/(8*metric.rowHeight);assert(Math.abs(ratio-(329*L.profile.pageWidth)/(254*L.profile.pageHeight))<.002,'Measured grids must retain their physical aspect ratio on A4');
 const wide=L.measuredGrid({w:990,h:200},2);assert(wide.width<=L.profile.contentWidth);
 const g={columns:13,rows:1,x:100,y:700,w:700,h:35};
 assert.equal(L.mergeGridEvidence([[g],[{...g,columns:14}],[{...g,y:701}]]).at(0).columns,13);
 assert.equal(L.mergeGridEvidence([[g],[{...g,columns:14}]]).length,0,'Conflicting cell counts need image verification, not a guess');
 assert.equal(L.mergeGridEvidence([[g],[{...g,y:800}]]).length,2,'Separate physical rows must remain separate');
 console.log('Clean paper: final edits, omitted answer metadata, preserved question data and right marks pass.');
})().catch(e=>{console.error(e);process.exitCode=1;});
