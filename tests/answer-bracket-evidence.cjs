const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const P=require('../frontend/vendor/professional-paper.js');
const guard=vm.createContext({});
vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),guard);

const source='[[SECTION_ROW: II. Write Yes or No || 2M]]\n1. A tree is a plant. ( )\n2. We drink water. ( )';
const lost=source.replace('2. We drink water. ( )','2. We drink water.');
assert(!guard.missingResponsePositions(source));
assert(guard.missingResponsePositions(lost),'One surviving bracket must not hide a missing bracket on another question');
assert(P.validate(lost).some(issue=>issue.code==='missing_question_bracket'));
assert(!P.validate(source).some(issue=>issue.code==='missing_question_bracket'));
const telugu='[[SECTION_ROW: II. అవును లేదా కాదు || 2M]]\n౧. చెట్టు మొక్క. ( )\n౨. నీరు తాగుతాము.';
assert(guard.missingResponsePositions(telugu),'Native heading and digits need the same per-question check');
const wrapped=P.format('II. Write Yes or No 2x1=2\n1. A tree is a plant.\n( )\n2. We drink water. ( )');
assert(wrapped.includes('1. A tree is a plant. ('), 'An observed wrapped bracket should sit beside its own question');
assert.equal(P.format(wrapped),wrapped);
const table=P.format('II. Write Yes or No 2x1=2\n[[MATCH_ROW: 1. A tree is a plant. || ( )]]\n2. We drink water. ( )');
assert(table.includes('1. A tree is a plant. ('),'An observed bracket cell should sit beside its source question');
assert(!P.validate(table).some(issue=>issue.code==='missing_question_bracket'));
// The source PDF training/I - SA-1 SCIENCE.pdf page 3 visibly places
// a separate printed response bracket beside all five items in each bit.
const scienceChoice='[[SECTION_ROW: IV. Choose the correct answer. || 5x2=10]]\n'+[
 '1. These keep the air fresh and clean. ( )',
 '2. Humans cannot make these things. ( )',
 '3. This fruits has only one seed inside it. ( )',
 '4. Cereals and pulses are called this. ( )',
 '5. Octopus live here ( )'
].join('\n');
const scienceFalse='[[SECTION_ROW: V. Write T for true & write F for false. || 5x2=10]]\n'+[
 '1. All living things grow. ( )','2. Flowers grow from buds. ( )',
 '3. We get sugar from sugar cane. ( )','4. Plants and animals are non-living things. ( )',
 '5. Herbs are small plants. ( )'
].join('\n');
assert(!guard.missingResponsePositions(scienceChoice));
assert(!guard.missingResponsePositions(scienceFalse));
assert(guard.missingResponsePositions(scienceChoice.replace('5. Octopus live here ( )','5. Octopus live here')),
 'A missing bracket in a source choice bit must trigger image verification');
assert(guard.missingResponsePositions(scienceFalse.replace('2. Flowers grow from buds. ( )','2. Flowers grow from buds.')),
 'A missing T/F bracket must trigger image verification despite four other brackets');
assert(P.validate(scienceFalse.replace('2. Flowers grow from buds. ( )','2. Flowers grow from buds.')).some(issue=>issue.code==='missing_question_bracket'));
const answer=P.format('I. Answer the questions 2x1=2\n1. What is water?\nA: [unclear]\n2. Which [unclear] is blue?');
assert(answer.includes('1. What is water?\n[[ANSWER_LINES: 1]]'),'Only unreadable response space becomes a blank');
assert(answer.includes('Which [unclear] is blue?'),'Unclear source wording cannot become invented underscores');
console.log('Source-evidenced Yes/No brackets, per-question omissions, and safe unclear answer spaces pass.');
