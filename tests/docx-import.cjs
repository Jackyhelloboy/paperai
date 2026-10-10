const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {DOMParser: Parser} = require('../frontend/node_modules/@xmldom/xmldom');
class DOMParser {
    parseFromString(...args) {
        const doc = new Parser().parseFromString(...args);
        doc.querySelector = tag => doc.getElementsByTagName(tag)[0] || null;
        return doc;
    }
}
const source = fs.readFileSync('frontend/index.html','utf8');
const start = source.indexOf('function docxStructuredXml(');
const end = source.indexOf('async function extractOfficeZipFile(',start);
const ctx = vm.createContext({DOMParser});
vm.runInContext(source.slice(start,end),ctx);
const wrap = body => '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>'+body+'</w:body></w:document>';
const box = (text,top,left=0) => '<w:r><w:pict><v:shape style="margin-top:'+top+'pt;margin-left:'+left+'pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>';
const xml=wrap('<w:p>'+box('Later question',100)+box('First question',20)+'</w:p>'+ '<w:p><w:pPr><w:pageBreakBefore/></w:pPr>'+box('Next page',10)+'</w:p>');
const text = ctx.docxStructuredXml(xml);
assert.equal((text.match(/First question/g)||[]).length,1);
assert(!text.includes('[[PICTURE:'), 'text boxes must not create fake pictures');
assert(text.indexOf('First question')<text.indexOf('Later question'));
assert.equal((text.match(/\[\[PAGE_BREAK\]\]/g)||[]).length,1);
assert(text.indexOf('[[PAGE_BREAK]]')<text.indexOf('Next page'));
const normal=ctx.docxStructuredXml(wrap('<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>'));
assert.equal(normal,'A\tB\nC');
const section=ctx.docxStructuredXml(wrap('<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>One</w:t></w:r></w:p><w:p><w:r><w:t>Two</w:t></w:r></w:p>'));
assert(section.includes('One\n[[PAGE_BREAK]]\nTwo'));
const disabled=ctx.docxStructuredXml(wrap('<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore w:val="0"/></w:pPr><w:r><w:t>Two</w:t></w:r></w:p>'));
assert(!disabled.includes('[[PAGE_BREAK]]'));
const alt=wrap('<w:p><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><mc:Choice Requires="a"><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rIdPicture"/></w:drawing></w:r></mc:Choice><mc:Fallback><w:r><w:pict><v:imagedata r:id="rIdPicture"/></w:pict></w:r></mc:Fallback></mc:AlternateContent></w:p>');
const picture=ctx.docxStructuredXml(alt,{rIdPicture:{id:'original-banner',role:'banner'}});
assert.equal((picture.match(/SOURCE_BANNER/g)||[]).length,1,'DrawingML and VML fallback must not duplicate the source picture');
const numbered=body=>'<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>'+body+'</w:t></w:r></w:p>';
const lists=ctx.docxStructuredXml(wrap(numbered('Leaves')+numbered('Bamboo')),{}, {'7':{0:{start:1,format:'decimal',text:'%1.'}}});
assert.equal(lists,'1. Leaves\n2. Bamboo','Native Word list numbers must remain visible');
console.log('DOCX import regression: text boxes occur once in reading order; paragraph/section page breaks, tabs and line breaks survive.');
