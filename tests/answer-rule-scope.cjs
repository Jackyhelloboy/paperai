const assert=require('node:assert/strict'),P=require('../frontend/vendor/professional-paper.js');
for(const title of ['VI. निम्न लिखित शब्दों के विलोम शब्द लिखिए।','VII. वाक्यों में प्रयोग कीजिए।','VIII. निम्न लिखित शब्दों के लिंग बदलकर लिखिए।','IX. सही शब्द से खाली स्थान भरिए।','XI. हाँ या नहीं में उत्तर लिखिए।','II. Fill in the blanks.','III. Match the following.','IV. Answer yes or no.']){
 const result=P.format(title+'\n1. शब्द ____ (   )\n[[ANSWER_LINES: 1]]\n2. अन्य\n[[ANSWER_LINES: 3]]');
 assert(!result.includes('ANSWER_LINES:'),title);assert(result.includes('____'));assert(result.includes('('));assert.equal(P.format(result),result);
}
const qa=P.format('I. निम्नलिखित प्रश्नों के उत्तर लिखिए।\n1. फूलों से हमें क्या मिलता है?\n[[ANSWER_LINES: 2]]\n2. पक्षी कहाँ रहता है?');
assert.equal((qa.match(/ANSWER_LINES: 1/g)||[]).length,2,'Written Q&A keeps one answer rule per question');
console.log('Full-width answer rules are limited to written Q&A; inline blanks, brackets and all item text survive.');
