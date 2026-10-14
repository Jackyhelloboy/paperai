const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const c=vm.createContext({});vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),c);
const old='1. What is this?\n[[FIGURE_ROW: 100,200,50,50|cap|box || 200,200,50,50|coat|none]]';
const verified='WRONG QUESTION\n[[FIGURE_ROW: 90,190,80,80|cap|box || 190,190,80,90|coat|none]]';
const fixed=c.verifiedFigureCrops(old,verified);assert(fixed.startsWith('1. What is this?'));assert(fixed.includes('90,190,80,80|cap|box'));assert(!fixed.includes('WRONG'));
assert.equal(c.verifiedFigureCrops(old,verified.replace('|cap|','|other|')),old);assert.equal(c.verifiedFigureCrops(old,'[[FIGURE: 10,20,30,40|cap|box]]'),old);
assert.equal(c.verifiedFigureCrops(old,verified.replace('90,190,80,80','999,999,80,80')),old);
console.log('Crop verification: source wording/captions retained; changed bounds require matching figure counts and captions, valid coordinates.');
