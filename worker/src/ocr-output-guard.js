// Reject model token loops; never repair missing questions by inventing content.
export function degenerateOcr(text) {
    const value=String(text||'');
    return value.length>30000 || /([_ .─-])\1{199,}/u.test(value) || /([^\s])\1{79,}/u.test(value);
}
export function blankSafeDraft(text) {
    // A bounded draft is only input to another visual verification, not final OCR.
    return String(text||'').replace(/_{81,}/g,'____________________________').slice(0,12000);
}
export function invalidLayoutMarkers(text) {
    if(/\[\[(?:TABLE_ROW|GRID_ROW|MATCH_ROW|ARITHMETIC_ROW):[^\n]*\[\[(?:TABLE_ROW|GRID_ROW|FIGURE_ROW|MATCH_ROW|ARITHMETIC_ROW|GRID):/i.test(text))return true;
    if(/\[\[(?:QUESTION_ROW|SECTION_ROW):[^\]|]*\]\]/i.test(text))return true;
    const allowed=/^(?:(?:SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|SOURCE_PAGE|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION|BRANCH_ROOT|BRANCH_ITEM|DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|REPLACE|CIRCLED|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE|PICTURE|PICTURE_OPTION|PICTURE_ROW):|CHECKBOX$|BRANCH_END$)/i;
    if([...String(text||'').matchAll(/\[\[([^\]]*?)\]\]/g)].some(m=>!allowed.test(m[1].trim())))return true;
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
