// A conservative, read-only quality gate. The uploaded paper remains the truth.
export function localPrintIssues(text,continuation=false) {
  const value=String(text||''), lines=value.split(/\r?\n/), issues=[];
  const add=(severity,category,evidence,detail)=>issues.push({severity,category,evidence,detail});
  const opening=(value.match(/\[\[SECTION_ROW:\s*I(?:[.)\s]|\s*\|\|)/gi)||[]).length;
  if(!continuation && !opening && !/^\s*I[.)\s]+\S/m.test(value))add('review','sections','Bit I','Opening Bit I was not found. Check the source PDF before printing.');
  if(/\[unclear(?::[^\]\n]*)?\]|\ufffd/i.test(value))add('review','ocr','[unclear]','Uncertain OCR characters must be checked against the source.');
  if(/\[\[PICTURE(?:_ROW|_OPTION)?:/i.test(value))add('review','images','[[PICTURE: …]]','A picture placeholder still needs a real illustration.');
  const sourceIds=[...value.matchAll(/\[\[SOURCE_FIGURE(?:_ROW)?:\s*([^\]]+)\]\]/gi)];
  for(const m of sourceIds){
    const count=m[1].split(/\s*\|\|\s*/).filter(Boolean).length;
    if(count>5)add('review','images',m[0].slice(0,100),'Image row exceeds the five-column print grid.');
  }
  const questions=lines.filter(line=>/^\s*(?:[0-9०-९]+[.)]|\[\[(?:QUESTION_ROW|MATCH_ROW|CHOICE_ROW|QA_ROW):)/iu.test(line)).length;
  if(!questions)add('review','questions','Question numbering','No clearly numbered question items were detected. Compare with every source page.');
  return issues.slice(0,20);
}

export function sanitizePrintIssues(items,text,max=10){
  if(!Array.isArray(items))return [];
  const original=String(text||'');
  return items.slice(0,max*3).map(item=>({
    severity:item?.severity==='critical'?'critical':'review',
    category:['sections','questions','marks','alignment','images','pages','language','ocr'].includes(item?.category)?item.category:'alignment',
    evidence:String(item?.evidence||'').slice(0,140),
    detail:String(item?.detail||'').slice(0,250),
  })).filter(item=>item.evidence && original.includes(item.evidence) && item.detail).slice(0,max);
}
