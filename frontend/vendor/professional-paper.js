(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaperAIProfessionalPaper=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const romans=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];
 const instruction=/^(?:Answer\b|Write\b|Name\s+(?:the\s+following|any)\b|Fill\b|Choose\b|Tick\b|Match\b|Cross\b|Unjumble\b|Circle\b|Colou?r\b|Give\b|Mark\b|Locate\b)/i;
 function heading(line){
  const marker=line.match(/^\s*\[\[SECTION_ROW:\s*([\s\S]*?)\s*\|\|\s*([^\]]*)\]\]\s*$/i);
  let title=marker?marker[1]:line.trim(),marks=marker?marker[2].trim():'';
  const equation=title.match(/\s*\[?\(?\s*(\d+(?:[./]\d+)?\s*[x×X*]\s*\d+(?:[./]\d+)?\s*=\s*\d+)\s*\)?\]?\s*$/);
  if(equation){marks=equation[1];title=title.slice(0,equation.index).trim();}
  const prefix=title.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)[.)]?\s+(.*)$/i);
  if(!marker&&!prefix&&!(marks&&instruction.test(title)))return null;
  if(!marker&&prefix&&!instruction.test(prefix[2]))return null;
  return {title,marks,ordinal:prefix?romans.indexOf(prefix[1].toUpperCase())+1:null};
 }
 function format(value){
  const lines=String(value||'').split('\n'),heads=[];
  for(let i=0;i<lines.length;i++){const h=heading(lines[i]);if(h)heads.push({...h,index:i});}
  // Recover only an exactly bounded gap: II + three omitted labels + VI.
  // Never renumber visible labels, guess a missing end label or cross papers.
  for(let i=0;i<heads.length;i++)if(heads[i].ordinal){let j=i+1;while(j<heads.length&&!heads[j].ordinal&&!lines.slice(heads[i].index,heads[j].index).some(x=>/PAPER_BREAK|^Class:/i.test(x)))j++;
   if(j>i+1&&j<heads.length&&heads[j].ordinal-heads[i].ordinal===j-i)for(let k=i+1;k<j;k++){heads[k].ordinal=heads[i].ordinal+k-i;heads[k].title=romans[heads[k].ordinal-1]+'. '+heads[k].title;}
  }
  for(const h of heads)if(h.marks)lines[h.index]='[[SECTION_ROW: '+h.title+' || '+h.marks+']]';
  const out=[];let mode='',lastBlank=false;
  for(const raw of lines){const h=heading(raw);if(h){mode=/^\s*(?:[IVX]+[.)]?\s+)?(?:Answer\b|Write\s+any\b.*\banswers?\b)/i.test(h.title)?'answer':/\bTick\b.*\bcorrect\b/i.test(h.title)?'tick':/Fill.*blanks/i.test(h.title)?'help':/Cross.*odd/i.test(h.title)?'odd':/religious.*national/i.test(h.title)?'festival':'';lastBlank=false;}
   if(/PAPER_BREAK|^Class:/i.test(raw)){mode='';lastBlank=false;}
   const row=raw.match(/^\s*\[\[(?:MATCH_ROW|TABLE_ROW):\s*([\s\S]*?)\]\]\s*$/i);
   if(row&&mode==='answer'){const c=row[1].split(/\s*\|\|\s*/);if(c.length===2&&/^\d+[.)]?\s/.test(c[0])&&/^A\s*:?\s*[_\s]*$/i.test(c[1])){out.push(c[0],'[[ANSWER_LINES: 1]]');lastBlank=true;continue;}}
   if(mode==='answer'&&(/^\s*(?:A\s*:?\s*)?_{3,}\s*$/.test(raw)||/^\s*(?:A\s*:?\s*)?\[\[ANSWER_LINES:\s*\d+\]\]\s*$/.test(raw))){if(!lastBlank)out.push('[[ANSWER_LINES: 1]]');lastBlank=true;continue;}
   if(!raw.trim()&&lastBlank)continue;
   if(mode==='answer'&&/^\s*[-.·]{3,}\s*$/.test(raw))continue;
   if(['answer','tick','help','festival','odd'].includes(mode)&&/^\s*\[\[TABLE_(?:REGION|WIDTHS):/i.test(raw))continue;
   const removeTickBlanks=text=>text.replace(/\[\[CHECKBOX\]\]|[□☐]/g,'').replace(/(?<!\[)\[[\s_—-]*\](?!\])|\([\s_—-]*\)/g,'').replace(/ +/g,' ').trim();
   if(mode==='tick'){
    if(h){out.push(raw.replace(/\bTick\s*\([vV]\)/g,'Tick (✓)'));continue;}
    if(row){out.push(removeTickBlanks(row[1].split(/\s*\|\|\s*/).filter(c=>!/^\s*(?:\[[\s_—-]*\]|\([\s_—-]*\)|[□☐])\s*$/.test(c)).join(' ')));continue;}
    out.push(removeTickBlanks(raw));continue;
   }
   if(mode==='odd'&&!h){
    const words=row?row[1].split(/\s*\|\|\s*/):raw.trim().match(/^(\d+[.)]?\s+\S+)\s+(\S+)\s+(\S+)$/)?.slice(1);
    if(words&&words.length===3){out.push('[[TABLE_WIDTHS: 33,34,33]]','[[MATCH_ROW: '+words.join(' || ')+']]');continue;}
   }
   if(mode==='festival'&&row){const c=row[1].split(/\s*\|\|\s*/);
    if(c.length===4&&/^\d+[.)]/.test(c[0])&&/^\d+[.)]/.test(c[2])){out.push('[[TABLE_WIDTHS: 50,50]]','[[MATCH_ROW: '+c[0]+' [\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0] || '+c[2]+' [\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0]]]');continue;}
       if(c.length===2&&c.every(x=>/^\d+[.)]/.test(x))){out.push('[[TABLE_WIDTHS: 50,50]]',raw);continue;}
   }
   if(mode==='festival'&&/^\s*\]\s*$/.test(raw))continue;
   out.push(raw);lastBlank=false;
  }
  return out.join('\n').replace(/\([\s_—-]*\)/g,'(\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0)').replace(/(?<!\[)\[[\s_—-]*\](?!\])/g,'[\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0]');
 }
 function orderedFormat(value){
  return String(value||'').split(/(\[\[PAPER_BREAK\]\]|(?=^Class:))/gim).map(paper=>{
   let rawLines=paper.split('\n'),rawHeads=rawLines.map((l,index)=>{const h=heading(l);return h?{...h,index}:null;}).filter(Boolean);
   const values=rawHeads.map(h=>h.ordinal),missing=romans.slice(0,Math.max(0,...values)).map((_,i)=>i+1).filter(n=>!values.includes(n));
   if(missing.length===1&&missing[0]===2&&values.filter(n=>n===4).length===2&&rawHeads.some(h=>h.ordinal===4&&/Fill.*blanks/i.test(h.title))){
    const mistaken=rawHeads.find((h,i)=>h.ordinal===4&&/Write\s+any.*answers?/i.test(h.title)&&rawHeads[i-1]?.ordinal===1);
    if(mistaken)rawLines[mistaken.index]=rawLines[mistaken.index].replace(/IV(?=[.)]?\s+Write)/i,'II');
   }
   paper=format(rawLines.join('\n'));
   const lines=paper.split('\n'),sections=[];
   for(let i=0;i<lines.length;i++){const h=heading(lines[i]);if(h)sections.push({...h,index:i});}
   const nums=sections.map(h=>h.ordinal),max=Math.max(0,...nums);
   if(nums.length<2||nums.some(n=>!n)||new Set(nums).size!==nums.length||nums.length!==max)return paper;
   const prefix=lines.slice(0,sections[0].index);
   const blocks=sections.map((h,i)=>({number:h.ordinal,lines:lines.slice(h.index,sections[i+1]?.index??lines.length)})).sort((a,b)=>a.number-b.number);
   return [...prefix,...blocks.flatMap(b=>b.lines)].join('\n');
  }).join('');
 }
 return {heading,format:orderedFormat};
});
