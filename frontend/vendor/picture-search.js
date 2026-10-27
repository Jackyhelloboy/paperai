(function(root, factory) {
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.PaperAIPictures=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const aliases={पतंग:'kite',बतख:'duck',बत्तख:'duck',मछली:'fish',नल:'water tap',फल:'fruit',सेब:'apple',आम:'mango',केला:'banana',अंगूर:'grapes',अनार:'pomegranate',नारियल:'coconut',संतरा:'orange',अमरूद:'guava',अनानास:'pineapple',तरबूज:'watermelon',पपीता:'papaya',नाशपाती:'pear',नींबू:'lemon',बिल्ली:'cat',कुत्ता:'dog',गाय:'cow',शेर:'lion',हाथी:'elephant',బాతు:'duck',చేప:'fish',మామిడి:'mango',అరటి:'banana',ఆపిల్:'apple'};
    const subjects={kite:'toy kite',duck:'duck',fish:'fish',tap:'water tap',fruits:'fruit',fruit:'fruit',tube:'inner tube',bow:'archery bow',apple:'apple',banana:'banana',cherry:'cherry',coconut:'coconut','custard apple':'custard apple',fig:'fig',grapes:'grapes',guava:'guava',kiwi:'kiwi fruit',lemon:'lemon',mango:'mango',orange:'orange fruit',papaya:'papaya',peach:'peach',pear:'pear',pineapple:'pineapple',plum:'plum',pomegranate:'pomegranate',strawberry:'strawberry',watermelon:'watermelon',cat:'cat',dog:'dog',cow:'cow',lion:'lion',elephant:'elephant'};
    function query(value){const clean=String(value||'').trim().toLowerCase().replace(/\s+/g,' ');return aliases[clean]||subjects[clean]||clean;}
    function placeholder(caption){
        const m=String(caption||'').match(/^\s*(?:\d+[.)]\s*)?([\p{L}\p{M} -]{1,35}?)\s+pic(?:ture)?\b/iu);
        if(!m)return null;
        const name=m[1].toLowerCase().trim().replace(/^n\s+tube$/,'tube');
        return subjects[name]||aliases[name]?{name,query:query(name)}:null;
    }
    function assetURL(item){
        const title=String(item?.title||'');
        if(!/^File:[^|\[\]{}<>\r\n]{1,220}\.(png|jpe?g|webp|svg)$/i.test(title))throw new Error('Invalid picture selection.');
        return '/api/pictures/asset?title='+encodeURIComponent(title);
    }
    function groupRequests(text){
        const lines=String(text||'').split('\n'),out=[];
        const explicit=line=>/^\s*(?:\d+[.)]\s*)?[\p{L}\p{M} -]{1,35}?\s+pic(?:ture)?\s*(?:[—–_-][^\n]*)?$/iu.test(line)&&placeholder(line);
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
            const items=await search(q,fetcher),item=items.find(item=>item.confident);
            if(!item)throw new Error('Choose a picture using Find pictures.');
            return {blob:await download(item,fetcher),source:item};
        })());
        try{return await pending.get(q);}catch(error){pending.delete(q);throw error;}
        finally{if(pending.size>40)pending.delete(pending.keys().next().value);}
    }
    return {query,placeholder,assetURL,search,download,automatic,groupRequests};
});
