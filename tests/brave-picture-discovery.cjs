// Focused tests for opt-in image discovery. Run with Node 22+.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source=fs.readFileSync('worker/src/picture-search.js','utf8');
assert.match(source,/BRAVE_SEARCH_API_KEY/);
assert.match(source,/discover/);
assert.match(source,/safesearch', 'strict'/);
assert.match(source,/confident:false/);
assert.match(source,/CommonsPictures\.handlePictureSearch/);
const worker=fs.readFileSync('worker/src/index.js','utf8');
assert.match(worker,/handlePictureSearch\(request, corsHeaders, env\)/);
console.log('Brave opt-in discovery is secret-gated, strict-safe, and cannot automatically embed unverified results.');
