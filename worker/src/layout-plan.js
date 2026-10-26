// AI may propose geometry only. Never let a model rewrite question text.
export const LAYOUT_KINDS=new Set(['pictures','matching','mcq','true_false','fill_blanks','translation','written','table','other']);
export function layoutSections(text){
  const sections=[];let index=0;
  for(const line of String(text||'').split('\n')){
    const row=line.match(/^\s*\[\[SECTION_ROW:\s*([^|\]]+?)(?:\s*\|\|[^\]]*)?\]\]\s*$/i);
    const plain=line.match(/^\s*([IVX]{1,6})[.)]?\s+([^\n]{3,140})$/i);
    if(row||plain){
      const title=(row?row[1]:plain[0]).trim();
      if(!sections.some(s=>s.title===title))sections.push({index:index++,title});
    }
  }
  return sections.slice(0,40);
}
export function safeLayoutPlan(proposal,sections){
  const byTitle=new Map(sections.map(s=>[s.title,s]));
  const rows=Array.isArray(proposal?.sections)?proposal.sections:[];
  return rows.slice(0,80).flatMap(row=>{
    if(!row||typeof row.title!=='string'||!byTitle.has(row.title)||!LAYOUT_KINDS.has(row.kind))return [];
    const columns=Number(row.imageColumns);
    return [{title:row.title,kind:row.kind,imageColumns:Number.isInteger(columns)?Math.max(1,Math.min(5,columns)):5}];
  }).filter((row,index,all)=>all.findIndex(item=>item.title===row.title)===index);
}
