(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('diff'),require('unicode-segmenter/grapheme'));
    else root.PaperAIText=factory(root.PaperAITextEngine,root.PaperAITextEngine);
})(typeof globalThis!=='undefined'?globalThis:this,function(differ,unicode){
    'use strict';
    // Keep a position for each editable word. Geometry, image IDs and protocol
    // delimiters never participate in a spelling replacement.
    const hidden=new Set(['COUNT_OBJECTS','ABACUS','GRID','SHAPE_ROW','BANNER','SOURCE_BANNER','TABLE_REGION','TABLE_WIDTHS','TABLE_HEADER','SOURCE_PAGE','HEADER','FOOTER','ANSWER_LINES','CHECKBOX','PAGE_BREAK','PAPER_BREAK','BRANCH_END']);
    const rows=new Set(['SECTION_ROW','QUESTION_ROW','MATCH_ROW','TABLE_ROW','GRID_ROW','CHOICE_ROW','OPTION_ROW','ARITHMETIC_ROW','BRANCH_ITEM']);
    const key=value=>value.normalize('NFC');
    function tokens(text,offset=0,leaf=0){
        const out=[];
        if(unicode?.graphemeSegments){
            let word=null;
            const flush=()=>{if(word){out.push({...word,key:key(word.value),leaf});word=null;}};
            for(const {segment,index} of unicode.graphemeSegments(text)){
                const start=offset+index,end=start+segment.length;
                if(/[\p{L}\p{M}\p{N}]/u.test(segment)){
                    if(word){word.value+=segment;word.end=end;}
                    else word={value:segment,start,end};
                }else{
                    flush();
                    if(!/^[\s_□☐|\[\]]+$/u.test(segment))out.push({value:segment,key:key(segment),start,end,leaf});
                }
            }
            flush();return out;
        }
        for(const m of text.matchAll(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}_□☐|\[\]]/gu)){
            out.push({value:m[0],key:key(m[0]),start:offset+m.index,end:offset+m.index+m[0].length,leaf});
        }
        return out;
    }
    function plainTokens(value){
        // These captions describe visual assets in the plain-text view. They
        // are not question words and cannot rename the underlying asset.
        const text=String(value||'').replace(/\[(?:illustration|[^\]\n]* (?:picture|shape))\]/gi,m=>' '.repeat(m.length));
        return tokens(text);
    }
    function positions(value){
        const text=String(value||''),out=[];let leaf=0,valid=true;
        function scan(start,end){
            let cursor=start;
            while(cursor<end){
                const at=text.indexOf('[[',cursor);
                const stop=at<0||at>=end?end:at;
                if(stop>cursor){
                    const chunk=text.slice(cursor,stop);
                    // A line/cell is an insertion boundary; preserve HTML line
                    // breaks as layout rather than editable words.
                    let last=0;
                    for(const m of chunk.matchAll(/\n|<br\s*\/?\s*>/gi)){
                        out.push(...tokens(chunk.slice(last,m.index),cursor+last,leaf++));last=m.index+m[0].length;
                    }
                    out.push(...tokens(chunk.slice(last),cursor+last,leaf++));
                }
                if(stop===end)break;
                let depth=1,close=at+2;
                while(close<end&&depth){
                    if(text.slice(close,close+2)==='[['){depth++;close+=2;}
                    else if(text.slice(close,close+2)===']]'){depth--;close+=2;}
                    else close++;
                }
                if(depth){valid=false;break;}
                const head=text.slice(at+2,close-2).match(/^([A-Z_-]+)(?::\s*)?/i);
                if(!head){valid=false;break;}
                const kind=head[1].toUpperCase(),bodyStart=at+2+head[0].length,bodyEnd=close-2;
                if(hidden.has(kind)){}
                else if(/^(?:SOURCE_)?FIGURE(?:_ROW)?$/.test(kind)){
                    const body=text.slice(bodyStart,bodyEnd);let from=0;
                    for(const cell of body.split(/\|\|/)){
                        const first=cell.indexOf('|'),second=first<0?-1:cell.indexOf('|',first+1);
                        if(first>=0)scan(bodyStart+from+first+1,bodyStart+from+(second<0?cell.length:second));
                        from+=cell.length+2;
                    }
                }else if(/^(?:PICTURE|PICTURE_ROW|PICTURE_OPTION)$/.test(kind)){}
                else if(rows.has(kind)){
                    let part=bodyStart,nesting=0;
                    for(let p=bodyStart;p<bodyEnd;p++){
                        if(text.slice(p,p+2)==='[['){nesting++;p++;}
                        else if(text.slice(p,p+2)===']]'){nesting--;p++;}
                        else if(!nesting&&text.slice(p,p+2)==='||'){scan(part,p);part=p+2;p++;}
                    }
                    scan(part,bodyEnd);
                }else if(/^(?:UNDERLINE|DOUBLE-UNDERLINE|BOXED|CIRCLED|BRANCH_ROOT|INSERT|HIGHLIGHT)$/.test(kind)){
                    scan(bodyStart,bodyEnd);
                }else valid=false;
                cursor=close;
            }
        }
        scan(0,text.length);return valid?out:null;
    }
    function diff(oldWords,newWords){
        if(differ?.diffArrays){
            // Myers diff keeps distant changes separate without a quadratic
            // document matrix. A work limit safely declines a wholesale paste.
            const parts=differ.diffArrays(oldWords.map(w=>w.key),newWords.map(w=>w.key),{maxEditLength:512,timeout:60});
            if(!parts)return null;
            const changes=[];let a=0,c=0,change=null;
            const flush=()=>{if(change){changes.push({...change,b:a,d:c});change=null;}};
            for(const part of parts){
                if(!part.added&&!part.removed){flush();a+=part.count;c+=part.count;}
                else{if(!change)change={a,c};if(part.removed)a+=part.count;else c+=part.count;}
            }
            flush();return changes;
        }
        let prefix=0,suffix=0;
        while(prefix<oldWords.length&&prefix<newWords.length&&oldWords[prefix].key===newWords[prefix].key)prefix++;
        while(suffix<oldWords.length-prefix&&suffix<newWords.length-prefix&&oldWords[oldWords.length-1-suffix].key===newWords[newWords.length-1-suffix].key)suffix++;
        const n=oldWords.length-prefix-suffix,m=newWords.length-prefix-suffix;
        if(!n&&!m)return [];
        // Without the bundled engine, decline a large interval rather than
        // allocating a quadratic table or collapsing several question cells.
        if(n*m>1000000)return null;
        const matrix=Array.from({length:n+1},()=>new Uint32Array(m+1));
        for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){matrix[i][j]=oldWords[prefix+i].key===newWords[prefix+j].key?1+matrix[i+1][j+1]:Math.max(matrix[i+1][j],matrix[i][j+1]);}
        const changes=[];let i=0,j=0,begin=null;
        const flush=()=>{if(begin){changes.push({a:prefix+begin.i,b:prefix+i,c:prefix+begin.j,d:prefix+j});begin=null;}};
        while(i<n||j<m){
            if(i<n&&j<m&&oldWords[prefix+i].key===newWords[prefix+j].key){flush();i++;j++;continue;}
            if(!begin)begin={i,j};
            if(j<m&&(i===n||matrix[i][j+1]>=matrix[i+1][j]))j++;else i++;
        }
        flush();return changes;
    }
    function applyEdits(layout,original,edited){
        layout=String(layout||'');original=String(original||'');edited=String(edited||'');
        if(original===edited)return layout;
        if(/\[\[[A-Z_-]+(?::|\]\])/i.test(edited))return null;
        const spans=positions(layout),oldWords=plainTokens(original),newWords=plainTokens(edited);
        if(!spans||spans.length!==oldWords.length||spans.some((word,i)=>word.key!==oldWords[i].key))return null;
        const changes=diff(oldWords,newWords),patches=[];
        if(changes===null)return null;
        for(const change of changes){
            const {a,b,c,d}=change;
            const replacement=c<d?edited.slice(newWords[c].start,newWords[d-1].end):'';
            if(a<b){
                // Replace each affected cell separately when an edit crosses a
                // table boundary. Never remove the row/cell markers themselves.
                let from=a;
                while(from<b){let to=from+1;while(to<b&&spans[to].leaf===spans[from].leaf)to++;
                    patches.push({start:spans[from].start,end:spans[to-1].end,text:from===a?replacement:''});from=to;
                }
            }else if(a<spans.length){
                const previous=a>0?spans[a-1]:null,next=spans[a];
                const leftGap=c>0?edited.slice(newWords[c-1].end,newWords[c].start):'';
                const rightGap=d<newWords.length?edited.slice(newWords[d-1].end,newWords[d].start):'';
                const boundary=gap=>/[|\n\t]| {2,}/.test(gap);
                // At a row/cell boundary, source token order alone is not
                // enough: an insertion before the separator belongs to the
                // PREVIOUS question, not the next token's question.
                if(previous&&previous.leaf!==next.leaf){
                    if(boundary(rightGap)&&!boundary(leftGap)){
                        patches.push({start:previous.end,end:previous.end,text:edited.slice(newWords[c-1].end,newWords[d-1].end)});
                    }else if(boundary(leftGap)&&!boundary(rightGap)){
                        patches.push({start:next.start,end:next.start,text:edited.slice(newWords[c].start,newWords[d].start)});
                    }else return null;
                }else patches.push({start:next.start,end:next.start,text:replacement+' '});
            }
            else if(spans.length){const end=spans[spans.length-1].end;patches.push({start:end,end,text:edited.slice(c>0?newWords[c-1].end:0,newWords[d-1].end)});}
            else return null;
        }
        patches.sort((a,b)=>b.start-a.start);
        for(const patch of patches)layout=layout.slice(0,patch.start)+patch.text+layout.slice(patch.end);
        const after=positions(layout);
        // If a pasted edit introduced protocol syntax, do not let it silently
        // change the asset/geometry map.
        if(!after||after.length!==newWords.length||after.some((word,i)=>word.key!==newWords[i].key))return null;
        return layout;
    }
    return {applyEdits};
});
