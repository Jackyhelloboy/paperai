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
console.log('Explicit five picture notes retain literal incomplete Hindi wording and do not consume the following illustration section.');
