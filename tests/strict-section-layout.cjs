const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../frontend/vendor/professional-paper.js'),L=require('../frontend/vendor/paper-layout.js');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),ctx);
for(const heading of [
 'II. Unscramble the letters. 5x1=5 M.',
 'III. Complete this card about your self. 4x2=8 M.',
 'XVI. Say if these statements are true or false. 3×1=3',
 'XVII. Choose the correct adverbs. 5×1=5',
 'I. निम्न लिखित प्रश्नों के उत्तर लिखिए। 3x2=6M',
 'II. निम्न लिखित शब्दों के अंग्रेज़ी अर्थ लिखिए। 4x1=4'
]){const h=P.heading(heading);assert(h?.ordinal);assert(h.marks);assert(P.format(heading).startsWith('[[SECTION_ROW:'));}
const duplicated=P.format('Answer the following questions: I. Answer the following questions: 10x4=40 M.');
assert.equal((duplicated.match(/Answer the following questions/g)||[]).length,1);
const choices=P.format('XII. Tick (v) the right options. 4x1=4M.\n[[MATCH_ROW: 1. The woodcutter accepted || ( ) || a. the golden axe || b. the iron axe]]');
assert(choices.includes('Tick (✓)'));assert(choices.includes('1. The woodcutter accepted\n[[CHOICE_ROW: a. the golden axe || b. the iron axe]]'));assert(!choices.includes('MATCH_ROW'));
const literal='IX. Complete the sentences with a or an. 5x1=5M.\n1. bought ___ orange and ___ mango.\nX. Complete these sentences with question tags. 4x1=4\n1. you went to look for your friend ___?';
assert.equal((P.format(literal).match(/___/g)||[]).length,3);
const hindi='Class: V\nSubject: Hindi\nI. निम्न लिखित प्रश्नों के उत्तर लिखिए। 3x2=6M\n1. फूलों से हमें क्या मिलती है?\nA ____\n2. ब्राह्मणी ने क्या पाल रखा था?\nA ____\n3. किसकी बोली मिसरी घोलती है?\nA ____\nII. निम्न लिखित शब्दों के अंग्रेज़ी अर्थ लिखिए। 4x1=4\n1. कोयल = ____\n2. मिसरी = ____';
const formatted=P.format(L.normalise(L.cleanExamContent(hindi)));
for(const text of ['फूलों से हमें क्या मिलती है?','ब्राह्मणी ने क्या पाल रखा था?','किसकी बोली मिसरी घोलती है?','कोयल','मिसरी'])assert(formatted.includes(text));
assert.equal((formatted.match(/ANSWER_LINES: 1/g)||[]).length,3);assert.equal(P.format(formatted),formatted);
assert(!L.cleanExamContent('Class: III || Sub: English\n|| Roll No.: ____ || Date: ____ ||\nI. Answer questions.\n1. Name the animal.').includes('Roll No'));
const partial='1. कोयल =\n2. मिसरी =\n[[SECTION_ROW: III. निम्न लिखित शब्दों के वचन बदलिए। || 4x1=4]]\n1. पत्नी\n2. घड़ा';
assert(ctx.missingOpeningSections(partial,{pageNumber:1}));assert(!ctx.missingOpeningSections(partial,{pageNumber:2}));
const observedFailedExport='1. कोयल =\n2. मिसरी =\n3. चारपाई =\n4. मुँह =\n[[SECTION_ROW: III. वचन बदलिए। || 4x1=4]]\n1. पत्नी';
assert(ctx.missingOpeningSections(observedFailedExport,{pageNumber:1}),
 'The real-world Hindi export starting at bit II without a heading, then bit III, must fail coverage verification');
assert(!ctx.missingOpeningSections('[[SECTION_ROW: I. प्रश्नों के उत्तर लिखिए। || 3x2=6M]]\n1. पहला प्रश्न',{pageNumber:1}));
assert(/if\(missingOpeningSections\(text,imageMeta\)\)\s*\{[\s\S]{0,260}OCR_OUTPUT_INVALID/.test(fs.readFileSync('worker/src/index.js','utf8')),
 'An incomplete first-page OCR cannot return completed after the final verification attempt');
assert(ctx.losesSourceSections(hindi,partial));assert(!ctx.losesSourceSections(partial,hindi+'\nIII. निम्न लिखित शब्दों के वचन बदलिए। 4x1=4'));
const lost='[[SECTION_ROW: XII. Fill in the blanks (Binomials). || 5x1=5]]\n1. We love the of the market place.\n2. The child swayed to the music.';
assert(ctx.missingResponsePositions(lost));assert(!ctx.missingResponsePositions(lost.replace('love the of','love the ___ of')));
assert(P.format('XI. Use words from the box. 5x1=5\npride || flock || pack').includes('[[TABLE_ROW: pride || flock || pack]]'));
assert.equal(P.format('VII. Join a word in Column A with another in Column B. 5x1=5\n[[MATCH_ROW: 1. Sun || ( ) || a. hive]]').includes('MATCH_ROW'),true);
console.log('Strict sections: English/Hindi headings, source words, blanks, options, word banks, header cleanup and missing-opening verification pass.');

const worker=fs.readFileSync('worker/src/index.js','utf8');
vm.runInContext(worker.slice(worker.indexOf('function shouldAcceptVerifiedText('),worker.indexOf('function mergeAiUsage(')),ctx);
assert(!ctx.shouldAcceptVerifiedText(hindi,partial,{pageNumber:1,structuredLayout:true}),'A verifier cannot drop recognised Hindi sections');
assert(ctx.shouldAcceptVerifiedText(partial,hindi+'\nIII. निम्न लिखित शब्दों के वचन बदलिए। 4x1=4\n1. पत्नी\n2. घड़ा',{pageNumber:1,structuredLayout:true}),'A verifier may recover the missing source opening');

const orphan=P.format('XII. Tick the right options. 4x1=4M\n1.\na.\nb.\n[[MATCH_ROW: The woodcutter accepted || ( ) || ]]\n[[MATCH_ROW: the golden axe. || ( ) || ]]\n[[MATCH_ROW: the iron axe. || ( ) || ]]');
assert(orphan.includes('1. The woodcutter accepted\n[[CHOICE_ROW: a. the golden axe. || b. the iron axe.]]'));
assert.equal(P.format(orphan),orphan);
const short=P.format('I. Answer the following. 2x1=2\n1. Where does Manu live?\n2. Name some parts of your body?');
assert.equal((short.match(/ANSWER_LINES: 1/g)||[]).length,2);assert.equal(P.format(short),short);
