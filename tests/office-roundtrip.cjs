const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sax=require('sax');
const JSZip=require('jszip');
// Minimal namespace-aware DOM adapter backed by SAX for the browser XML reader.
class XMLParser {
 parseFromString(xml) {
  const root={children:[],localName:'#document'};const stack=[root];
  const parser=sax.parser(true);
  parser.onopentag=tag=>{
   const node={children:[],localName:tag.name.split(':').pop(),parentNode:stack.at(-1)};
   Object.defineProperty(node,'textContent',{get:()=>node.children.map(c=>typeof c==='string'?c:c.textContent).join('')});
   node.getElementsByTagNameNS=(_,name)=>{const out=[];function walk(n){for(const c of n.children){if(typeof c==='string')continue;if(name==='*'||c.localName===name)out.push(c);walk(c);}}walk(node);return out;};
   stack.at(-1).children.push(node);stack.push(node);
  };
  parser.onclosetag=()=>stack.pop();parser.ontext=t=>stack.at(-1).children.push(t);parser.write(xml).close();
  root.querySelector=()=>null;root.getElementsByTagNameNS=(_,name)=>root.children.flatMap(c=>[...(c.localName===name?[c]:[]),...c.getElementsByTagNameNS('*',name)]);
  return root;
 }
}
const ctx=vm.createContext({DOMParser:XMLParser,window:{docx:require('docx'),docxShapes:{ShapeCanvasRun:class{}}}});
for(const name of ['paperai-document-model.js','paperai-word-engine.js'])vm.runInContext(fs.readFileSync('frontend/vendor/'+name,'utf8'),ctx);
const html=fs.readFileSync('frontend/index.html','utf8');
vm.runInContext(html.slice(html.indexOf('function xmlParagraphText('),html.indexOf('async function extractOfficeZipFile(')),ctx);
(async()=>{
 const source='1. साँप बच्चे की ____ की तरफ बढ़ने लगा।\nVI. सही जोड़ी बनाइये।\n[[COLUMNS_START]]\n[[COLUMN_ROW: 1 फूल || (a) dust]]\n[[COLUMN_ROW: 2 धूल || (b) colour]]\n[[COLUMNS_END]]';
 const blob=await ctx.window.PaperAIWordEngine.makeDocx(source);
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('string');
 const reread=ctx.xmlParagraphText(xml);
 assert(reread.includes('[[COLUMN_ROW: 1 फूल || (a) dust]]'),'Word tabs must preserve adjacent matching pairs when re-uploaded');
 const model=ctx.window.PaperAIDocumentModel;
 assert.equal(model.cleanOutputText(reread).replace(/\s/g,''),model.cleanOutputText(source).replace(/\s/g,''),'Word roundtrip preserves every visible character in order');
 const breaks=ctx.xmlParagraphText('<w:document xmlns:w="test"><w:p><w:r><w:t>First</w:t><w:br/><w:t>Second</w:t></w:r></w:p></w:document>');
 assert.equal(breaks,'First\nSecond','Office manual line breaks are preserved');
 console.log('Re-uploading actual Word exports preserves matching columns, Hindi text and manual line breaks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
