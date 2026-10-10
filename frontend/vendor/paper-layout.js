/* Shared, deterministic layout helpers. No document text is corrected here. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PaperAILayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
    const profile = Object.freeze({
        version: 4, pageWidth: 11906, pageHeight: 16838, margin: 720,
        font: 'Arial', scriptFont: 'Noto Sans Devanagari',
        bodySize: 24, sectionSize: 26, titleSize: 28, line: 270,
        gridHeight: 460, borderSize: 6, cellPadding: 90,
        contentWidth: 10466, maxColumns: 52, maxRows: 32, maxCells: 600
    });
    function figure(value) {
        const parts = String(value || '').split('|');
        const nums = parts[0].trim().split(',').map(Number);
        if (nums.length !== 4 || nums.some(n => !Number.isFinite(n))) return null;
        const [x,y,w,h] = nums;
        // Coordinates refer to the exact preprocessed OCR page, on a 0–1000 scale.
        if (x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 1001 || y+h > 1001 || w*h > 600000) return null;
        return {x,y,w,h,caption:(parts[1] || '').trim(), answer:parts[2]?.trim() === 'box'};
    }
    function pixels(region, width, height) {
        const x=Math.floor(region.x * width/1000), y=Math.floor(region.y * height/1000);
        return {x,y,w:Math.max(1,Math.min(width-x,Math.ceil(region.w*width/1000))),
            h:Math.max(1,Math.min(height-y,Math.ceil(region.h*height/1000)))};
    }
    function source(value) {
        const [id,caption='',answer=''] = String(value || '').split('|');
        return {id:id.trim(),caption:caption.trim(),answer:answer.trim()==='box'};
    }
    function fit(asset, available=profile.contentWidth, maxHeight=4400) {
        const ratio=Math.max(.05, Number(asset?.w || 1)/Math.max(1,Number(asset?.h || 1)));
        let w=Math.min(available,asset?.widthTwips || Math.min(available,2260));
        let h=w/ratio;
        if(h>maxHeight){w*=maxHeight/h;h=maxHeight;}
        return {w:Math.max(1,Math.round(w)),h:Math.max(1,Math.round(h))};
    }
    function tableWidths(rows,total=profile.contentWidth) {
        const n=Math.max(1,...rows.map(r=>r.length));
        // Long prose gets more room; outliers cannot starve a short label column.
        const weights=Array.from({length:n},(_,i)=>Math.sqrt(Math.max(12,
            ...rows.map(r=>Math.min(180,String(r[i]||'').length)))));
        const sum=weights.reduce((a,b)=>a+b,0);
        const widths=weights.map(w=>Math.floor(total*w/sum));
        widths[n-1]+=total-widths.reduce((a,b)=>a+b,0);
        return widths;
    }
    function section(value) {
        // A marks equation is moved only geometrically, never calculated or changed.
        const s=String(value||'').trim();
        const m=s.match(/^(.+?)\s+((?:\(?\d+\s*[x×X*]\s*\d+\s*=\s*\d+\s*(?:[mM]|marks)?\)?|\d+\s*[mM]))\s*$/);
        return m ? {title:m[1],marks:m[2]} : null;
    }
    return {profile,figure,pixels,source,fit,tableWidths,section};
});
