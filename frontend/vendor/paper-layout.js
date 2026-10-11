/* Shared, deterministic layout helpers. No document text is corrected here. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PaperAILayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
    const profile = Object.freeze({
        version: 5, pageWidth: 11906, pageHeight: 16838, margin: 720,
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
        const number='(?:[0-9०-९]+(?:[./][0-9०-९]+)?[¼½¾]?|[¼½¾])';
        const equation='\\(?'+number+'\\s*[x×X*]\\s*'+number+'\\s*=\\s*'+number+'\\s*(?:[mM]|[Mm]arks)?\\)?';
        const m=s.match(new RegExp('^(.+?)\\s+('+equation+'|'+number+'\\s*(?:[mM]|[Mm]arks))\\s*$'));
        return m ? {title:m[1],marks:m[2]} : null;
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
    function compactPages(text, keepSourcePages=false) {
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
        // Conservative border check for small, empty, one-row handwriting grids.
        // Larger tables, populated grids and incomplete boundaries are left to OCR.
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
            const finish=()=>{if(start>=0&&last-start>=28&&count/(last-start+1)>=.7)segments.push({x,y:start,z:last});};
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
            const ls=g.lines.sort((a,b)=>a.x-b.x), n=ls.length;
            if(n<6||n>53||g.z-g.y>130)continue;
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
            // Border evidence is not proof of empty cells. Reject populated grids.
            let populated=false;
            for(let i=0;i<n-1;i++){
                let ink=0,total=0;
                const left=ls[i],right=ls[i+1],padding=Math.max(5,Math.round((right.x-left.x)*.15));
                for(let x=Math.ceil(left.x)+padding;x<right.x-padding;x++){
                    const t=(x-left.x)/(right.x-left.x),top=Math.round(left.y*(1-t)+right.y*t)+7,bottom=Math.round(left.z*(1-t)+right.z*t)-7;
                    for(let y=top;y<bottom;y++){ink+=dark[y*w+x]||0;total++;}
                }
                if(total&&ink/total>.025){populated=true;break;}
            }
            if(populated)continue;
            const x=ls[0].x,z=ls[n-1].x;
            const y=Math.min(...ls.map(p=>p.y)),bottom=Math.max(...ls.map(p=>p.z));
            results.push({columns:n-1,rows:1,x:Math.round(x/w*1000),y:Math.round(y/h*1000),w:Math.round((z-x)/w*1000),h:Math.round((bottom-y)/h*1000)});
        }
        return results.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,12);
    }
    function normalise(text) {
        const types='SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|TABLE_WIDTHS|TABLE_HEADER';
        const bare=new RegExp('^\\s*('+types+'):\\s*(.*?)\\s*$','i');
        text=String(text||'').replace(/\[\[TABLE_ROW:\s*(\[\[(?:FIGURE|SOURCE_FIGURE)_ROW:[\s\S]*?\]\])\s*((?:\|\|\s*_?\s*)*)\]\]/gi,'$1');
        const lines=text.split('\n').flatMap(line=>{
            const m=line.match(bare);
            if(m)line='[['+m[1].toUpperCase()+': '+m[2].replace(/\]\]$/,'')+']]';
            // A grid following its label is a native block, not printable marker text.
            if(!/^\s*\[\[(?:TABLE_ROW|MATCH_ROW):/i.test(line)&&!/^\s*\[\[GRID(?:_ROW)?:[^\n]*\]\]\s*$/i.test(line))
                line=line.replace(/\[\[GRID(?:_ROW)?:\s*[\s\S]*?\]\]/gi,marker=>'\n'+marker+'\n');
            return line.split('\n');
        });
        for(let i=0;i<lines.length;i++){
            const marker=lines[i].match(/^\s*\[\[SECTION_ROW:\s*([^|]*?)\]\]\s*$/i);
            const split=marker&&section(marker[1]);
            if(split)lines[i]='[[SECTION_ROW: '+split.title+' || '+split.marks+']]';
            else if(marker)lines[i]=marker[1].trim();
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
                matching=/match(?:ing| the following)|जोड़ी|मिलान|शब्द.*शब्द.*जोड़ो/i.test(lines[i]);
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
        return lines.join('\n');
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
    function reconcileEmptyGrids(text,grids=[]) {
        if(!grids.length)return text;
        const lines=normalise(text).split('\n'), blocks=[];
        let block=null;
        for(let i=0;i<lines.length;i++){
            const empty=/^\s*\[\[GRID:\s*\d+[x×]1\]\]\s*$/i.test(lines[i])||
                /^\s*\[\[GRID_ROW:\s*(?:_|\s|\|)*\]\]\s*$/i.test(lines[i]);
            if(empty){if(!block){block={indexes:[]};blocks.push(block);}block.indexes.push(i);}
            else if(lines[i].trim())block=null;
        }
        const candidates=blocks.filter(b=>b.indexes.length);
        // Only reconcile when every observed source grid has one empty marker group.
        // Preserve populated grids and ambiguous mappings rather than deleting data.
        if(candidates.length!==grids.length)return text;
        for(let n=0;n<candidates.length;n++){
            const indexes=candidates[n].indexes;
            lines[indexes[0]]='[[GRID: '+grids[n].columns+'x'+grids[n].rows+']]';
            for(const i of indexes.slice(1))lines[i]='';
        }
        return lines.join('\n');
    }
    return {profile,referenceFormats,automaticFormat,figure,pixels,source,fit,tableWidths,section,shape,pdfTextReliable,compactPages,questionAnswer,emptyGrids,normalise,deduplicateFigures,figureRows,reconcileEmptyGrids};
});
