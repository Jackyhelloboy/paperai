const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../frontend/vendor/paper-layout.js'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync('worker/src/paper-layout-rules.js','utf8').replace(/export /g,''),ctx);
const bad='[[SOURCE_FIGURE_ROW: a|1.|none ||\n[[SOURCE_FIGURE: b|2.|none]]\n[[SECTION_ROW: IV. What comes after || 5x1=5]] 1. 2,3 ____\n[[SECTION_ROW: V. Arrange || 2x1=2]]\n1. 3,13,18,6 = ____';
for(const normalize of [L.normalise,ctx.normaliseMarkerRows]){
 const fixed=normalize(bad);assert(fixed.includes('IV. What comes after'));assert(fixed.includes('V. Arrange'));assert.equal((fixed.match(/\[\[/g)||[]).length,(fixed.match(/\]\]/g)||[]).length);
 assert(normalize('[[COUNT_OBJECTS: Stars, 6 | 1 | BOX | 10.2,20.1,100.4,50.3]]').includes('star,6|1.|box|10,20,101,51'));
 const grid=normalize('I. Write the numbers from 1-50\nII. Count and write');assert(grid.includes('[[GRID: 10x5]]'));assert.equal(normalize(grid),grid);
 const table=normalize('II. Express the numbers as tens and ones\nNumber || Tens || ones\n4 || ||\n12 || ||\n16 || ||');assert(table.includes('[[TABLE_ROW: 4 ||  || ]]'));
}
const packed=L.normalise('[[SOURCE_FIGURE_ROW: a|1.|none || b|2.|none]] [[SECTION_ROW: IV. Match || 5]]\n1. Keep');assert(packed.includes(']]\n[[SECTION_ROW:'));
assert(L.brokenLayout('[[SOURCE_FIGURE_ROW: unfinished'));assert(!L.brokenLayout(packed));
const worker=fs.readFileSync('worker/src/index.js','utf8');vm.runInContext(worker.slice(worker.indexOf('function mathsQuantities('),worker.indexOf('function shouldVerifyOcr(')),ctx);
const first='[[COUNT_OBJECTS: star,6|3.|box|20,30,300,100]]';
assert.equal(ctx.reconcileMathsFigures(first,first,first,true).text,first);
assert(ctx.reconcileMathsFigures(first,first,first.replace('star,6','star,5'),true).text.startsWith('[[FIGURE:'));
assert(ctx.reconcileMathsFigures(first,first,first,false).text.startsWith('[[FIGURE:'));
const guard=vm.createContext({});vm.runInContext(fs.readFileSync('worker/src/ocr-output-guard.js','utf8').replace(/export /g,''),guard);
assert(!guard.invalidLayoutMarkers(first));assert(guard.invalidLayoutMarkers(first.replace('star,6','star,99')));
assert(!guard.invalidLayoutMarkers('[[ABACUS: T=1,O=3|1.|box|100,200,200,150]]'));
assert(guard.invalidLayoutMarkers('[[ABACUS: T=1,T=3|1.|box|100,200,200,150]]'));
console.log('Maths recovery: malformed boundaries, later bits, empty 50-cell grid, tens/ones blanks, native marker bounds and two-read quantity agreement pass.');
