// Reject model token loops; never repair missing questions by inventing content.
export function degenerateOcr(text) {
    const value=String(text||'');
    return value.length>30000 || /([_ .─-])\1{199,}/u.test(value) || /([^\s])\1{79,}/u.test(value);
}
export function blankSafeDraft(text) {
    // A bounded draft is only input to another visual verification, not final OCR.
    return String(text||'').replace(/_{81,}/g,'____________________________').slice(0,12000);
}
// Report observable uncertainty, never a fabricated percentage of accuracy.
export function ocrReviewWarnings(text) {
    const value=String(text||''), warnings=[];
    const unclear=[...value.matchAll(/\[unclear(?::[^\]\n]*)?\]/gi)].length;
    if(unclear)warnings.push({type:'unclear_source',count:unclear,message:'Some source characters could not be read. Compare the marked fragments with the original page.'});
    if(value.includes('\ufffd'))warnings.push({type:'invalid_character',message:'A replacement character is present. Review it against the original page.'});
    if(/\[\[PICTURE(?:_OPTION|_ROW)?:/i.test(value))warnings.push({type:'missing_source_picture',message:'A picture instruction has no original illustration. Review before printing.'});
    if(missingResponsePositions(value))warnings.push({type:'missing_answer_spaces',message:'Answer spaces may be missing. Compare this section with the source.'});
    return warnings;
}

export function losesSourceScript(first, second) {
    // A verifier may improve individual letters, but must not silently
    // translate/transliterate an entire substantial native-script passage.
    const scripts=['Devanagari','Bengali','Gurmukhi','Gujarati','Oriya','Tamil','Telugu','Kannada','Malayalam','Arabic'];
    return scripts.some(script=>{
        const pattern=new RegExp('\\p{Script='+script+'}','gu');
        const before=(String(first||'').match(pattern)||[]).length;
        const after=(String(second||'').match(pattern)||[]).length;
        return before>=20 && after<before*0.5;
    });
}
export function invalidLayoutMarkers(text) {
    if(/\[\[(?:TABLE_ROW|GRID_ROW|MATCH_ROW|ARITHMETIC_ROW):[^\n]*\[\[(?:TABLE_ROW|GRID_ROW|FIGURE_ROW|MATCH_ROW|ARITHMETIC_ROW|GRID):/i.test(text))return true;
    if(/\[\[(?:QUESTION_ROW|SECTION_ROW):[^\]|]*\]\]/i.test(text))return true;
    const allowed=/^(?:(?:COUNT_OBJECTS|ABACUS|SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|SOURCE_PAGE|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION|BRANCH_ROOT|BRANCH_ITEM|DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|REPLACE|CIRCLED|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE|PICTURE|PICTURE_OPTION|PICTURE_ROW):|CHECKBOX$|BRANCH_END$)/i;
    const value=String(text||'');
    if((value.match(/\[\[/g)||[]).length!==(value.match(/\]\]/g)||[]).length)return true;
    // Check every opening, including nested controls inside a valid table row.
    for(const match of value.matchAll(/\[\[/g)){
        const body=value.slice(match.index+2),end=body.indexOf(']]');
        if(end<0||!allowed.test(body.slice(0,end).trim()))return true;
    }
    for(const m of String(text||'').matchAll(/\[\[(FIGURE(?:_ROW)?|BANNER|TABLE_REGION):\s*([\s\S]*?)\]\]/gi)){
        const specs=m[1].toUpperCase()==='FIGURE_ROW'?m[2].split(/\s*\|\|\s*/):[m[2]];
        for(const spec of specs){
            const values=spec.split('|')[0].trim().split(',').map(Number);
            if(values.length!==4||values.some(n=>!Number.isInteger(n)))return true;
            const [x,y,w,h]=values;
            if(x<0||y<0||w<=0||h<=0||x+w>1001||y+h>1001||w*h>600000)return true;
        }
    }
    for(const m of value.matchAll(/\[\[(COUNT_OBJECTS|ABACUS):\s*([^\]\n]+)\]\]/gi)){
        const parts=m[2].split('|').map(s=>s.trim());
        if(parts.length!==4||!/^\d+[.)]?$/.test(parts[1])||!['box','none'].includes(parts[2]))return true;
        const valid=m[1].toUpperCase()==='COUNT_OBJECTS'?/^(?:grapes|apple|smiley|lollipop|star|kite|circle),(?:[1-9]|[12]\d|30)$/.test(parts[0]):/^(?:Th|H|T|O)=\d(?:,(?:Th|H|T|O)=\d){0,3}$/.test(parts[0]);
        const bounds=parts[3].split(',').map(Number);
        if(!valid||bounds.length!==4||bounds.some(n=>!Number.isInteger(n))||bounds[0]<0||bounds[1]<0||bounds[2]<=0||bounds[3]<=0||bounds[0]+bounds[2]>1000||bounds[1]+bounds[3]>1000)return true;
        if(m[1].toUpperCase()==='ABACUS'&&new Set(parts[0].split(',').map(s=>s.split('=')[0])).size!==parts[0].split(',').length)return true;
    }
    for(const m of String(text||'').matchAll(/\[\[SOURCE_PAGE:\s*([^\]]*)\]\]/gi))if(!/^[1-9][0-9]{0,2}$/.test(m[1].trim()))return true;
    for(const m of String(text||'').matchAll(/\[\[GRID:\s*([^\]]*)\]\]/gi)){
        const dimensions=m[1].trim().match(/^(\d{1,2})x(\d{1,2})$/i);
        if(!dimensions||+dimensions[1]<1||+dimensions[1]>52||+dimensions[2]<1||+dimensions[2]>32||+dimensions[1]*+dimensions[2]>600)return true;
    }
    return false;
}

// A crop-only correction must never replace question wording or captions.
export function verifiedFigureCrops(first, verified) {
 const markers=text=>[...String(text).matchAll(/\[\[(FIGURE(?:_ROW)?):\s*([^\n]*?)\]\]/gi)];
 const specs=matches=>matches.flatMap(m=>m[2].split(/\s*\|\|\s*/));
 const a=markers(first),b=markers(verified),old=specs(a),fresh=specs(b);
 if(!old.length||old.length!==fresh.length||invalidLayoutMarkers(verified))return first;
 const caption=spec=>(spec.split('|')[1]||'').trim().toLowerCase();
 if(old.some((spec,i)=>caption(spec)!==caption(fresh[i])))return first;
 let i=0;
 return String(first).replace(/\[\[(FIGURE(?:_ROW)?):\s*([^\n]*?)\]\]/gi,(_,kind,body)=>'[['+kind+': '+body.split(/\s*\|\|\s*/).map(spec=>fresh[i++].split('|')[0].trim()+spec.slice(spec.indexOf('|')<0?spec.length:spec.indexOf('|'))).join(' || ')+']]');
}

// Source row topology may differ even when a coordinate-only correction
// cannot express the change. The caller independently guards literal text.
export function figureLayoutChanged(first, verified) {
 const widths=text=>[...String(text||'').matchAll(/\[\[(FIGURE(?:_ROW)?):\s*([^\]\n]*?)\]\]/gi)]
   .map(m=>m[1].toUpperCase()==='FIGURE_ROW'?m[2].split(/\s*\|\|\s*/).filter(Boolean).length:1);
 const a=widths(first),b=widths(verified);
 return a.length>0&&b.length>0&&a.join(',')!==b.join(',')&&!invalidLayoutMarkers(verified);
}

// Evidence of a structural omission only: request another source-image read.
// Never decide where a missing blank belongs or manufacture its answer.
export function missingResponsePositions(text) {
    const value=String(text||'');
    if(value.length>80000)return false;
    const lines=value.split('\n');
    let expected=false,booleanSection=false,choiceSection=false,body=[];
    const suspect=()=>{
        if(!expected)return false;
        const section=body.join('\n');
        const numbered=[...section.matchAll(/(?:^|\n|\|\||\[\[(?:QUESTION_ROW|MATCH_ROW|TABLE_ROW):)\s*\p{Nd}+[.)।]\s*\S/gu)].length;
        const responseMarker=/(?:_{2,}|\.{3,}|…|[─━—]{2,}|\(\s*\)|\[\s*\]|□|☐|\[\[(?:ANSWER_LINES|GRID|GRID_ROW|CHECKBOX|BOXED):?)/u;
        const response=responseMarker.test(section);
        if(numbered>=2&&!response)return true;
        if(!(booleanSection||choiceSection)||numbered<2)return false;
        // A bracket on one Yes/No item cannot stand in for another item.
        // Include two-column rows: each labelled cell is its own question.
        const questions=[];let current=null;
        for(const line of body){
            const segments=line.replace(/^\s*\[\[(?:MATCH_ROW|TABLE_ROW|QUESTION_ROW):\s*/i,'').replace(/\]\]\s*$/,'').split(/\s*\|\|\s*/);
            for(const part of segments){
                if(/^\s*\p{Nd}+[.)।]\s+\S/u.test(part)){
                    current={text:part};questions.push(current);
                }else if(current&&/^\s*(?:\(\s*\)|\[\s*\]|□|☐|_{2,}|\[\[ANSWER_LINES:)/u.test(part))current.text+=' '+part;
            }
        }
        if(questions.length<2||!questions.some(q=>responseMarker.test(q.text)))return false;
        return questions.some(q=>!responseMarker.test(q.text));
    };
    for(const line of lines){
        const heading=line.match(/^\s*\[\[SECTION_ROW:\s*([^\n]*?)(?:\|\||\]\])/i)||line.match(/^\s*[IVXLCDM]+[.)]\s+(.+)/i);
        if(heading||/^\s*(?:Class\s*:|\[\[PAPER_BREAK\]\])/i.test(line)){
            if(suspect())return true;
            const instruction=heading?heading[1]:'';
            booleanSection=/\b(?:write|mark|choose)\s+[TFYN]\b|\b(?:write|mark|choose)\s+(?:t\s*(?:or|\/)\s*f|y\s*(?:or|\/)\s*n)\b|सही.*गलत|हाँ.*नहीं|हां.*नहीं|అవును.*కాదు|అవునా.*కాదా|ஆம்.*இல்லை|ಹೌದು.*ಇಲ್ಲ|അതെ.*അല്ല|হ্যাঁ.*না|ਹਾਂ.*ਨਹੀਂ|ہاں.*نہیں|\b(?:true\s*(?:or|\/|and)\s*false|true\s+false|yes\s*(?:or|\/|and)\s*no|yes\s+no)\b/i.test(instruction);
            choiceSection=/\b(?:choose|tick|select)\b[^\n]{0,90}\b(?:correct|right|answer|option)\b|సరైన.*ఎంచుకో|சரியான.*தேர்ந்தெடு|ಸರಿಯಾದ.*ಆಯ್ಕೆ/iu.test(instruction);
            expected=booleanSection||choiceSection||/खाली स्थान|रिक्त स्थान|ఖాళీ|கோடிட்ட|ಖಾಲಿ|ഒഴിഞ്ഞ|শূন্যস্থান|ਖਾਲੀ|خالی|\bfill\b[^\n]{0,90}\bblanks?\b|\bquestion\s+tags?\b/i.test(instruction);
            body=[];
        }else body.push(line);
    }
    return suspect();
}

// A first PDF page beginning mid-paper is a coverage failure, not a new title.
export function missingOpeningSections(text, imageMeta={}) {
 if(Number(imageMeta.pageNumber)!==1)return false;
 const value=String(text||''),sections=[...value.matchAll(/(?:^|\n)\s*(?:\[\[SECTION_ROW:\s*)?([IVXLCDM]+)[.)]?\s+[^\n]+/g)];
 return sections.length>0&&sections[0][1]!=='I'&&/(?:^|\n)\s*(?:\[\[(?:QUESTION_ROW|MATCH_ROW|TABLE_ROW):\s*)?[0-9०-९]+[.)]\s*\S/u.test(value);
}

export function losesSourceSections(first, second) {
 const sections=value=>[...String(value||'').matchAll(/(?:^|\n)\s*(?:\[\[SECTION_ROW:\s*)?([IVXLCDM]+)[.)]?\s+([^\n]+)/g)].map(m=>m[1]);
 const a=sections(first),b=sections(second);
 return a.length>=2&&a.some(n=>!b.includes(n));
}

function questionInventory(value) {
 const sections=new Map();let bit='continuation';
 for(const line of String(value||'').split('\n')){
  const heading=line.match(/^\s*(?:\[\[SECTION_ROW:\s*)?([IVX]{1,6})[.)]\s+\S/iu);
  if(heading)bit=heading[1].toUpperCase();
  const body=line.replace(/^\s*\[\[(?:QUESTION_ROW|MATCH_ROW|TABLE_ROW|CHOICE_ROW|OPTION_ROW):\s*/i,'');
  const labels=[...body.matchAll(/(?:^|\|\|)\s*([0-9०-९౦-౯௦-௯]+)[.)।]\s*\S/gu)].map(m=>m[1]);
  if(labels.length)sections.set(bit,[...(sections.get(bit)||[]),...labels]);
 }
 return sections;
}

// Compare the actual visible number sequence rather than the count. An OCR
// correction may add a missed question, but must retain all previously seen
// labels, including repeated or irregular numbers and native digit glyphs.
export function losesSourceQuestions(first, second) {
 const before=questionInventory(first),after=questionInventory(second);
 const subsequence=(oldLabels,newLabels)=>{
  let index=0;
  for(const label of newLabels)if(label===oldLabels[index])index++;
  return index===oldLabels.length;
 };
 for(const [bit,labels] of before){
  let candidate=after.get(bit)||[];
  if(bit==='continuation'){
   const nextBit=[...before.keys()].find(key=>key!=='continuation');
   const previous=nextBit&&['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'].indexOf(nextBit);
   if(previous>0)candidate=after.get(['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'][previous-1])||candidate;
   if(!candidate.length)candidate=[...after.values()].flat();
  }
  if(!subsequence(labels,candidate))return true;
 }
 return false;
}

// A verified transcript must not erase or change a score that was already
// read from the source. Only literal scores are compared, never calculated.
export function losesSourceMarks(first, second) {
 const scores=value=>{
  const sections=new Map();let bit='continuation';
  const add=(key,score)=>sections.set(key,[...(sections.get(key)||[]),score]);
  for(const line of String(value||'').split('\n')){
   const heading=line.match(/^\s*(?:\[\[SECTION_ROW:\s*)?([IVX]{1,6})[.)]\s+\S/iu);
   if(heading)bit=heading[1].toUpperCase();
   const row=line.match(/^\s*\[\[(SECTION_ROW|QUESTION_ROW):\s*(.*?)\s*\|\|\s*([^|]*?)\]\]\s*$/i);
   if(row){
    const score=row[3].replace(/\s+/g,'').trim();
    if(score){const key=row[1].toUpperCase()==='SECTION_ROW'?bit:bit+':'+(row[2].match(/^\s*([0-9०-९౦-౯௦-௯]+)[.)।]/u)?.[1]||row[2].trim());add(key,score);}
   }else if(heading){
    const trailing=line.match(/(?:^|\s)(\p{Nd}+\s*[x×X*]\s*\p{Nd}+\s*=\s*\p{Nd}+\s*(?:M|Marks?|अंक)?|\p{Nd}+\s*(?:M|Marks?|अंक))\s*[.।]?\s*$/iu);
    if(trailing)add(bit,trailing[1].replace(/\s+/g,''));
   }
  }
  return sections;
 };
 const before=scores(first),after=scores(second);
 return [...before].some(([key,marks])=>{
  let index=0;
  for(const mark of after.get(key)||[])if(mark===marks[index])index++;
  return index!==marks.length;
 });
}
