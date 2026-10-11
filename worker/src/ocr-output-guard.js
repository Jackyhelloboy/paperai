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
    for(const m of String(text||'').matchAll(/\[\[(FIGURE(?:_ROW)?|BANNER):\s*([\s\S]*?)\]\]/gi)){
        const specs=m[1].toUpperCase()==='FIGURE_ROW'?m[2].split(/\s*\|\|\s*/):[m[2]];
        for(const spec of specs){
            const values=spec.split('|')[0].trim().split(',').map(Number);
            if(values.length!==4||values.some(n=>!Number.isInteger(n)))return true;
            const [x,y,w,h]=values;
            if(x<0||y<0||w<=0||h<=0||x+w>1001||y+h>1001||w*h>600000)return true;
        }
    }
    return false;
}
