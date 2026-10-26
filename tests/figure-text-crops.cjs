const assert=require('node:assert/strict');
const L=require('../frontend/vendor/paper-layout.js');
const question='[[FIGURE: 100,200,420,75|2. What grows on a tree?|none]]';
assert.equal(L.deduplicateFigures(question),'2. What grows on a tree?');
const options='[[FIGURE_ROW: 100,300,340,60|a. A plant with green leaves|none || 490,300,330,60|b. A stone without leaves|none]]';
assert.equal(L.deduplicateFigures(options),'[[CHOICE_ROW: a. A plant with green leaves || b. A stone without leaves]]');
const telugu='[[FIGURE: 100,200,420,75|2. చెట్టు మీద ఏది పెరుగుతుంది?|none]]';
assert.equal(L.deduplicateFigures(telugu),'2. చెట్టు మీద ఏది పెరుగుతుంది?');
const truePicture='[[FIGURE: 100,200,420,75|1. leaf|none]]';
assert.equal(L.deduplicateFigures(truePicture),truePicture,'Do not discard a labelled actual illustration');
assert.equal(L.deduplicateFigures('[[FIGURE_ROW: 100,200,100,60|tree|none || 250,200,100,60|rock|none]]'),
'[[FIGURE_ROW: 100,200,100,60|tree|none || 250,200,100,60|rock|none]]');
assert.equal(L.deduplicateFigures(options),L.deduplicateFigures(L.deduplicateFigures(options)),'Formatting remains stable');
console.log('Figure text guard: questions/options remain editable; genuine short-labelled illustrations remain source crops.');
