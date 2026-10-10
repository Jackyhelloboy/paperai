/* Measured PDF layout: selectable text stays editable; artwork keeps source bounds. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaperAIPdfEditable=api;})
(typeof globalThis==='object'?globalThis:this,function(){
    const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
    const point=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
    function bounds(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
    function fontStyle(font,style={}){
        let bold=false,italic=false,name=font?.name||'';
        const bytes=font?.data;
        if(bytes?.length>12){
            try{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint16(4);
                for(let i=0;i<n;i++){const at=12+i*16,tag=String.fromCharCode(...bytes.slice(at,at+4)),off=v.getUint32(at+8);
                    if(tag==='OS/2'&&off+64<=v.byteLength){const bits=v.getUint16(off+62);bold=!!(bits&32);italic=!!(bits&1);}
                    if(tag==='head'&&off+46<=v.byteLength){const bits=v.getUint16(off+44);bold=bold||!!(bits&1);italic=italic||!!(bits&2);}
                    if(tag==='name'&&off+6<=v.byteLength){const count=v.getUint16(off+2),base=off+v.getUint16(off+4);
                        for(let j=0;j<count;j++){const r=off+6+j*12;if(r+12>v.byteLength)break;
                            if(![1,2,4,6].includes(v.getUint16(r+6)))continue;
                            const length=v.getUint16(r+8),start=base+v.getUint16(r+10);if(start+length>v.byteLength)continue;
                            const text=v.getUint16(r)===3?new TextDecoder('utf-16be').decode(bytes.slice(start,start+length)):new TextDecoder().decode(bytes.slice(start,start+length));name+=' '+text;
                        }
                    }
                }
            }catch(_){/* Generic font family is available even for damaged font metadata. */}
        }
        bold=bold||/bold|black|heavy/i.test(name);italic=italic||/italic|oblique/i.test(name);
        const family=/Arial/i.test(name)?'Arial':/Calibri/i.test(name)?'Calibri':/Times/i.test(name)?'Times New Roman':style.fontFamily==='sans-serif'?'Arial':'Times New Roman';
        return {family,bold,italic};
    }
    async function imageData(image,createCanvas){
        const c=createCanvas();c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');
        if(image.bitmap)ctx.drawImage(image.bitmap,0,0);
        else {
            const rgba=ctx.createImageData(c.width,c.height),data=image.data;
            if(!data)throw new Error('Embedded PDF picture could not be decoded.');
            for(let i=0;i<c.width*c.height;i++){
                const at=i*4;
                if(image.kind===3){rgba.data.set(data.subarray(at,at+4),at);}
                else if(image.kind===2){rgba.data[at]=data[i*3];rgba.data[at+1]=data[i*3+1];rgba.data[at+2]=data[i*3+2];rgba.data[at+3]=255;}
                else {const byte=data[Math.floor(i/c.width)*Math.ceil(c.width/8)+Math.floor(i%c.width/8)];const gray=(byte>>(7-i%c.width%8))&1?255:0;rgba.data[at]=rgba.data[at+1]=rgba.data[at+2]=gray;rgba.data[at+3]=255;}
            }
            ctx.putImageData(rgba,0,0);
        }
        const dataUrl=c.toDataURL('image/png');c.width=c.height=0;return dataUrl;
    }
    async function scene(page,pdfjs,options={}){
        const viewport=page.getViewport({scale:1}),content=await page.getTextContent(),ops=await page.getOperatorList();
        const texts=[],images=[],shapes=[],fonts=new Map();let supported=true;
        for(const item of content.items||[]){
            if(!item.str?.trim())continue;
            const m=multiply(viewport.transform,item.transform),size=Math.hypot(m[2],m[3]);
            if(Math.abs(m[1])>.01||Math.abs(m[2])>.01){supported=false;continue;}
            if(!fonts.has(item.fontName)){let f;try{f=page.commonObjs.get(item.fontName);}catch(_){}fonts.set(item.fontName,fontStyle(f,content.styles[item.fontName]));}
            const style=content.styles[item.fontName]||{},ascent=Number.isFinite(style.ascent)?style.ascent:.9;
            const text={text:item.str,x:m[4],y:m[5]-size*ascent,w:item.width,h:size*1.22,size,...fonts.get(item.fontName)};
            // Pure answer rules are editable line shapes, not long underscore runs.
            if(/^_+$/.test(item.str.trim()))shapes.push({x:text.x,y:m[5]+size*.1,w:text.w,h:.5,fill:'333333'});
            else texts.push(text);
        }
        const O=pdfjs.OPS,stack=[];let state={matrix:[1,0,0,1,0,0],fill:'000000',stroke:'000000',line:1},path=[],pathSupported=true;
        const color=a=>Array.from(a,v=>Math.round(v).toString(16).padStart(2,'0')).join('');
        for(let i=0;i<ops.fnArray.length;i++){
            const fn=ops.fnArray[i],args=ops.argsArray[i]||[];
            if(fn===O.save)stack.push({...state,matrix:state.matrix.slice()});
            else if(fn===O.restore)state=stack.pop()||state;
            else if(fn===O.transform)state.matrix=multiply(state.matrix,args);
            else if(fn===O.setFillRGBColor)state.fill=color(args);
            else if(fn===O.setStrokeRGBColor)state.stroke=color(args);
            else if(fn===O.setLineWidth)state.line=args[0];
            else if(fn===O.constructPath){
                path=[];pathSupported=true;const matrix=multiply(viewport.transform,state.matrix),commands=args[0],coords=args[1];let n=0;
                for(const command of commands){
                    if(command===O.rectangle){const x=coords[n++],y=coords[n++],w=coords[n++],h=coords[n++];path.push({kind:'rect',...bounds([point(matrix,x,y),point(matrix,x+w,y+h)])});}
                    else if(command===O.moveTo||command===O.lineTo){path.push({kind:command===O.moveTo?'move':'line',...point(matrix,coords[n++],coords[n++])});}
                    else if(command===O.closePath)path.push({kind:'close'});
                    else {pathSupported=false;break;}
                }
            }else if([O.fill,O.eoFill,O.stroke,O.fillStroke,O.eoFillStroke].includes(fn)){
                const points=path.filter(p=>p.kind==='move'||p.kind==='line');
                if(pathSupported&&points.length===4&&path.every(p=>['move','line','close'].includes(p.kind))&&
                    points.every((p,n)=>{const next=points[(n+1)%4];return Math.abs(p.x-next.x)<.01||Math.abs(p.y-next.y)<.01;}))
                    path=[{kind:'rect',...bounds(points)}];
                if(!pathSupported||path.some(p=>p.kind!=='rect'))supported=false;
                else for(const p of path){
                    if(p.kind==='rect'&&p.w>0&&p.h>0&&!(state.fill==='ffffff'&&p.w>viewport.width*.9&&p.h>viewport.height*.9&&fn!==O.stroke))shapes.push({...p,fill:fn===O.stroke?null:state.fill,stroke:fn===O.fill||fn===O.eoFill?null:state.stroke,line:state.line});
                }
                path=[];
            }else if(fn===O.endPath)path=[];
            else if(fn===O.paintImageXObject||fn===O.paintInlineImageXObject){
                const matrix=multiply(viewport.transform,state.matrix),box=bounds([point(matrix,0,0),point(matrix,1,0),point(matrix,0,1),point(matrix,1,1)]);
                if(Math.abs(matrix[1])>.01||Math.abs(matrix[2])>.01||matrix[0]<=0||matrix[3]>=0){supported=false;continue;}
                const objects=String(args[0]).startsWith('g_')?page.commonObjs:page.objs;
                const image=fn===O.paintInlineImageXObject?args[0]:await new Promise(resolve=>objects.get(args[0],resolve));
                const dataUrl=options.createCanvas?await imageData(image,options.createCanvas):null;
                images.push({...box,dataUrl,pixelWidth:image.width,pixelHeight:image.height});
            }else if([O.paintImageMaskXObject,O.paintImageXObjectRepeat,O.paintImageMaskXObjectGroup].includes(fn))supported=false;
        }
        // The training references consistently use bold Roman-numbered sections.
        const headingYs=texts.filter(t=>/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(t.text.trim())&&t.x<viewport.width*.2).map(t=>t.y);
        for(const t of texts)if(headingYs.some(y=>Math.abs(y-t.y)<3))t.bold=true;
        return {width:viewport.width,height:viewport.height,texts,images,shapes,supported:supported&&texts.map(t=>t.text).join('').length>=20};
    }
    function geometry(pages){
        const boxes=pages.flatMap(p=>[...p.texts,...p.images,...p.shapes]);
        const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.w+(b.text?3:0))),bottom=Math.max(...boxes.map(b=>b.y+b.h));
        const scale=Math.min(1,(595.3-72)/(right-x),(841.9-72)/(bottom-y));
        return {scale,dx:36-x*scale,dy:36-y*scale};
    }
    function anchor(id,box,graphic){
        const cx=Math.max(1,Math.round(box.w*12700)),cy=Math.max(1,Math.round(box.h*12700));
        return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="'+id+'" behindDoc="'+(graphic.behind?1:0)+'" locked="0" layoutInCell="1" allowOverlap="1">'+
            '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>'+Math.round(box.x*12700)+'</wp:posOffset></wp:positionH>'+ 
            '<wp:positionV relativeFrom="page"><wp:posOffset>'+Math.round(box.y*12700)+'</wp:posOffset></wp:positionV>'+ 
            '<wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="'+id+'" name="PDF object '+id+'"/>'+ 
            '<a:graphic><a:graphicData uri="'+graphic.uri+'">'+graphic.xml+'</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
    }
    const shapeUri='http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
    function textShape(t,id,g){
        const box={x:g.dx+t.x*g.scale,y:g.dy+t.y*g.scale,w:(t.w+3)*g.scale,h:t.h*g.scale},size=Math.max(2,Math.round(t.size*g.scale*2));
        const props='<w:rPr><w:rFonts w:ascii="'+esc(t.family)+'" w:hAnsi="'+esc(t.family)+'"/>'+(t.bold?'<w:b/>':'')+(t.italic?'<w:i/>':'')+
            '<w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/><w:fitText w:val="'+Math.max(1,Math.round(t.w*g.scale*20))+'" w:id="'+id+'"/></w:rPr>';
        return anchor(id,box,{uri:shapeUri,xml:'<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>'+ 
            '<wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="'+Math.round(t.size*g.scale*22)+'" w:lineRule="exact"/></w:pPr><w:r>'+props+
            '<w:t xml:space="preserve">'+esc(t.text)+'</w:t></w:r></w:p></w:txbxContent></wps:txbx>'+ 
            '<wps:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" wrap="none" anchor="t"><a:noAutofit/></wps:bodyPr></wps:wsp>'});
    }
    function imageShape(im,id,rid,g){
        const box={x:g.dx+im.x*g.scale,y:g.dy+im.y*g.scale,w:im.w*g.scale,h:im.h*g.scale};
        return anchor(id,box,{behind:true,uri:'http://schemas.openxmlformats.org/drawingml/2006/picture',xml:'<pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="Original PDF picture"/><pic:cNvPicPr/></pic:nvPicPr>'+ 
            '<pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+Math.round(box.w*12700)+'" cy="'+Math.round(box.h*12700)+'"/></a:xfrm>'+ 
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'});
    }
    function rectangleShape(s,id,g){
        const box={x:g.dx+s.x*g.scale,y:g.dy+s.y*g.scale,w:s.w*g.scale,h:s.h*g.scale};
        return anchor(id,box,{behind:true,uri:shapeUri,xml:'<wps:wsp><wps:cNvSpPr/><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'+ 
            (s.fill?'<a:solidFill><a:srgbClr val="'+s.fill+'"/></a:solidFill>':'<a:noFill/>')+
            (s.stroke?'<a:ln w="'+Math.round((s.line||.5)*g.scale*12700)+'"><a:solidFill><a:srgbClr val="'+s.stroke+'"/></a:solidFill></a:ln>':'<a:ln><a:noFill/></a:ln>')+
            '</wps:spPr><wps:bodyPr/></wps:wsp>'});
    }
    function documentXml(pages){
        if(!pages.length||pages.some(p=>!p.supported))throw new Error('This PDF needs the OCR layout path.');
        const g=geometry(pages);let id=0,image=0;
        const section='<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360"/></w:sectPr>';
        const body=pages.map((p,n)=>'<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>'+(n<pages.length-1?section:'')+'</w:pPr>'+ 
            p.images.map(im=>imageShape(im,++id,'rIdPicture'+(++image),g)).join('')+p.shapes.map(s=>rectangleShape(s,++id,g)).join('')+p.texts.map(t=>textShape(t,++id,g)).join('')+'</w:p>').join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+NS+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:wps="'+shapeUri+'"><w:body>'+body+section+'</w:body></w:document>';
    }
    async function makeWord(pages,options={}){
        const Zip=options.Zip||globalThis.JSZip,zip=new Zip();let image=0;
        zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        const rels=[];for(const p of pages)for(const im of p.images){
            if(!im.dataUrl)throw new Error('A source PDF picture is missing.');
            const n=++image;zip.file('word/media/picture-'+n+'.png',im.dataUrl.split(',')[1],{base64:true});rels.push('<Relationship Id="rIdPicture'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture-'+n+'.png"/>');
        }
        zip.file('word/document.xml',documentXml(pages));zip.file('word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.join('')+'</Relationships>');
        return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
    }
    function preview(pages){
        const g=geometry(pages);return pages.map(p=>'<div style="container-type:inline-size;position:relative;aspect-ratio:595.3/841.9;background:white;color:black;overflow:hidden;margin:12px 0;border:1px solid #ccc">'+ 
            p.images.map(im=>'<img alt="Original PDF illustration" src="'+im.dataUrl+'" style="position:absolute;z-index:0;left:'+100*(g.dx+im.x*g.scale)/595.3+'%;top:'+100*(g.dy+im.y*g.scale)/841.9+'%;width:'+100*im.w*g.scale/595.3+'%;height:'+100*im.h*g.scale/841.9+'%">').join('')+
            p.texts.map(t=>'<span style="position:absolute;z-index:2;white-space:pre;left:'+100*(g.dx+t.x*g.scale)/595.3+'%;top:'+100*(g.dy+t.y*g.scale)/841.9+'%;font-family:'+t.family+';font-size:'+t.size*g.scale/595.3*100+'cqw;font-weight:'+(t.bold?'bold':'normal')+'">'+esc(t.text)+'</span>').join('')+
            p.shapes.map(s=>'<span style="position:absolute;z-index:1;left:'+100*(g.dx+s.x*g.scale)/595.3+'%;top:'+100*(g.dy+s.y*g.scale)/841.9+'%;width:'+100*s.w*g.scale/595.3+'%;height:'+Math.max(.05,100*s.h*g.scale/841.9)+'%;background:'+(s.fill?'#'+s.fill:'transparent')+'"></span>').join('')+'</div>').join('');
    }
    return {scene,geometry,documentXml,makeWord,preview,fontStyle,multiply};
});
