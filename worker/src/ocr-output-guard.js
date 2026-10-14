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
    const allowed=/^(?:(?:SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|SOURCE_PAGE|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION|BRANCH_ROOT|BRANCH_ITEM|DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|REPLACE|CIRCLED|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE|PICTURE|PICTURE_OPTION|PICTURE_ROW):|CHECKBOX$|BRANCH_END$)/i;
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
