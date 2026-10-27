const assert=require('node:assert/strict');
const layout=require('../frontend/vendor/paper-layout.js');
const source=[
    '[[SECTION_ROW: III. चित्र देखकर खाली जगह में सही अक्षर भरो। || 5]]',
    '[[MATCH_ROW: 1. kite pic || — तंग || 2. duck pic || — तख]]',
    '[[MATCH_ROW: 3. fish pic || — ढली || 4. Tap pic || — ल]]',
    '5. fruits pic — ल',
    '(         )',
    'नीचे दिये गये चित्रों को देखकर उनका नाम लिखिए।',
    '[[SOURCE_FIGURE_ROW: actual1|1.|box || actual2|2.|box || actual3|3.|box]]',
].join('\n');
const result=layout.groupExplicitPictureNotes(source);
assert.match(result,/^\[\[DEFAULT_PICTURE_ROW: 1\. kite pic — तंग \|\| 2\. duck pic — तख \|\| 3\. fish pic — ढली \|\| 4\. Tap pic — ल \|\| 5\. fruits pic — ल\]\]/m);
assert.match(result,/\(         \)/);
assert.match(result,/actual1\|1\.\|box/);
assert.equal(layout.groupExplicitPictureNotes(result),result,'Transformation is idempotent');
const unknown=source.replace('Tap pic','Cup pic');
assert.equal(layout.groupExplicitPictureNotes(unknown),unknown,'Unknown request never gets a guessed picture');
const nonPicture=source.replace('चित्र देखकर','कुछ शब्द');
assert.equal(layout.groupExplicitPictureNotes(nonPicture),nonPicture,'Only picture-directed section gets defaults');
const live=['चित्र देखकर खाली जगह में सही अक्षर भरो।','1. kite pic','— तंग','2. duck pic','— तख','3. fish pic','— ढली','4. Tap pic','— ल','5. fruits pic','— ल','V. नीचे दिये गये चित्रों को देखकर उनका नाम लिखिए।','चित्र में रंग भरो।','[[MATCH_ROW: duck pic || fish pic || kite pic]]','IV. चित्र को पहचानकर उसके नाम के पहले वर्ण पर गोला लगाओ।'].join('\n');
const recovered=layout.groupThreePictureLabels(layout.groupExplicitPictureNotes(live));
assert.match(recovered,/\[\[DEFAULT_PICTURE_ROW: 1\. kite pic — तंग \|\| 2\. duck pic — तख \|\| 3\. fish pic — ढली \|\| 4\. Tap pic — ल \|\| 5\. fruits pic — ल\]\]/);
assert.match(recovered,/\[\[DEFAULT_PICTURE_ROW: duck pic \|\| fish pic \|\| kite pic\]\]/);
const real=live.replace('[[MATCH_ROW: duck pic || fish pic || kite pic]]','[[SOURCE_FIGURE_ROW: a|1.|box || b|2.|box || c|3.|box]]');
assert.equal(layout.groupThreePictureLabels(real),real,'Actual source drawings take precedence over fallback art');
const choice='IV. चित्र को पहचानकर उसके नाम के पहले वर्ण पर गोला लगाओ।\nTap pic\n[[MATCH_ROW: थ त द || ध त न]]\n[[MATCH_ROW: n tube pic || bow pic]]\n[[MATCH_ROW: न द थ || द ध न]]';
const choiceFallback=layout.groupPictureChoiceLabels(choice);
assert.match(choiceFallback,/\[\[DEFAULT_PICTURE_ROW: Tap pic\]\]/);
assert.match(choiceFallback,/\[\[DEFAULT_PICTURE_ROW: n tube pic \|\| bow pic\]\]/);
assert.match(choiceFallback,/\[\[MATCH_ROW: थ त द \|\| ध त न\]\]/,'Hindi letter choices stay editable and in source order');
assert.equal(layout.groupPictureChoiceLabels(choice+'\n[[SOURCE_FIGURE: real| |none]]'),choice+'\n[[SOURCE_FIGURE: real| |none]]');
console.log('Explicit five picture notes retain literal incomplete Hindi wording and do not consume the following illustration section.');
