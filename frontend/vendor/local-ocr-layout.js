/* Quota-free OCR geometry. No question generation, answers, or spelling rewrites. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaperAILocalLayout=api;})
(typeof globalThis==='object'?globalThis:this,function(){
    'use strict';
    function tiles(width,height){
        const size=Math.min(height,Math.max(1,Math.round(width*.4))), overlap=Math.round(size*.16), step=Math.max(1,size-overlap),out=[];
        for(let y=0;y<height;y+=step){out.push({x:0,y,w:width,h:Math.min(size,height-y)});if(y+size>=height)break;}
        return out;
    }
    function regions(prediction,width,height,offset=0){
        const data=prediction?.['<OCR_WITH_REGION>']||prediction||{},out=[];
        for(let i=0;i<(data.labels||[]).length;i++){
            const text=String(data.labels[i]||'').trim(),quad=data.quad_boxes?.[i];
            if(!text||/<\/?(?:loc_|poly|s>|pad>|OCR)/i.test(text)||!Array.isArray(quad)||quad.length!==8||!quad.every(Number.isFinite))continue;
            const xs=quad.filter((_,n)=>n%2===0),ys=quad.filter((_,n)=>n%2===1),x=Math.max(0,Math.min(...xs)),y=Math.max(0,Math.min(...ys));
            const right=Math.min(width,Math.max(...xs)),bottom=Math.min(height,Math.max(...ys));
            if(right>x&&bottom>y&&bottom-y<height*.5)out.push({text,x,y:y+offset,w:right-x,h:bottom-y});
        }
        return out;
    }
    function readerRegions(data,width,height){
        const output=[];
        for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
            const words=(line.words||[]).filter(word=>String(word.text||'').trim()&&word.bbox&&
                Object.values(word.bbox).every(Number.isFinite)&&word.bbox.x1>word.bbox.x0&&word.bbox.y1>word.bbox.y0);
            if(!words.length)continue;
            const lineTop=Math.max(0,Math.min(...words.map(w=>w.bbox.y0))),lineBottom=Math.min(height,Math.max(...words.map(w=>w.bbox.y1)));
            const lineHeight=lineBottom-lineTop;
            let group=[];
            const flush=()=>{
                if(!group.length)return;
                const x=Math.max(0,Math.min(...group.map(w=>w.bbox.x0))),right=Math.min(width,Math.max(...group.map(w=>w.bbox.x1)));
                if(right>x&&lineHeight>0)output.push({text:group.map(w=>w.text.trim()).join(' '),x,y:lineTop,w:right-x,h:lineHeight,
                    erase:group.map(w=>({x:Math.max(0,w.bbox.x0),y:Math.max(0,w.bbox.y0),w:Math.min(width,w.bbox.x1)-Math.max(0,w.bbox.x0),h:Math.min(height,w.bbox.y1)-Math.max(0,w.bbox.y0)}))});
                group=[];
            };
            for(const word of words){
                // Keep the reader's logical order for RTL text. Large physical gaps
                // split matching columns and right-side marks into separate runs.
                if(group.length){const previous=group.at(-1).bbox,next=word.bbox;
                    const gap=Math.max(next.x0-previous.x1,previous.x0-next.x1);
                    if(gap>Math.max(12,lineHeight*1.4))flush();}
                group.push(word);
            }
            flush();
        }
        return output;
    }
    function merge(values){
        const sorted=values.slice().sort((a,b)=>a.y-b.y||a.x-b.x),out=[];
        for(const value of sorted){
            const duplicate=out.findIndex(a=>{
                const ix=Math.max(0,Math.min(a.x+a.w,value.x+value.w)-Math.max(a.x,value.x)),iy=Math.max(0,Math.min(a.y+a.h,value.y+value.h)-Math.max(a.y,value.y));
                return ix*iy/Math.max(1,Math.min(a.w*a.h,value.w*value.h))>.6;
            });
            if(duplicate<0)out.push(value);
            // Overlapping crop edges can repeat or truncate a line. Keep its fullest reading.
            else if(value.text.length>out[duplicate].text.length)out[duplicate]=value;
        }
        return out.sort((a,b)=>a.y-b.y||a.x-b.x);
    }
    function rows(values){
        const out=[];
        for(const value of values.slice().sort((a,b)=>a.y-b.y||a.x-b.x)){
            const center=value.y+value.h/2,row=out.find(r=>Math.abs(r.center-center)<Math.min(r.height,value.h)*.55);
            if(row){row.center=(row.center*row.items.length+center)/(row.items.length+1);row.items.push(value);}
            else out.push({center,height:value.h,items:[value]});
        }
        return out.sort((a,b)=>a.center-b.center).map(r=>r.items.sort((a,b)=>a.x-b.x));
    }
    function plainText(values){return rows(values).map(row=>row.map(r=>r.text).join('    ')).join('\n');}
    function scene(values,width,height,dataUrl){
        // Source pixels and OCR boxes share one coordinate transform. A4 fit is handled
        // by the existing Word/preview module; small right-side marks cannot drift.
        const unit=595.3/width;
        return {width:595.3,height:height*unit,supported:values.length>0,localOCR:true,
            texts:values.map(r=>({text:r.text,x:r.x*unit,y:r.y*unit,w:r.w*unit,h:r.h*unit*1.25,size:r.h*unit*.78,
                family:'Arial',bold:/^(?:Subject\s*:|[IVX]+[.)]\s)/i.test(r.text),italic:false})),
            images:[{x:0,y:0,w:width*unit,h:height*unit,dataUrl,pixelWidth:width,pixelHeight:height}],shapes:[]};
    }
    return Object.freeze({tiles,regions,readerRegions,merge,rows,plainText,scene});
});
