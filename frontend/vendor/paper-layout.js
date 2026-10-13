/* Shared, deterministic layout helpers. No document text is corrected here. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PaperAILayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
    const profile = Object.freeze({
        version: 8, pageWidth: 11906, pageHeight: 16838, margin: 720,
        font: 'Arial', scriptFont: 'Noto Sans Devanagari',
        bodySize: 24, sectionSize: 26, titleSize: 28, line: 270,
        gridHeight: 460, borderSize: 6, cellPadding: 90,
        contentWidth: 10466, maxColumns: 52, maxRows: 32, maxCells: 600
    });
    const referenceFormats=Object.freeze({
        compact:{label:'Compact question paper',font:'Arial',headingFont:'Arial',body:11,heading:12,line:1.15,after:1,indent:0},
        science:{label:'Annual science reference',font:'Arial',headingFont:'Arial',body:10,heading:12,line:1,after:0,indent:360},
        humanities:{label:'Social and English reference',font:'Tahoma',headingFont:'Times New Roman',body:11,heading:13,line:1.5,after:0,indent:0},
        worksheet:{label:'Science worksheet reference',font:'Tahoma',headingFont:'Tahoma',body:12,heading:12,line:1,after:0,indent:0}
    });
    function automaticFormat(text, nativeSource=false) {
        // Detect only labels in the paper header, never a subject mentioned in a question.
        const lines=String(text||'').split('\n').map(s=>s.trim()).filter(Boolean);
        const firstQuestion=lines.findIndex(s=>/^(?:\d+[.)]\s|\[\[(?:SECTION_ROW|QUESTION_ROW):|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s)/i.test(s));
        const header=lines.slice(0,firstQuestion<0?12:Math.min(12,firstQuestion)).join('\n');
        const subject='(?:subject\\s*[:=\\-]\\s*|(?:class\\s*)?(?:[IVX]+|[1-9]|10)\\s*[-:]\\s*)';
        let name='compact';
        if(/\b(?:work\s*sheet|activity\s*sheet)\b/i.test(header))name='worksheet';
        else if(new RegExp('(?:^|\\n)\\s*'+subject+'(?:social(?:\\s+(?:studies|science))?|english)\\b','i').test(header)||/^(?:social studies|social science|english)\s*$/im.test(header))name='humanities';
        else if(new RegExp('(?:^|\\n)\\s*'+subject+'science\\b','i').test(header)||/^science\s*$/im.test(header))name='science';
        return {name,format:referenceFormats[name],preserveSource:Boolean(nativeSource)};
    }
    function figure(value) {
        const parts = String(value || '').split('|');
        const nums = parts[0].trim().split(',').map(Number);
        if (nums.length !== 4 || nums.some(n => !Number.isFinite(n))) return null;
        const [x,y,w,h] = nums;
        // Coordinates refer to the exact preprocessed OCR page, on a 0–1000 scale.
        if (x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 1001 || y+h > 1001 || w*h > 600000) return null;
        const caption=parts.length===2&&/^(?:none|box)$/.test(parts[1].trim()) ? '' : (parts[1]||'').trim();
        return {x,y,w,h,caption, answer:parts[parts.length-1]?.trim() === 'box'};
    }
    function bannerRegion(spec,text) {
        const banner=figure(spec);if(!banner)return null;
        const region={...banner},lines=String(text||'').split('\n');
        const stop=lines.findIndex(line=>/^\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW):|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)\s]+\S|[0-9०-९]+[.)]\s)/i.test(line));
        const header=lines.slice(0,stop<0?Math.min(lines.length,24):stop);
        for(let i=0;i<header.length;i++){
            const m=header[i].match(/^\s*\[\[TABLE_REGION:\s*([^\]]+)\]\]\s*$/i);if(!m)continue;
            const field=figure(m[1]);if(!field)continue;
            const rows=[];for(let j=i+1;j<header.length&&/^\s*\[\[(?:TABLE_ROW|TABLE_WIDTHS|TABLE_HEADER):/i.test(header[j]);j++)rows.push(header[j]);
            if(!/\b(?:class|subject|time|marks|roll|name|signature|exam(?:ination)?s?)\b|कक्षा|नाम|अंक/i.test(rows.join(' ')))continue;
            const overlapX=Math.min(region.x+region.w,field.x+field.w)-Math.max(region.x,field.x);
            const overlapY=Math.min(region.y+region.h,field.y+field.h)-Math.max(region.y,field.y);
            if(field.y>region.y&&overlapX>=region.w*.5&&overlapY>0&&field.y-region.y>=20)region.h=Math.min(region.h,field.y-region.y-2);
            else if(field.x>region.x+region.w*.5&&overlapY>=Math.min(region.h,field.h)*.5&&field.w<region.w*.5)region.w=Math.min(region.w,field.x-region.x-2);
        }
        return region;
    }
    function bannerInkBounds(rgba,width,height) {
        if(width<80||height<35||rgba.length<width*height*4)return null;
        const left=Math.floor(width*.15),right=Math.floor(width*.88),hist=new Uint32Array(256);
        const luminance=p=>Math.round((rgba[p]*299+rgba[p+1]*587+rgba[p+2]*114)/1000);
        let total=0;
        for(let y=0;y<height;y+=2)for(let x=left;x<right;x+=2){hist[luminance((y*width+x)*4)]++;total++;}
        let count=0,background=255;for(let n=0;n<256;n++){count+=hist[n];if(count>=total*.85){background=n;break;}}
        if(background<70)return null;
        const dark=p=>luminance(p)<background-45,bands=[];let start=-1;
        for(let y=0;y<=height;y++){
            let ink=0;if(y<height)for(let x=left;x<right;x++)if(dark((y*width+x)*4))ink++;
            const active=y<height&&ink/(right-left)>.11;
            if(active&&start<0)start=y;
            if(!active&&start>=0){if(y-start>=2)bands.push({start,end:y-1,height:y-start});start=-1;}
        }
        // A large title, a smaller address and a later field row provide
        // measured evidence for the cut. No universal banner percentage is
        // used when that visual sequence is absent.
        if(bands.length<3||bands[0].height<height*.08||bands[1].height>bands[0].height*.6||bands[2].start-bands[1].end<3)return null;
        const bottom=Math.floor((bands[1].end+bands[2].start)/2);let cutWidth=width;
        // A tall divider at the right identifies a separate total-marks box.
        // Short text strokes and class-field borders cannot meet this span.
        for(let x=Math.floor(width*.7);x<Math.floor(width*.97);x++){
            let ink=0,run=0,longest=0,gap=0,fullInk=0,spanInk=0;
            for(let y=0;y<height;y++){
                if(dark((y*width+x)*4))fullInk++;
                if(y>bands[2].end)continue;
                const hit=Math.min(luminance((y*width+x-1)*4),luminance((y*width+x)*4),luminance((y*width+x+1)*4))<background-30;
                if(hit){if(y<bottom)ink++;if(y>=bands[0].start)spanInk++;run++;gap=0;longest=Math.max(longest,run);}
                else if(run&&gap<2){run++;gap++;}else{run=0;gap=0;}
            }
            // A tightly supplied banner may start below the top of the divider.
            // Retain the stronger full-height evidence in that case; an expanded
            // search must cross the whitespace into the following field band.
            // Aligned title/address strokes alone are not divider evidence.
            const span=bands[2].end-bands[0].start+1;
            if(fullInk>height*.6||(ink>bottom*.7&&spanInk>span*.85&&longest>span*.8)){cutWidth=Math.max(1,x-2);break;}
        }
        return {w:cutWidth,h:bottom};
    }
    function pixels(region, width, height) {
        const x=Math.floor(region.x * width/1000), y=Math.floor(region.y * height/1000);
        return {x,y,w:Math.max(1,Math.min(width-x,Math.ceil(region.w*width/1000))),
            h:Math.max(1,Math.min(height-y,Math.ceil(region.h*height/1000)))};
    }
    function detailViewPlan(width, height) {
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)return [];
        // A full-width band above 1333 pixels would be reduced by the 2000px
        // limit. Split wide pages into overlapping left/right crops instead.
        const columns=width*1.5<=2000?[[0,1000]]:[[0,550],[450,550]];
        return [0,300,600].flatMap(y=>columns.map(([x,w])=>{
            const region={x,y,w,h:400},crop=pixels(region,width,height);
            const outputWidth=Math.min(2000,Math.round(crop.w*1.5));
            return {region,crop,width:outputWidth,height:Math.max(1,Math.round(crop.h*outputWidth/crop.w))};
        }));
    }
    function enhanceDetailPixels(rgba) {
        const output=new Uint8ClampedArray(rgba),hist=new Uint32Array(256);
        const luminance=i=>Math.round((rgba[i]*299+rgba[i+1]*587+rgba[i+2]*114)/1000);
        let samples=0;
        for(let i=0;i<rgba.length;i+=16){hist[luminance(i)]++;samples++;}
        let count=0,background=255;
        for(let n=0;n<256;n++){count+=hist[n];if(count>=samples*.85){background=n;break;}}
        // Work on a copy for the verifier only. Source pictures/crop coordinates
        // keep their original pixels. A soft tonal curve retains faint strokes;
        // it never thresholds, draws, closes or erases letter shapes.
        if(!samples||background<90||background>235)return output;
        for(let i=0;i<rgba.length;i+=4){
            const lum=luminance(i),target=Math.max(0,Math.min(255,245+(lum-background)*1.65)),shift=target-lum;
            for(let channel=0;channel<3;channel++)output[i+channel]=Math.max(0,Math.min(255,rgba[i+channel]+shift));
        }
        return output;
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
        const number='(?:[0-9०-९]+(?:[./][0-9०-९]+)?[¼½¾]?|[¼½¾])';
        // Explicit units identify marks safely even when OCR places them first or mid-sentence.
        const labelled=s.match(new RegExp('(?:^|\\s)(\\(?'+number+'\\s*(?:marks?|Marks?|MARKS?|अंक|M)\\)?)(?=\\s|$)'));
        if(labelled){const title=(s.slice(0,labelled.index)+s.slice(labelled.index+labelled[0].length)).replace(/\s+/g,' ').trim();if(title)return {title,marks:labelled[1]};}
        const equation='\\(?'+number+'\\s*[x×X*]\\s*'+number+'\\s*=\\s*'+number+'\\s*(?:[mM]|[Mm]arks)?\\)?';
        // A bare parenthesized score is a mark only after an instruction's
        // closing punctuation. Do not reinterpret operands such as f(5).
        const m=s.match(new RegExp('^(.+?)\\s+('+equation+'|'+number+'\\s*(?:[mM]|[Mm]arks))\\s*$')) ||
            s.match(new RegExp('^(.+[.?:।॥])\\s+(\\(\\s*'+number+'\\s*\\))\\s*$'));
        return m ? {title:m[1],marks:m[2]} : null;
    }
    function measuredGrid(region,rows=1) {
        const sourceWidth=region.w*profile.pageWidth/1000;
        const width=Math.min(profile.contentWidth,Math.max(120,Math.round(sourceWidth)));
        const scale=Math.min(1,width/sourceWidth);
        return {width,rowHeight:Math.max(120,Math.round(region.h*profile.pageHeight/1000*scale/Math.max(1,rows)))};
    }
    function tablePlacement(region, figureRegion) {
        if(!region)return null;
        const sourceTableWidth=Math.max(600,Math.round(region.w*profile.pageWidth/1000));
        const tableWidth=Math.min(profile.contentWidth,sourceTableWidth);
        const overlaps=figureRegion&&Math.min(region.y+region.h,figureRegion.y+figureRegion.h)-Math.max(region.y,figureRegion.y)>0;
        const right=figureRegion&&figureRegion.x>=region.x+region.w;
        const left=figureRegion&&figureRegion.x+figureRegion.w<=region.x;
        if(!overlaps||(!right&&!left))return {tableWidth,indent:Math.max(0,Math.min(profile.contentWidth-tableWidth,Math.round(region.x*profile.pageWidth/1000)-profile.margin))};
        const gap=Math.max(120,Math.round((right?figureRegion.x-region.x-region.w:region.x-figureRegion.x-figureRegion.w)*profile.pageWidth/1000));
        const pictureWidth=Math.max(400,Math.round(figureRegion.w*profile.pageWidth/1000));
        const scale=Math.min(1,profile.contentWidth/(sourceTableWidth+gap+pictureWidth));
        return {tableWidth:Math.floor(sourceTableWidth*scale),gap:Math.floor(gap*scale),pictureWidth:Math.floor(pictureWidth*scale),pictureFirst:Boolean(left)};
    }
    function schoolBannerTable(lines,index) {
        const banner=String(lines[index]||'').trim().match(/^\[\[SOURCE_BANNER:\s*([^\]]+)\]\]$/i);
        if(!banner)return null;
        let i=index+1,region=null;
        while(i<lines.length){
            const line=String(lines[i]).trim(),meta=line.match(/^\[\[TABLE_REGION:\s*([^\]]+)\]\]$/i);
            if(meta){region=figure(meta[1]);i++;continue;}
            if(!line||/^\[\[TABLE_(?:WIDTHS|HEADER):/i.test(line)){i++;continue;}
            break;
        }
        const boxed=String(lines[i]||'').trim().match(/^\[\[BOXED:\s*([0-9०-९]{1,4})\s*\]\]$/u);
        if(boxed)return {id:banner[1].trim(),rows:[[boxed[1]]],width:region?Math.min(2600,Math.max(1100,Math.round(region.w*profile.pageWidth/1000))):1100,nextIndex:i+1};
        const rows=[];
        while(i<lines.length){
            const row=String(lines[i]).trim().match(/^\[\[TABLE_ROW:\s*([^|\]]+)\]\]$/i);
            if(!row)break;
            rows.push([row[1].trim()]);i++;
        }
        if(rows.length!==2||!/^(?:total\s+)?marks\s*:?$|^(?:कुल\s+)?अंक\s*:?$/i.test(rows[0][0])||!/^\d+(?:\s*(?:M|marks|अंक))?$/i.test(rows[1][0]))return null;
        const width=region?Math.round(region.w*profile.pageWidth/1000):Math.max(...rows.map(row=>row[0].length))*140;
        return {id:banner[1].trim(),rows,width:Math.min(2600,Math.max(1100,width)),nextIndex:i};
    }
    function shape(value) {
        const [name, flag='box']=String(value||'').split('|').map(x=>x.trim());
        return {name, answer:flag==='box', line:flag==='line'};
    }
    function pdfTextReliable(value) {
        const text=String(value||'');
        // Legacy symbol/Indic fonts can expose private glyph codes or broken matra order.
        // Read those pixels with OCR; never guess a character substitution here.
        if(/[\uE000-\uF8FF\uFFFD]/u.test(text))return false;
        if(/[\u0900-\u0D7F]/u.test(text)&&/[\u0100-\u017F]/u.test(text))return false;
        if(/(?:^|\s)[\u093E-\u094C\u0C3E-\u0C4C]/u.test(text))return false;
        return true;
    }
    function orderPages(text) {
        // Sort only within one paper and only when every page has a unique
        // explicitly printed page number. Missing/duplicate labels never guess order.
        return String(text||'').split(/(\[\[PAPER_BREAK\]\])/i).map(paper=>{
            if(/^\[\[PAPER_BREAK\]\]$/i.test(paper))return paper;
            const pages=paper.split(/\[\[PAGE_BREAK\]\]/i).map((body,index)=>{
                const labels=[...body.matchAll(/\[\[SOURCE_PAGE:\s*([1-9][0-9]{0,2})\s*\]\]/gi)];
                return {body:body.replace(/\[\[SOURCE_PAGE:\s*[1-9][0-9]{0,2}\s*\]\]/gi,'').trim(),number:labels.length===1?+labels[0][1]:null,index};
            }).filter(page=>page.body);
            if(pages.length>1&&pages.every(p=>p.number)&&new Set(pages.map(p=>p.number)).size===pages.length)pages.sort((a,b)=>a.number-b.number);
            else if(pages.length>1){
                const headerPages=pages.filter(page=>{
                    const first=page.body.match(/(?:^|\n)\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW|MATCH_ROW|TABLE_ROW):\s*)?(I)[.)\s]+\S/i);
                    if(!first)return false;
                    const prefix=page.body.slice(0,first.index);
                    return /\[\[(?:SOURCE_BANNER|BANNER):/i.test(prefix)||(/class\s*[:.\-]|कक्षा/i.test(prefix)&&/exam(?:ination)?s?|assessment|परीक्षा/i.test(prefix));
                });
                const known=pages.filter(page=>page.number).map(page=>page.number);
                // A unique exam header followed by section I identifies its
                // first page; continuation pages never obtain invented numbers.
                if(headerPages.length===1&&new Set(known).size===known.length){const header=headerPages[0];pages.splice(pages.indexOf(header),1);pages.unshift(header);}
            }

            return pages.map(p=>p.body).join('\n[[PAGE_BREAK]]\n');
        }).join('\n');
    }
    function compactPages(text, keepSourcePages=false) {
        text=orderPages(text);
        const lines=String(text||'').split('\n');
        return lines.filter((line,i)=>{
            if(!/^\s*\[\[PAGE_BREAK\]\]\s*$/i.test(line))return true;
            if(keepSourcePages)return true;
            // New papers remain separate; a scan boundary within one paper reflows.
            const following=lines.slice(i+1).filter(x=>x.trim()).slice(0,5);
            const boundary=following.findIndex(x=>/^\s*(?:\[\[(?:PAPER_BREAK|PAGE_BREAK|SECTION_ROW|QUESTION_ROW)\b|\d+[.)]\s|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s)/i.test(x));
            const next=(boundary<0?following:following.slice(0,boundary)).join('\n');
            return /(?:class\s*[:.\-]?\s*(?:[IVX]+|[1-9]|UKG|LKG)\b|(?:annual|entrance)\s+examination|summative\s+assessment|formative\s+assessment|कक्षा\s*[:.\-]?\s*\S)/i.test(next);
        }).join('\n');
    }
    function questionAnswer(value) {
        // A terminal empty answer bracket is layout, not part of question prose.
        // Require a numbered question and a clear gap; keep meaningful parentheses.
        const m=String(value||'').match(/^\s*(\d+[.)]\s+.+?)\s{2,}\(\s+\)\s*$/);
        return m ? {question:m[1].replace(/[ \t]{2,}/g,' '),answer:'(        )'} : null;
    }
    function emptyGrids(image) {
        // Follow physical borders, including curved photographed paper.
        // Populated cells and incomplete boundaries remain with recognition.
        const {width:w,height:h,data}=image;
        if(w>1000||h>2000) return [];
        const dark=new Uint8Array(w*h), expanded=new Uint8Array(w*h);
        // Local background compensation handles photographed grey paper and shadows.
        const stride=w+1,integral=new Float64Array((w+1)*(h+1));
        for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){
            const i=(y*w+x)*4;row+=Math.max(data[i],data[i+1],data[i+2]);
            integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
        }}
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const left=Math.max(0,x-15),right=Math.min(w,x+16),top=Math.max(0,y-15),bottom=Math.min(h,y+16);
            const mean=(integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left])/((right-left)*(bottom-top));
            const i=y*w+x;dark[i]=Math.max(data[4*i],data[4*i+1],data[4*i+2])<mean-12?1:0;
        }
        for(let y=0;y<h;y++)for(let x=1;x<w-1;x++) {
            const i=y*w+x;expanded[i]=dark[i-1]|dark[i]|dark[i+1];
        }
        const segments=[];
        for(let x=15;x<w-15;x++) {
            let start=-1,last=-1,count=0;
            const finish=()=>{if(start>=0&&last-start>=20&&count/(last-start+1)>=.7)segments.push({x,y:start,z:last});};
            for(let y=0;y<h;y++)if(expanded[y*w+x]) {
                if(start<0||y-last>6){finish();start=y;count=0;}
                last=y;count++;
            }
            finish();
        }
        const lines=[];
        for(const s of segments){
            const same=lines.find(g=>Math.abs(g.x-s.x)<=4&&Math.min(g.z,s.z)-Math.max(g.y,s.y)>.5*Math.min(g.z-g.y,s.z-s.y));
            if(same){same.x=(same.x*same.n+s.x)/(same.n+1);same.n++;same.y=Math.min(same.y,s.y);same.z=Math.max(same.z,s.z);}
            else lines.push({...s,n:1});
        }
        const groups=[];
        for(const line of lines){
            const same=groups.find(g=>Math.abs(g.y-line.y)<35&&Math.abs(g.z-line.z)<35);
            if(same){same.lines.push(line);const n=same.lines.length;same.y=(same.y*(n-1)+line.y)/n;same.z=(same.z*(n-1)+line.z)/n;}
            else groups.push({y:line.y,z:line.z,lines:[line]});
        }
        const results=[];
        for(const g of groups){
            const ls=g.lines.sort((a,b)=>a.x-b.x);
            // Page-edge strokes can share the grid's vertical range. Remove an
            // uneven outer gap only when both horizontal borders do not connect it.
            const initialGaps=ls.slice(1).map((p,i)=>p.x-ls[i].x).sort((a,b)=>a-b);
            const typical=initialGaps[Math.floor(initialGaps.length/2)];
            const connects=(left,right)=>['y','z'].every(end=>{
                let ink=0,total=0;
                for(let x=Math.ceil(left.x)+4;x<right.x-4;x++){
                    const t=(x-left.x)/(right.x-left.x),yy=Math.round(left[end]*(1-t)+right[end]*t);
                    let hit=0;for(let dy=-8;dy<=8;dy++)if(yy+dy>=0&&yy+dy<h)hit|=dark[(yy+dy)*w+x];
                    ink+=hit;total++;
                }
                return total&&ink/total>.65;
            });
            if(ls.length>5&&ls[ls.length-1].x-ls[ls.length-2].x>typical*1.4&&!connects(ls[ls.length-2],ls[ls.length-1]))ls.pop();
            if(ls.length>5&&ls[1].x-ls[0].x>typical*1.4&&!connects(ls[0],ls[1]))ls.shift();
            const n=ls.length;
            if(n<3||n>53||g.z-g.y>Math.min(700,h*.8))continue;
            const gaps=ls.slice(1).map((p,i)=>p.x-ls[i].x).sort((a,b)=>a-b),median=gaps[Math.floor(gaps.length/2)];
            if(median<10||median>100||gaps.some(x=>x<median*.65||x>median*1.55))continue;
            // A true border connects adjacent vertical divisions near both ends.
            let closed=0;
            for(let i=0;i<n-1;i++)for(const end of ['y','z']){
                let ink=0, total=0;
                for(let x=Math.round(ls[i].x)+4;x<ls[i+1].x-4;x++){
                    const t=(x-ls[i].x)/(ls[i+1].x-ls[i].x),yy=Math.round(ls[i][end]*(1-t)+ls[i+1][end]*t);
                    let hit=0;for(let dy=-8;dy<=8;dy++)if(yy+dy>=0&&yy+dy<h)hit|=dark[(yy+dy)*w+x];
                    ink+=hit;total++;
                }
                if(total&&ink/total>.65)closed++;
            }
            if(closed/(2*(n-1))<.8)continue;
            // Find physical horizontal divisions. Notebook ruling and filled
            // cells remain excluded by per-cell ink checks below.
            const leftEdge=ls[0],rightEdge=ls[n-1],horizontal=[];
            for(let yy=Math.ceil(g.y);yy<=Math.floor(g.z);yy++){
                let ink=0,total=0;
                for(let xx=Math.ceil(leftEdge.x)+4;xx<rightEdge.x-4;xx++){
                    const index=Math.max(0,Math.min(ls.length-2,ls.findIndex(p=>p.x>=xx)-1));
                    const left=ls[index],right=ls[index+1],t=(xx-left.x)/(right.x-left.x);
                    const row=Math.round(yy+(left.y-g.y)*(1-t)+(right.y-g.y)*t);
                    let hit=0;for(let dy=-2;dy<=2;dy++)if(row+dy>=0&&row+dy<h)hit|=dark[(row+dy)*w+xx];
                    ink+=hit;total++;
                }
                if(total&&ink/total>.8){
                    const previous=horizontal[horizontal.length-1];
                    if(previous&&yy-previous.last<=5){previous.last=yy;previous.y=(previous.first+yy)/2;}
                    else horizontal.push({first:yy,last:yy,y:yy});
                }
            }
            const rowEdges=horizontal.map(r=>r.y);
            if(rowEdges.length<2||rowEdges.length>33)continue;
            const rowGaps=rowEdges.slice(1).map((y,i)=>y-rowEdges[i]);
            const rowMedian=[...rowGaps].sort((a,b)=>a-b)[Math.floor(rowGaps.length/2)];
            if(rowMedian<15||rowGaps.some(gap=>gap<rowMedian*.6||gap>rowMedian*1.6))continue;
            // A detected subset of a faint grid is not its physical cell count.
            // Reject it when both outer horizontal rules continue past the
            // measured end; leave the uncertain count to visual recognition.
            const continues=side=>{
                const index=side<0?0:ls.length-2,left=ls[index],right=ls[index+1];
                const edge=side<0?left:right;
                return [rowEdges[0],rowEdges[rowEdges.length-1]].every(yy=>{
                    let ink=0,total=0;
                    for(let d=Math.ceil(median*.25);d<median*.8;d++){
                        const x=Math.round(edge.x+side*d);if(x<0||x>=w)continue;
                        const t=(x-left.x)/(right.x-left.x),row=Math.round(yy+(left.y-g.y)*(1-t)+(right.y-g.y)*t);
                        let hit=0;for(let dy=-3;dy<=3;dy++)if(row+dy>=0&&row+dy<h)hit|=dark[(row+dy)*w+x];
                        ink+=hit;total++;
                    }
                    return total>5&&ink/total>.7;
                });
            };
            if(continues(-1)||continues(1))continue;
            let populated=false;
            for(let i=0;i<n-1;i++)for(let r=0;r<rowEdges.length-1;r++){
                let ink=0,total=0;
                const left=ls[i],right=ls[i+1],padding=Math.max(5,Math.round((right.x-left.x)*.15));
                for(let x=Math.ceil(left.x)+padding;x<right.x-padding;x++){
                    const t=(x-left.x)/(right.x-left.x),shift=(left.y-g.y)*(1-t)+(right.y-g.y)*t;
                    const top=Math.round(rowEdges[r]+shift)+6,bottom=Math.round(rowEdges[r+1]+shift)-6;
                    for(let y=top;y<bottom;y++){if(y>=0&&y<h){ink+=dark[y*w+x]||0;total++;}}
                }
                if(total&&ink/total>.025){populated=true;break;}
            }
            if(populated)continue;
            const x=ls[0].x,z=ls[n-1].x;
            const y=Math.min(...ls.map(p=>p.y)),bottom=Math.max(...ls.map(p=>p.z));
            results.push({columns:n-1,rows:rowEdges.length-1,x:Math.round(x/w*1000),y:Math.round(y/h*1000),w:Math.round((z-x)/w*1000),h:Math.round((rowEdges[rowEdges.length-1]-rowEdges[0]+3)/h*1000)});
        }
        return results.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,12);
    }
    function mergeGridEvidence(samples=[]) {
        const groups=[];
        for(let sample=0;sample<samples.length;sample++)for(const grid of samples[sample]||[]){
            const area=grid.w*grid.h;if(!area)continue;
            const same=groups.find(group=>{const r=group[0].grid;
                const overlap=Math.max(0,Math.min(r.x+r.w,grid.x+grid.w)-Math.max(r.x,grid.x))*Math.max(0,Math.min(r.y+r.h,grid.y+grid.h)-Math.max(r.y,grid.y));
                return overlap/Math.min(area,r.w*r.h)>.55&&Math.abs(r.y+r.h/2-grid.y-grid.h/2)<Math.max(r.h,grid.h)*.6;
            });
            if(same)same.push({grid,sample});else groups.push([{grid,sample}]);
        }
        return groups.flatMap(group=>{
            const variants=new Map();for(const entry of group){const key=entry.grid.columns+'x'+entry.grid.rows;if(!variants.has(key))variants.set(key,[]);variants.get(key).push(entry);}
            const ranked=[...variants.values()].sort((a,b)=>new Set(b.map(e=>e.sample)).size-new Set(a.map(e=>e.sample)).size);
            const votes=entries=>new Set(entries.map(e=>e.sample)).size;
            if(ranked.length>1&&votes(ranked[0])===votes(ranked[1]))return [];
            const best=ranked[0],result={...best[0].grid};for(const key of ['x','y','w','h'])result[key]=Math.round([...best].map(e=>e.grid[key]).sort((a,b)=>a-b)[Math.floor(best.length/2)]);
            return [result];
        }).sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,12);
    }
    function inlineParts(value) {
        const text=String(value||''),parts=[];let cursor=0,last=0;
        while(cursor<text.length){
            const start=text.indexOf('[[',cursor);if(start<0)break;
            let depth=1,end=start+2;
            while(end<text.length&&depth){
                if(text.slice(end,end+2)==='[['){depth++;end+=2;}
                else if(text.slice(end,end+2)===']]'){depth--;end+=2;}
                else end++;
            }
            if(depth)break;
            parts.push(text.slice(last,start),text.slice(start,end));last=end;cursor=end;
        }
        parts.push(text.slice(last));return parts.filter(Boolean);
    }
    function canonicalPaperRow(kind,body) {
        if(!/^(?:SECTION_ROW|QUESTION_ROW|MATCH_ROW)$/.test(kind))return '[['+kind+': '+body+']]';
        const cells=[];let depth=0,start=0;
        for(let i=0;i<body.length;i++){
            if(body.slice(i,i+2)==='[['){depth++;i++;}
            else if(body.slice(i,i+2)===']]'){depth--;i++;}
            else if(!depth&&body.slice(i,i+2)==='||'){cells.push(body.slice(start,i).trim());start=i+2;i++;}
        }
        cells.push(body.slice(start).trim());
        if(kind==='MATCH_ROW'){
            if(cells.length>1&&/^none$/i.test(cells[cells.length-1])&&cells.slice(0,-1).some(cell=>/_{2,}|\[\[(?:GRID|ANSWER_LINES):/i.test(cell)))cells[cells.length-1]='';
            return '[['+kind+': '+cells.join(' || ')+']]';
        }
        while(cells.length>1&&/^(?:none|null)?$/i.test(cells[cells.length-1]))cells.pop();
        if(cells.length===1)return cells[0];
        const n='(?:[0-9०-९]+(?:[./][0-9०-९]+)?[¼½¾]?|[¼½¾])';
        const mark=new RegExp('^\\(?'+n+'(?:\\s*[x×X*]\\s*'+n+'\\s*=\\s*'+n+'\\s*(?:M|[Mm]arks?)?|\\s*(?:M|[Mm]arks?|अंक))?\\)?$');
        const last=cells[cells.length-1];
        if(mark.test(last))return '[['+kind+': '+cells.slice(0,-1).join(' ')+' || '+last+']]';
        // A question row with no actual score is ordinary question text.
        // Geometry flags are not printable marks or new question content.
        return cells.join(' ');
    }

    function cleanQuestionPaper(value, depth=0) {
    if(depth>16)return '';
    const text=String(value||'').replace(/(?:\\_){2,}/g,run=>run.replace(/\\/g,''));let out='',cursor=0;
    while(cursor<text.length){
        const start=text.indexOf('[[',cursor);if(start<0){out+=text.slice(cursor);break;}
        out+=text.slice(cursor,start);let end=start+2,level=1;
        while(end<text.length&&level){if(text.slice(end,end+2)==='[['){level++;end+=2;}else if(text.slice(end,end+2)===']]'){level--;end+=2;}else end++;}
        if(level){out+=text.slice(start);break;}
        const token=text.slice(start,end),m=token.match(/^\[\[([A-Z_-]+):\s*([\s\S]*)\]\]$/i);
        if(!m){const boxed=token.match(/^\[\[\s*([0-9०-९]+)\s*\]\]$/u);out+=boxed?'[[BOXED: '+boxed[1]+']]':token;}
        else {const name=m[1].toUpperCase(),body=m[2];
            if(/^(?:STRIKE|DOUBLE-STRIKE|ANSWER|SOLUTION|ANSWER_KEY|MARGIN|STAMP)$/.test(name)){}
            else if(name==='REPLACE'){const pieces=body.split(/\s*(?:->|→|=>|\|\|)\s*/);out+=pieces.length>1?cleanQuestionPaper(pieces.slice(1).join(' '),depth+1):'';}
            else if(/^(?:INSERT|HIGHLIGHT)$/.test(name))out+=cleanQuestionPaper(body,depth+1);
            else {let content=cleanQuestionPaper(body,depth+1);if(/^(?:SECTION_ROW|QUESTION_ROW|TABLE_ROW|GRID_ROW|MATCH_ROW|CHOICE_ROW|OPTION_ROW|ARITHMETIC_ROW)$/.test(name))content=content.replace(/(?<!\|)\s+\|\s+(?!\|)/g,' || ');out+=canonicalPaperRow(name,content);}
        }
        cursor=end;
    }
    return depth===0?out.replace(/^(?:\s*)(?:Ans(?:wer)?|Solution|उत्तर|जवाब)\s*[:：]\s*[^\n]+$/gim,'____________________'):out;
}

    function unwrapEmphasis(value,depth=0) {
        value=cleanQuestionPaper(value);
        if(depth>8)return String(value||'');
        return inlineParts(value).map(part=>{
            const m=part.match(/^\[\[(UNDERLINE|DOUBLE-UNDERLINE|STRIKE|DOUBLE-STRIKE|INSERT|REPLACE|HIGHLIGHT|BOXED):\s*([\s\S]*)\]\]$/i);
            return m?unwrapEmphasis(m[2],depth+1):part;
        }).join('');
    }
    function pipeTableRows(value) {
        const lines=String(value||'').split('\n'),out=[];
        const cells=line=>{
            const raw=String(line||'').trim();
            if(!/^\|.*\|$/.test(raw)||raw.includes('[['))return null;
            const body=raw.slice(1,-1);
            const parts=body.split(body.includes('||')&&/\S/.test(body.replace(/\|/g,''))?/\s*\|\|\s*/:/\s*\|\s*/).map(cell=>cell.trim());
            return parts.length>=2&&parts.length<=52&&!parts.some(cell=>cell.includes('|'))?parts:null;
        };
        const divider=row=>row&&row.every(cell=>/^:?-{3,}:?$/.test(cell));
        for(let i=0;i<lines.length;i++){
            const row=cells(lines[i]),next=cells(lines[i+1]);
            if(row&&next&&row.length===next.length&&divider(next)){
                out.push('[[TABLE_ROW: '+row.join(' || ')+']]');i++;
                while(i+1<lines.length){
                    const following=cells(lines[i+1]);
                    if(!following||following.length!==row.length||divider(following))break;
                    out.push('[[TABLE_ROW: '+following.join(' || ')+']]');i++;
                }
                continue;
            }
            if(row&&row.every(cell=>!cell)){
                let rows=1;
                while(i+1<lines.length&&rows<32&&(rows+1)*row.length<=600){
                    const following=cells(lines[i+1]);
                    if(!following||following.length!==row.length||following.some(Boolean))break;
                    rows++;i++;
                }
                out.push('[[GRID: '+row.length+'x'+rows+']]');continue;
            }
            // A standalone Indic letter strip following an alphabet instruction
            // represents visible cells, not mathematical absolute-value bars.
            const previous=out.slice().reverse().find(line=>line.trim())||'';
            if(row&&row.length>=4&&/वर्णमाला/.test(previous)&&row.every(cell=>/^[\p{L}\p{M}]{1,4}$/u.test(cell))){
                out.push('[[GRID_ROW: '+row.join(' || ')+']]');continue;
            }
            out.push(lines[i]);
        }
        return out.join('\n');
    }
    function nativePipeRows(value) {
        let questionsStarted=false,previousHeaderCount=0;
        return String(value||'').split('\n').map(line=>{
            if(/^\s*\[\[PAPER_BREAK\]\]\s*$/i.test(line))questionsStarted=false;
            if(/^\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW):|[0-9०-९]+[.)]\s|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)(?:[.)]?\s|[.)]?$))/i.test(line))questionsStarted=true;
            if(!line.includes('[[')&&line.includes('||')){
                const questions=line.split(/\s*\|\|\s*/).map(cell=>cell.trim());
                if(questions.length>=2&&questions.length<=4&&questions.every(cell=>cell.length<=300&&/^[0-9०-९]+(?:[.)।]\s*|\s+)\S[\s\S]*(?:_{2,}|\(\s*\))\s*$/u.test(cell))){questionsStarted=true;previousHeaderCount=0;return '[[MATCH_ROW: '+questions.join(' || ')+']]';}
            }
            const wrapped=line.match(/^\s*\[\[TABLE_ROW:\s*([\s\S]*)\]\]\s*$/i),fields=wrapped?wrapped[1]:line;
            if(questionsStarted||fields.includes('[[')||(!wrapped&&!fields.includes('||'))||!/^\s*(?:class\s*:|subject\s*:|time\s*:|name\b[^|]{0,50}:|roll\b[^|]{0,15}:|invigilator\b|(?:total\s+)?marks\b)/i.test(fields)){previousHeaderCount=0;return line;}
            const cells=fields.split(/\s*\|\|\s*/).map(cell=>cell.trim());
            if(cells.length<(wrapped?1:2)||cells.length>8||cells.some(cell=>cell.length>300)){previousHeaderCount=0;return line;}
            const separate=previousHeaderCount&&previousHeaderCount!==cells.length;previousHeaderCount=cells.length;
            return (separate?'\n':'')+'[[TABLE_ROW: '+cells.join(' || ')+']]';
        }).join('\n');
    }
    function normalise(text) {
        text=nativePipeRows(pipeTableRows(cleanQuestionPaper(text)));
        text=text.replace(/\[\[GRID:\s*(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:\|\s*(?:\|\s*)?(?:none|box))?\s*\]\](?:[ \t]+(?:none|box)(?=[ \t]*(?:\n|$)))?/gi,(_,columns,rows)=>'[[GRID: '+columns+'x'+rows+']]');
        const types='SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION|SOURCE_PAGE';
        const bare=new RegExp('^\\s*('+types+'):\\s*(.*?)\\s*$','i');
        text=String(text||'').replace(/\[\[TABLE_ROW:\s*(\[\[(?:FIGURE|SOURCE_FIGURE)_ROW:[\s\S]*?\]\])\s*((?:\|\|\s*_?\s*)*)\]\]/gi,'$1');
        text=text.replace(/\[\[REPLACE:\s*([^\[\]]*?)\s*\|\|\s*([^\[\]]*?)\]\]/gi,(_,oldText,newText)=>'[[REPLACE: '+oldText.trim()+' -> '+newText.trim()+']]');
        // Recognition may wrap a marker across lines, including a nested correction.
        // Rejoin only while double-bracket depth is open; ordinary question lines stay separate.
        const joined=[];let depth=0;
        for(const line of text.split('\n')){
            if(depth>0&&joined.length)joined[joined.length-1]+=' '+line.trim();
            else joined.push(line);
            depth=Math.max(0,depth+(line.match(/\[\[/g)||[]).length-(line.match(/\]\]/g)||[]).length);
        }
        const lines=joined.flatMap(line=>{
            const bareMarker=line.match(bare);
            if(bareMarker)line='[['+bareMarker[1].toUpperCase()+': '+bareMarker[2].replace(/\]\]$/,'')+']]';
            const output=[];let prose='';
            for(const part of inlineParts(line)){
                const marker=part.match(/^\[\[(SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|GRID|FIGURE_ROW|TABLE_REGION|TABLE_WIDTHS|TABLE_HEADER|SOURCE_PAGE):\s*([\s\S]*)\]\]$/i);
                if(!marker){prose+=part;continue;}
                // A repeated prose title plus its structured row is one heading.
                const title=/^(?:SECTION_ROW|QUESTION_ROW)$/i.test(marker[1])?marker[2].split('||')[0]:null;
                const compact=value=>unwrapEmphasis(value).replace(/\s+/g,'').trim();
                if(prose.trim()&&!(title&&compact(prose)===compact(title)))output.push(prose);
                prose='';output.push(part);
            }
            if(prose.trim())output.push(prose);
            return output.length?output:[''];
        });
        // Providers occasionally return a Markdown header table even though
        // the question-paper protocol requests native rows. Convert a real
        // multi-row table without printing its decorative pipes/separators.
        const pipeCells=line=>{
            const m=String(line).match(/^\s*\|\s+(.+?)\s+\|\s*$/);
            return m?m[1].split(/\s*\|{1,2}\s*/).map(cell=>cell.trim()):null;
        };
        for(let i=0;i<lines.length;i++){
            const first=pipeCells(lines[i]);if(!first||first.length<2)continue;
            let j=i+1;while(j<lines.length&&pipeCells(lines[j])?.length===first.length)j++;
            if(j-i<2)continue;
            for(let k=i;k<j;k++){
                const cells=pipeCells(lines[k]);
                lines[k]=cells.every(cell=>/^:?-{3,}:?$/.test(cell))?'':'[[TABLE_ROW: '+cells.join(' || ')+']]';
            }
            i=j-1;
        }
        // Detached roman labels and their following instruction are one heading.
        for(let i=0;i<lines.length-1;i++){
            const label=lines[i].trim();if(!/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]?$/.test(label))continue;
            let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
            const row=(lines[j]||'').match(/^\s*\[\[(?:SECTION_ROW|QUESTION_ROW):\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i);
            if(!row||/^[0-9०-९]+[.)]/u.test(row[1]))continue;
            const numeral=label.replace(/[.)]$/,'');
            const existing=row[1].match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)\s]+/);
            if(existing&&existing[1]!==numeral)continue;
            lines[j]='[[SECTION_ROW: '+(existing?'':label+' ')+row[1].trim()+' || '+row[2].trim()+']]';lines[i]='';
        }
        for(let i=0;i<lines.length;i++){
            const separated=lines[i].match(/^\s*((?:(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)\s]+|[0-9०-९]+[.)।]\s*)[^|]+?)\s*\|\|\s*([^|]+)\s*$/);
            if(separated){
                const score=section(separated[1].trim()+' '+separated[2].trim());
                if(score&&score.marks.replace(/\s/g,'')===separated[2].replace(/\s/g,''))lines[i]='[['+(/^[0-9०-९]/.test(separated[1].trim())?'QUESTION_ROW':'SECTION_ROW')+': '+separated[1].trim()+' || '+separated[2].trim()+']]';
            }
            if(/^\s*\[\[QUESTION_ROW:\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)\s]+\S/.test(lines[i]))lines[i]=lines[i].replace('QUESTION_ROW:','SECTION_ROW:');
            const marker=lines[i].match(/^\s*\[\[SECTION_ROW:\s*([^|]*?)\]\]\s*$/i);
            const split=marker&&section(marker[1]);
            if(split)lines[i]='[[SECTION_ROW: '+split.title+' || '+split.marks+']]';
            else if(marker)lines[i]=marker[1].trim();
            if(!/^\s*\[\[/.test(lines[i])){
                const mark=section(lines[i]);
                if(mark&&/^\s*[0-9०-९]+[.)।]\s*/u.test(mark.title))
                    lines[i]='[[QUESTION_ROW: '+mark.title+' || '+mark.marks+']]';
            }
            const question=lines[i].match(/^\s*\[\[QUESTION_ROW:\s*([^|]*?)\]\]\s*$/i);
            if(question)lines[i]=question[1].trim();
        }
        for(let i=0;i<lines.length;i++)if(/^\s*\(?Note:.*FIGURE_ROW.*conceptual representation/i.test(lines[i])){
            lines[i]='';
            if(i&&/^\s*\[\[FIGURE_ROW:/.test(lines[i-1]))lines[i-1]='';
        }
        let matching=false;
        for(let i=0;i<lines.length;i++){
            if(/^\s*(?:\[\[SECTION_ROW:\s*)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[. )\s]+\S/.test(lines[i]))
                matching=/match(?:ing| the following)|जोड़ी|मिलान|शब्द.*शब्द.*जोड़[ोिी]/i.test(lines[i]);
            if(!matching||/^\s*\[\[/.test(lines[i]))continue;
            const pipeCells=lines[i].split(/\s*\|\|\s*|\s+\|\s+/);
            if(pipeCells.length>1&&pipeCells.length<=32&&pipeCells.every(x=>x.trim())){
                lines[i]='[[MATCH_ROW: '+pipeCells.map(x=>x.trim()).join(' || ')+']]';continue;
            }
            const pair=lines[i].match(/^(\s*\d+[.)]?\s+[A-Za-z]\s*[-–]?)\s+([A-Za-z])\s*$/)||
                lines[i].match(/^(\s*\d+[.)]?\s+[A-Za-z][A-Za-z ]*?)\s+(\d+)\s*$/)||
                lines[i].match(/^(.+?)\s{3,}(\S.*?)\s*$/);
            if(pair)lines[i]='[[MATCH_ROW: '+pair[1].trim()+' || '+pair[2].trim()+']]';
        }
        return lines.map(line=>line.trimEnd()).join('\n');
    }
    function overlap(a,b) {
        const area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*
            Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        return area/Math.max(1,a.w*a.h+b.w*b.h-area);
    }
    function deduplicateFigures(text) {
        const inline=[];
        for(const line of String(text).split('\n')){
            if(/^\s*\[\[FIGURE(?:_ROW)?:/.test(line))continue;
            for(const m of line.matchAll(/\[\[FIGURE:\s*([\s\S]*?)\]\]/gi)){
                const r=figure(m[1]);if(r)inline.push(r);
            }
        }
        return String(text).replace(/\[\[FIGURE_ROW:\s*([\s\S]*?)\]\]/gi,(_,body)=>{
            const all=body.split(/\s*\|\|\s*/);
            // An impossible detached row must not duplicate an already complete
            // set of pictures attached to their individual questions.
            if(all.some(x=>!figure(x))&&inline.length>=all.length)return '';
            const cells=all.filter(spec=>{
                const region=figure(spec);
                return !region||!inline.some(r=>overlap(r,region)>.75);
            });
            return cells.length ? '[[FIGURE_ROW: '+cells.join(' || ')+']]' : '';
        });
    }
    function figureRows(regions) {
        const rows=[];
        for(const r of regions){
            const row=rows.find(items=>items.some(p=>Number.isFinite(p.y)&&Number.isFinite(r.y)&&
                Math.min(p.y+p.h,r.y+r.h)-Math.max(p.y,r.y)>.5*Math.min(p.h,r.h)));
            if(row)row.push(r);else rows.push([r]);
        }
        rows.sort((a,b)=>(a[0].y||0)-(b[0].y||0));
        for(const row of rows)row.sort((a,b)=>(a.x||0)-(b.x||0));
        return rows;
    }
    function alignLeadingGridLabels(text,observedCount=0) {
        const lines=String(text||'').split('\n'),pairs=[],prefix=[];let i=0;
        while(i<lines.length&&(!lines[i].trim()||/^\s*\[\[SOURCE_PAGE:/.test(lines[i]))){prefix.push(lines[i]);i++;}
        while(i<lines.length){
            const blockStart=i,block=[];
            while(i<lines.length&&(!lines[i].trim()||/^\s*\[\[(?:TABLE_REGION|TABLE_WIDTHS|TABLE_HEADER):/i.test(lines[i])))block.push(lines[i++]);
            if(!/^\s*\[\[GRID:\s*\d+[x×]1\]\]\s*$/i.test(lines[i]||'')){i=blockStart;break;}
            block.push(lines[i++]);while(i<lines.length&&!lines[i].trim())block.push(lines[i++]);
            const label=lines[i]||'';
            if(!/^\s*[0-9०-९]+[.)]?\s+[^|\n]{1,32}[:：]\s*[-‐‑‒–—―]?\s*$/u.test(label))return text;
            pairs.push({block,label});i++;
        }
        if(pairs.length<2||pairs.length!==observedCount)return text;
        const rest=lines.slice(i);
        if(rest.some(line=>line.trim())&&!/^\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW):|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)\s]+\S)/i.test(rest.find(line=>line.trim())))return text;
        return [...prefix,...pairs.flatMap(pair=>[pair.label,...pair.block]),...rest].join('\n');
    }
    function reconcileEmptyGrids(text,grids=[]) {
        if(!grids.length)return text;
        const lines=normalise(text).split('\n'), blocks=[];
        let block=null;
        for(let i=0;i<lines.length;i++){
            const cells=lines[i].match(/^\s*\[\[(?:GRID_ROW|TABLE_ROW):\s*([\s\S]*)\]\]\s*$/i);
            const empty=/^\s*\[\[GRID:\s*\d+[x×]\d+\]\]\s*$/i.test(lines[i])||
                Boolean(cells&&/^(?:_|\s|\|)*$/.test(cells[1].replace(/\[unclear(?::[^\]\n]{0,80})?\]?/gi,'')));
            if(empty){if(!block){block={indexes:[]};blocks.push(block);}block.indexes.push(i);}
            else if(lines[i].trim()&&!/^\s*\[\[(?:TABLE_REGION|TABLE_WIDTHS|TABLE_HEADER):/i.test(lines[i]))block=null;
        }
        const candidates=blocks.filter(b=>b.indexes.length);
        // Only reconcile when every observed source grid has one empty marker group.
        // Preserve populated grids and ambiguous mappings rather than deleting data.
        if(candidates.length!==grids.length)return text;
        for(let n=0;n<candidates.length;n++){
            const indexes=candidates[n].indexes;
            const grid=grids[n],region=figure([grid.x,grid.y,grid.w,grid.h].join(','));
            let previous=indexes[0]-1;while(previous>=0&&!lines[previous].trim())previous--;
            if(region&&previous>=0&&/^\s*\[\[TABLE_REGION:/i.test(lines[previous]))lines[previous]='';
            lines[indexes[0]]=(region?'[[TABLE_REGION: '+[grid.x,grid.y,grid.w,grid.h].join(',')+']]\n':'')+'[[GRID: '+grid.columns+'x'+grid.rows+']]';
            for(const i of indexes.slice(1))lines[i]='';
            for(let i=indexes[0]+1;i<indexes[indexes.length-1];i++)if(/^\s*\[\[(?:TABLE_REGION|TABLE_WIDTHS|TABLE_HEADER):/i.test(lines[i]))lines[i]='';
        }
        return alignLeadingGridLabels(lines.join('\n'),grids.length);
    }
    return {profile,referenceFormats,automaticFormat,measuredGrid,tablePlacement,schoolBannerTable,figure,bannerRegion,bannerInkBounds,pixels,detailViewPlan,enhanceDetailPixels,source,fit,tableWidths,section,shape,pdfTextReliable,compactPages,orderPages,questionAnswer,emptyGrids,mergeGridEvidence,normalise,nativePipeRows,cleanQuestionPaper,inlineParts,unwrapEmphasis,deduplicateFigures,figureRows,alignLeadingGridLabels,reconcileEmptyGrids};
});
