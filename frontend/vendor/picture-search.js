(function(root, factory) {
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.PaperAIPictures=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const aliases={पतंग:'kite',बतख:'duck',बत्तख:'duck',मछली:'fish',नल:'water tap',फल:'fruit',सेब:'apple',आम:'mango',केला:'banana',अंगूर:'grapes',अनार:'pomegranate',नारियल:'coconut',संतरा:'orange',अमरूद:'guava',अनानास:'pineapple',तरबूज:'watermelon',पपीता:'papaya',नाशपाती:'pear',नींबू:'lemon',बिल्ली:'cat',कुत्ता:'dog',गाय:'cow',शेर:'lion',हाथी:'elephant',బాతు:'duck',చేప:'fish',మామిడి:'mango',అరటి:'banana',ఆపిల్:'apple'};
    const subjects={kite:'toy kite',duck:'duck',fish:'fish',tap:'water tap',fruits:'fruit',fruit:'fruit',tube:'inner tube',bow:'archery bow',apple:'apple',banana:'banana',cherry:'cherry',coconut:'coconut','custard apple':'custard apple',fig:'fig',grapes:'grapes',guava:'guava',kiwi:'kiwi fruit',lemon:'lemon',mango:'mango',orange:'orange fruit',papaya:'papaya',peach:'peach',pear:'pear',pineapple:'pineapple',plum:'plum',pomegranate:'pomegranate',strawberry:'strawberry',watermelon:'watermelon',cat:'cat',dog:'dog',cow:'cow',lion:'lion',elephant:'elephant'};
    function query(value){const clean=String(value||'').trim().toLowerCase().replace(/\s+/g,' ');return aliases[clean]||subjects[clean]||clean;}
    function placeholder(caption){
        const line=String(caption||'').trim();
        // A question may request a picture without supplying one. Search only
        // that named object, never the entire OCR document or question.
        const pictureOf=line.match(/^(?:\d+[.)]\s*)?(?:add|paste|insert|draw|attach|find)\s+(?:(?:a|an|the)\s+)?pic(?:ture)?\s+of\s+([\p{L}\p{M} -]{1,35}?)\s*[.!]?$/iu);
        const instruction=line.match(/^(?:\d+[.)]\s*)?(?:add|paste|insert|draw|attach|find)\s+(?:(?:a|an|the)\s+)?([\p{L}\p{M} -]{1,35}?)(?:\s+pic(?:ture)?)?\s*[.!]?$/iu);
        const direct=line.match(/^(?:\d+[.)]\s*)?([\p{L}\p{M} -]{1,35}?)\s+pic(?:ture)?\b/iu);
        // An exact "picture of X" instruction takes priority over loose
        // patterns, so "picture of apple" never becomes the subject name.
        const m=pictureOf||instruction||direct;
        if(!m)return null;
        const name=m[1].toLowerCase().trim().replace(/^n\s+tube$/,'tube');
        return subjects[name]||aliases[name]?{name,query:query(name)}:null;
    }
    // These individual source artworks were visually inspected together at
    // worksheet size. This is a finite curated catalog, not a filename match
    // or a claim that arbitrary internet search results passed a vision model.
    const reviewedCodes={kite:'1FA81',duck:'1F986',fish:'1F41F',tap:'1F6B0',apple:'1F34E',banana:'1F34C',grapes:'1F347',bow:'1F3F9',fruit:null};
    function reviewedArtwork(subject){
        const canonical=query(subject),name=({'toy kite':'kite','water tap':'tap','archery bow':'bow'})[canonical]||canonical;
        if(!Object.prototype.hasOwnProperty.call(reviewedCodes,name))return null;
        const code=reviewedCodes[name];
        return {name,label:name==='fruit'?'Fruit assortment':name[0].toUpperCase()+name.slice(1),
            assetUrl:'/images/worksheet-reviewed/'+name+'.png',creator:'OpenMoji contributors',license:'CC BY-SA 4.0',
            sourceUrl:code?'https://openmoji.org/library/emoji-'+code+'/':'https://openmoji.org/library/',
            reviewMethod:'curated visual inspection',adaptation:name==='fruit'?'Rasterized apple, banana and grapes composition':'Rasterized original outline artwork'};
    }
    async function reviewed(subject,fetcher=fetch){
        const source=reviewedArtwork(subject);
        if(!source)return null;
        const response=await fetcher(source.assetUrl,{credentials:'omit',redirect:'error'});
        if(!response.ok)throw new Error('Reviewed picture unavailable.');
        const blob=await response.blob();
        if(blob.type!=='image/png'||blob.size>1024*1024)throw new Error('Invalid reviewed picture.');
        const bytes=new Uint8Array(await blob.arrayBuffer());
        if(![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))throw new Error('Invalid reviewed picture pixels.');
        return {blob,source};
    }
    function assetURL(item){
        const title=String(item?.title||'');
        if(!/^File:[^|\[\]{}<>\r\n]{1,220}\.(png|jpe?g|webp|svg)$/i.test(title))throw new Error('Invalid picture selection.');
        return '/api/pictures/asset?title='+encodeURIComponent(title);
    }
    function groupRequests(text){
        const lines=String(text||'').split('\n'),out=[];
        const explicit=line=>!!placeholder(line)&&(
            /^\s*(?:\d+[.)]\s*)?[\p{L}\p{M} -]{1,35}?\s+pic(?:ture)?\s*(?:[—–_-][^\n]*)?$/iu.test(line)||
            /^\s*(?:\d+[.)]\s*)?(?:add|paste|insert|draw|attach|find)\s+[^\n]{2,45}$/iu.test(line)
        );
        for(let i=0;i<lines.length;){
            // Existing pixel evidence takes priority over a nearby written note.
            if(!explicit(lines[i])||/\[\[(?:SOURCE_)?FIGURE/i.test(lines.slice(Math.max(0,i-1),i+3).join('\n'))){out.push(lines[i++]);continue;}
            const captions=[];
            while(i<lines.length&&captions.length<5&&explicit(lines[i])&&!/\[\[(?:SOURCE_)?FIGURE/i.test(lines.slice(Math.max(0,i-1),i+3).join('\n')))captions.push(lines[i++].trim());
            out.push('[[DEFAULT_PICTURE_ROW: '+captions.join(' || ')+']]');
        }
        return out.join('\n');
    }
    const pending=new Map();
    async function search(subject,fetcher=fetch){
        const q=query(subject);
        if(q.length<2||q.length>80)throw new Error('Enter a short picture subject.');
        try{
            const response=await fetcher('/api/pictures/search?q='+encodeURIComponent(q));
            const data=await response.json();
            if(!response.ok)throw new Error(data.error||'Picture search unavailable.');
            return Array.isArray(data.results)?data.results:[];
        }catch(error){
            if(typeof PaperAICommons!=='undefined')return PaperAICommons.search(q);
            throw error;
        }
    }
    async function download(item,fetcher=fetch){
        try{
            const response=await fetcher(assetURL(item));
            if(!response.ok)throw new Error('Picture download failed.');
            return await response.blob();
        }catch(error){
            if(typeof PaperAICommons!=='undefined')return PaperAICommons.download(item);
            throw error;
        }
    }
    async function automatic(subject,fetcher=fetch){
        const q=query(subject);
        if(!pending.has(q))pending.set(q,(async()=>{
            const items=await search(q,fetcher);
            // Try the best-matched candidates in order. A Commons item may have
            // disappeared or have invalid pixels since the search was indexed.
            // Never quietly choose an unrelated or unlicensed fallback.
            const candidates=items.filter(item=>item.confident===true).slice(0,4);
            if(!candidates.length)throw new Error('Choose a picture using Find pictures.');
            for(const item of candidates){
                try{
                    const blob=await download(item,fetcher);
                    if(blob&&blob.size>0)return {blob,source:item};
                }catch(_){ /* Try the next separately validated Commons candidate. */ }
            }
            throw new Error('Matching pictures could not be downloaded. Choose a picture using Find pictures.');
        })());
        // This cache deduplicates concurrent requests only. Never reuse a past
        // result indefinitely: Commons files, licenses and teacher choices change.
        const request=pending.get(q);
        try{return await request;}
        finally{if(pending.get(q)===request)pending.delete(q);}
    }
    return {query,placeholder,assetURL,search,download,automatic,groupRequests,reviewedArtwork,reviewed};
});
