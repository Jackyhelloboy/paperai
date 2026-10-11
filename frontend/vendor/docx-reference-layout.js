/* Preserve Word's original editable objects; only fit the required A4 page. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaperAIWordReference=api;})
(typeof globalThis==='object'?globalThis:this,function(){
    const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    const A='http://schemas.openxmlformats.org/drawingml/2006/main';
    const contentWidth=10466,contentEmu=contentWidth*635;
    function normaliseXml(xml,options={}){
        const Parser=options.Parser||globalThis.DOMParser,Serializer=options.Serializer||globalThis.XMLSerializer;
        const doc=new Parser().parseFromString(xml,'application/xml');
        if(doc.getElementsByTagName('parsererror').length)throw new Error('The Word layout XML could not be read.');
        const children=node=>Array.from(node.childNodes||[]).filter(x=>x.nodeType===1);
        const prop=(parent,name)=>children(parent).find(n=>n.namespaceURI===W&&n.localName===name);
        const set=(node,name,value)=>node.setAttributeNS(W,'w:'+name,String(value));
        for(const section of Array.from(doc.getElementsByTagNameNS(W,'sectPr'))){
            let size=prop(section,'pgSz');if(!size){size=doc.createElementNS(W,'w:pgSz');section.appendChild(size);}
            set(size,'w',11906);set(size,'h',16838);size.removeAttributeNS(W,'orient');
            let margin=prop(section,'pgMar');if(!margin){margin=doc.createElementNS(W,'w:pgMar');section.appendChild(margin);}
            for(const side of ['top','bottom','left','right'])set(margin,side,720);
            set(margin,'header',360);set(margin,'footer',360);set(margin,'gutter',0);
        }
        // Scale only overflowing native tables, retaining unequal columns and merges.
        for(const table of Array.from(doc.getElementsByTagNameNS(W,'tbl'))){
            const tableProperties=prop(table,'tblPr'),floating=tableProperties&&prop(tableProperties,'tblpPr');
            if(floating)tableProperties.removeChild(floating);
            const grid=prop(table,'tblGrid');if(!grid)continue;
            const columns=children(grid).filter(n=>n.localName==='gridCol'),widths=columns.map(n=>Number(n.getAttributeNS(W,'w')));
            const total=widths.reduce((a,b)=>a+b,0);if(!(total>contentWidth)||widths.some(n=>n<=0))continue;
            const scale=contentWidth/total;let used=0;
            columns.forEach((node,i)=>{const value=i===columns.length-1?contentWidth-used:Math.round(widths[i]*scale);used+=value;set(node,'w',value);});
            const properties=prop(table,'tblPr'),width=properties&&prop(properties,'tblW');
            if(width){set(width,'w',contentWidth);set(width,'type','dxa');}
            for(const row of children(table).filter(n=>n.localName==='tr'))for(const cell of children(row).filter(n=>n.localName==='tc')){
                const cp=prop(cell,'tcPr'),cw=cp&&prop(cp,'tcW');if(cw&&cw.getAttributeNS(W,'type')==='dxa')set(cw,'w',Math.round(Number(cw.getAttributeNS(W,'w'))*scale));
            }
        }
        for(const drawing of Array.from(doc.getElementsByTagNameNS(W,'drawing'))){
            // Floating text boxes/compound banners use independent anchor offsets.
            // Resizing those extents alone changes wrapping and breaks their composition.
            const anchor=drawing.getElementsByTagNameNS(WP,'anchor')[0];
            if(anchor){
                const extent=anchor.getElementsByTagNameNS(WP,'extent')[0];
                if(extent&&Number(extent.getAttribute('cx'))>contentEmu*.85){
                    const wrap=children(anchor).find(n=>n.namespaceURI===WP&&/^wrap/.test(n.localName));
                    if(wrap&&wrap.localName!=='wrapTopAndBottom'){
                        const replacement=doc.createElementNS(WP,'wp:wrapTopAndBottom');anchor.replaceChild(replacement,wrap);
                    }
                }
                continue;
            }
            if(!drawing.getElementsByTagNameNS(WP,'inline').length)continue;
            const extent=drawing.getElementsByTagNameNS(WP,'extent')[0];if(!extent)continue;
            const cx=Number(extent.getAttribute('cx')),cy=Number(extent.getAttribute('cy'));
            if(cx>contentEmu&&cy>0){
                const height=Math.round(cy*contentEmu/cx);extent.setAttribute('cx',contentEmu);extent.setAttribute('cy',height);
                // Keep DrawingML geometry synchronized with the Word placement extent.
                for(const xfrm of Array.from(drawing.getElementsByTagNameNS(A,'xfrm'))){
                    const ext=Array.from(xfrm.childNodes||[]).find(n=>n.nodeType===1&&n.localName==='ext');
                    if(ext){ext.setAttribute('cx',contentEmu);ext.setAttribute('cy',height);}
                }
            }
        }
        for(const paragraph of Array.from(doc.getElementsByTagNameNS(W,'p'))){
            let previous=paragraph.previousSibling;while(previous&&previous.nodeType!==1)previous=previous.previousSibling;
            // Joining a heading to the paragraph after a floating banner can move it
            // into that banner's wrap area. Retain the source pagination in that case.
            if(previous&&(previous.getElementsByTagNameNS(W,'drawing').length||previous.getElementsByTagNameNS(W,'pict').length))continue;
            const text=children(paragraph).filter(n=>n.namespaceURI===W&&n.localName==='r').map(run=>Array.from(run.getElementsByTagNameNS(W,'t')).map(t=>t.textContent).join('')).join('').trim();
            if(!/^(?:[IVX]+[.)]\s|PART\s*[-–:]?\s*[AB]\b|Section\s+[A-Z][: .])/i.test(text)||paragraph.getElementsByTagNameNS(W,'drawing').length||paragraph.getElementsByTagNameNS(W,'pict').length)continue;
            let properties=prop(paragraph,'pPr');if(!properties){properties=doc.createElementNS(W,'w:pPr');paragraph.insertBefore(properties,paragraph.firstChild);}
            let keep=prop(properties,'keepNext');if(!keep){keep=doc.createElementNS(W,'w:keepNext');properties.insertBefore(keep,properties.firstChild);}set(keep,'val',1);
        }
        return new Serializer().serializeToString(doc);
    }
    async function makeWord(bytes,options={}){
        const Zip=options.Zip||globalThis.JSZip,zip=await Zip.loadAsync(bytes);
        if(!zip.file('word/document.xml'))throw new Error('This is not a Word document.');
        for(const name of Object.keys(zip.files).filter(n=>/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(n))){
            zip.file(name,normaliseXml(await zip.file(name).async('text'),options),{createFolders:false});
        }
        return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
    }
    return {normaliseXml,makeWord};
});
