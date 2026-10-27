// AI may propose geometry only. Never let a model rewrite question text.
export const LAYOUT_KINDS=new Set(['pictures','matching','mcq','true_false','fill_blanks','translation','written','table','other']);

function visibleFigureCount(line){
  let count=0;
  for(const marker of String(line||'').matchAll(/\[\[SOURCE_FIGURE(?:_ROW)?:\s*([^\]\n]+)\]\]/gi)){
    count+=marker[1].split(/\s*\|\|\s*/).filter(Boolean).length;
  }
  return count;
}

function explicitRowWidth(line){
  let widest=0;
  for(const marker of String(line||'').matchAll(/\[\[SOURCE_FIGURE_ROW:\s*([^\]\n]+)\]\]/gi)){
    widest=Math.max(widest,marker[1].split(/\s*\|\|\s*/).filter(Boolean).length);
  }
  return widest;
}

export function layoutSections(text){
  const sections=[];let current=null;
  for(const line of String(text||'').split('\n')){
    const row=line.match(/^\s*\[\[SECTION_ROW:\s*([^|\]]+?)(?:\s*\|\|[^\]]*)?\]\]\s*$/i);
    const plain=line.match(/^\s*([IVX]{1,6})[.)]?\s+([^\n]{3,140})$/i);
    if(row||plain){
      const title=(row?row[1]:plain[0]).trim();
      current=sections.find(s=>s.title===title)||null;
      if(!current&&sections.length<40){current={index:sections.length,title,imageCount:0,maxSourceRowColumns:0};sections.push(current);}
    }
    if(current){
      current.imageCount=Math.min(100,current.imageCount+visibleFigureCount(line));
      current.maxSourceRowColumns=Math.max(current.maxSourceRowColumns,explicitRowWidth(line));
    }
  }
  return sections;
}

export function safeLayoutPlan(proposal,sections){
  const byTitle=new Map(sections.map(s=>[s.title,s]));
  const rows=Array.isArray(proposal?.sections)?proposal.sections:[];
  return rows.slice(0,80).flatMap(row=>{
    if(!row||typeof row.title!=='string'||!byTitle.has(row.title)||!LAYOUT_KINDS.has(row.kind))return [];
    const evidence=byTitle.get(row.title),count=Math.max(0,Math.min(100,Number(evidence.imageCount)||0));
    const requested=Number(row.imageColumns);
    const explicit=Math.max(0,Math.min(5,Number(evidence.maxSourceRowColumns)||0));
    // Never allocate a wide image grid for an absent source illustration.
    // Explicit source rows outrank the AI: a 2+2 grid stays two columns.
    // Two or more real pictures should be side-by-side. Preserve section kind
    // because matching, choice and word exercises may also contain images.
    const columns=count===0?5:count===1?1:explicit>=2?explicit:
      Number.isInteger(requested)?Math.max(2,Math.min(5,count,requested)):Math.min(5,count);
    const kind=row.kind==='pictures'&&count===0?'other':row.kind;
    return [{title:row.title,kind,imageColumns:columns}];
  }).filter((row,index,all)=>all.findIndex(item=>item.title===row.title)===index);
}
