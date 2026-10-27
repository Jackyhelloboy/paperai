const assert=require('node:assert/strict');
const L=require('../frontend/vendor/paper-layout.js');
const question='[[FIGURE: 100,200,420,75|2. What grows on a tree?|none]]';
assert.equal(L.deduplicateFigures(question),'2. What grows on a tree?');
const options='[[FIGURE_ROW: 100,300,340,60|a. A plant with green leaves|none || 490,300,330,60|b. A stone without leaves|none]]';
assert.equal(L.deduplicateFigures(options),'[[CHOICE_ROW: a. A plant with green leaves || b. A stone without leaves]]');
const telugu='[[FIGURE: 100,200,420,75|2. చెట్టు మీద ఏది పెరుగుతుంది?|none]]';
assert.equal(L.deduplicateFigures(telugu),'2. చెట్టు మీద ఏది పెరుగుతుంది?');
const stale='1. [[SOURCE_FIGURE: source-1|kite pic|none]]\n2. [[SOURCE_FIGURE: source-2|duck pic|none]]';
assert.equal(L.sanitizeSourceFigureText(stale),'1. kite pic\n2. duck pic',
 'Locally saved source crops must be sanitized after resume');
const stalePair='[[SOURCE_FIGURE_ROW: id1|kite pic|none || id2|duck pic|none]]';
assert.equal(L.sanitizeSourceFigureText(stalePair),'[[MATCH_ROW: kite pic || duck pic]]',
 'Two written notes stay in separate side-by-side columns');
assert.equal(L.sanitizeSourceFigureText('[[SOURCE_FIGURE: id|bird|none]]'),'[[SOURCE_FIGURE: id|bird|none]]',
 'A genuine short-labelled drawing must remain');
const html=require('node:fs').readFileSync('frontend/index.html','utf8');
assert(html.includes('PaperAILayout.sanitizeSourceFigureText(allText)'),
 'A resumed PDF must not bypass the new picture-note rule');
assert(require('node:fs').readFileSync('frontend/vendor/scan-checkpoints.js','utf8').includes('v6-picture-evidence'),
 'Old saved OCR pages require fresh visual verification');
const truePicture='[[FIGURE: 100,200,420,75|1. leaf|none]]';
assert.equal(L.deduplicateFigures(truePicture),truePicture,'Do not discard a labelled actual illustration');
assert.equal(L.deduplicateFigures('[[FIGURE_ROW: 100,200,100,60|tree|none || 250,200,100,60|rock|none]]'),
'[[FIGURE_ROW: 100,200,100,60|tree|none || 250,200,100,60|rock|none]]');
assert.equal(L.deduplicateFigures(options),L.deduplicateFigures(L.deduplicateFigures(options)),'Formatting remains stable');
console.log('Figure text guard: questions/options remain editable; genuine short-labelled illustrations remain source crops.');
