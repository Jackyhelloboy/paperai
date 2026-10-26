(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PaperAIProfessionalPaper=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const roman=n=>{let s='';for(const [v,t] of [[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=v){s+=t;n-=v;}return s;};
 const romans=Array.from({length:100},(_,i)=>roman(i+1));
 const instruction=/^(?:Answer|Write|Name|Fill|Choose|Tick|Match|Cross|Unjumble|Unscramble|Circle|Colou?r|Give|Mark|Locate|Complete|Change|Join|Add|State|Use|Underline|Identify|Rewrite|Make|Say|Look|Read|Arrange|Draw|Label|Find|Put|Select|Form|Separate|Classify|Correct|Count|List)\b/i;
 const score=String.raw`(?:\p{Nd}+(?:[./]\p{Nd}+)?[¼½¾]?|[¼½¾])`;
 const marksAtEnd=new RegExp(String.raw`\s*[\[(]?\s*(${score}\s*[x×X*]\s*${score}\s*=\s*${score}\s*(?:[mM](?:arks?)?\.?)?|${score}\s*(?:[mM](?:arks?)?\.?))\s*[\])]?\s*$`,'u');
 const blankBracket=/\([\s_—-]*\)|(?<!\[)\[[\s_—-]*\](?!\])/g;
 const rowOf=line=>{const m=String(line).match(/^\s*\[\[(TABLE_ROW|MATCH_ROW|CHOICE_ROW|OPTION_ROW):\s*([\s\S]*)\]\]\s*$/i);return m?{kind:m[1].toUpperCase(),cells:m[2].split(/\s*\|\|\s*/)}:null;};
 const compact=s=>s.replace(/\s+/g,'').replace(/[.:;]+$/,'').toLowerCase();
 function heading(line){
  const marker=String(line).match(/^\s*\[\[(?:SECTION_ROW|TABLE_ROW|MATCH_ROW):\s*([\s\S]*?)\s*\|\|\s*([^|]*?)\]\]\s*$/i);
  let title=marker?marker[1]:String(line).trim(),marks=marker?marker[2].trim():'';
  if(marker&&!/^\s*\[\[SECTION_ROW:/i.test(line)&&!marksAtEnd.test(' '+marks))return null;
  const equation=title.match(marksAtEnd);
  if(equation){marks=equation[1].trim();title=title.slice(0,equation.index).trim();}
  // Normalize only the numeral glyphs, never the question's Unicode text.
  title=title.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+/u,m=>m.normalize('NFKC'));
  // A repeated plain instruction before its numbered copy is OCR decoration.
  const duplicate=title.match(/^(.+?)\s+([IVXLCDM]+[.)]?\s+)(.+)$/i);
  if(duplicate&&instruction.test(duplicate[1])&&compact(duplicate[1])===compact(duplicate[3]))title=duplicate[2]+duplicate[3];
  const prefix=title.match(/^([IVXLCDM]+)[.)]?\s+(.+)$/i);
  const body=prefix?prefix[2]:title;
  const nativeInstruction=/[\u0900-\u0D7F\u0600-\u06FF]/u.test(body)&&(prefix||marker);
  if(!instruction.test(body)&&!nativeInstruction&&!(marker&&/^\s*\[\[SECTION_ROW:/i.test(line)))return null;
  if(!marker&&!prefix&&!marks)return null;
  return {title,marks,ordinal:prefix?(romans.indexOf(prefix[1].toUpperCase())+1||null):null,body};
 }
 function type(h){
  const s=h.body||h.title;
  if(/जोड़ी|मिलान|జతపరచ|జత చేయ|పోల్చ|பொருத்து|இணை|ಹೊಂದಿಸಿ|ಜೋಡಿಸಿ|ചേർക്കുക|യോജിപ്പിക്കുക|মেলাও|মেলান|જોડો|ਮਿਲਾਓ|ملا[ؤو]/u.test(s))return 'matching';
  if(/प्रश्नों? के उत्तर|प्रश्न.*उत्तर.*लिख|ప్రశ్నల.*జవాబ|ప్రశ్నల.*సమాధాన|வினாக்கள.*விடை|ಪ್ರಶ್ನೆ.*ಉತ್ತರ|ചോദ്യ.*ഉത്തര|প্রশ্ন.*উত্তর|પ્રશ્ન.*જવાબ|سوال.*جواب/u.test(s))return 'answer';
  if(/खाली स्थान|रिक्त स्थान|वचन|विलोम|अर्थ लिख|ఖాళీ.*పూరించ|ఖాళీ.*నింప|கோடிட்ட இட|விடுபட்ட இட|ಖಾಲಿ.*ತುಂಬ|ഒഴിഞ്ഞ.*പൂരിപ്പ|শূন্যস্থান|ખાલી જગ્યા|خالی جگہ/u.test(s))return 'completion';
  if(/సరైన.*ఎంచుకో|సరైన.*గుర్తించ|சரியான.*தேர்ந்தெடு|ಸರಿಯಾದ.*ಆಯ್ಕೆ|ശരിയായ.*തിരഞ്ഞെടു|সঠিক.*নির্বাচন|صحیح.*منتخب/u.test(s))return 'choice';
  if(/\bmatch\b|\bcolumn\s+A\b.*\bcolumn\s+B\b/i.test(s))return 'matching';
  if(/\b(?:tick|choose|select)\b.*\b(?:correct|right|options?|answers?)\b/i.test(s))return 'choice';
  if(/^Cross\b.*\bodd\b/i.test(s))return 'odd';
  if(/religious.*national/i.test(s))return 'festival';
  if(/\b(?:degrees|comparative|superlative)\b/i.test(s))return 'table';
  if(/\b(?:letter|paragraph|essay|story|card)\b/i.test(s))return 'composition';
  if(/^(?:Answer\b(?!.*\b(?:adding|brackets|action words)\b)|Write\s+any\b.*\banswers?\b)/i.test(s))return 'answer';
  if(/^Rewrite\b|^Join\b.*\bsentences\b|^Change\b.*\bsentences\b/i.test(s))return 'rewrite';
  if(/\b(?:box|blanks?|complete|missing|unscramble|unjumble|opposites?|plural|prefix|nouns?|verbs?|adverbs?)\b/i.test(s))return 'completion';
  if(/\b(?:true|false|yes|no)\b/i.test(s))return 'boolean';
  return 'plain';
 }
 const emitHeading=h=>'[[SECTION_ROW: '+h.title.replace(/\bTick\s*\([vV]\)/g,'Tick (✓)')+' || '+h.marks+']]';
 function prepare(value){
  const lines=String(value||'').split('\n');
  for(let i=0;i<lines.length;i++){
   let h=heading(lines[i]);
   // Join a wrapped instruction only up to its explicit trailing score.
   if(h&&!h.marks&&!lines[i].includes('[['))for(let j=i+1;j<Math.min(i+4,lines.length);j++){
    if(!lines[j].trim()||/^(?:\p{Nd}+[.)]?\s|\[\[|Class:|Subject:)/iu.test(lines[j].trim())||heading(lines[j]))break;
    const joined=heading(lines.slice(i,j+1).join(' '));
    if(joined?.marks){lines[i]=emitHeading(joined);for(let k=i+1;k<=j;k++)lines[k]='';h=joined;break;}
   }
   if(h){lines[i]=emitHeading(h);const previous=lines[i-1]?.trim();if(previous&&compact(previous)===compact(h.body))lines[i-1]='';}
  }
  return lines;
 }
 function formatPaper(value){
  const lines=prepare(value),heads=[];
  for(let i=0;i<lines.length;i++){const h=heading(lines[i]);if(h)heads.push({...h,index:i});}
  // Source labels and order are evidence. Uncertain labels are flagged, never invented.
  for(const h of heads)lines[h.index]=emitHeading(h);
  const out=[];let mode='',lastRule=false;
  for(let i=0;i<lines.length;i++){
   const raw=lines[i],h=heading(raw),row=rowOf(raw);
   if(h){mode=type(h);lastRule=false;out.push(emitHeading(h));continue;}
   if(/PAPER_BREAK|^Class:/i.test(raw)){mode='';lastRule=false;}
   if(['answer','rewrite','choice','completion','festival','odd'].includes(mode)&&/^\s*\[\[TABLE_(?:REGION|WIDTHS):/i.test(raw))continue;
   const answer=mode==='answer'||mode==='rewrite';
   if(answer&&row&&row.cells.length===2&&/^\p{Nd}+[.)]?\s/u.test(row.cells[0])&&/^A\s*:?\s*[_\s]*$/i.test(row.cells[1])){out.push(row.cells[0],'[[ANSWER_LINES: 1]]');lastRule=true;continue;}
   const explicitRule=raw.match(/^\s*(?:A\s*:?\s*)?\[\[ANSWER_LINES:\s*(\d+)\]\]\s*$/i);
   if(answer&&(explicitRule||/^\s*(?:A\s*:?\s*)?_{3,}\s*$/.test(raw))){if(!lastRule)out.push('[[ANSWER_LINES: '+1+']]');lastRule=true;continue;}
   if(answer&&/^\s*[-.·]{3,}\s*$/.test(raw))continue;
   if(!raw.trim()&&lastRule)continue;
   if(mode==='choice'&&/^\s*\d+[.)]\s*$/.test(raw)){
    // Repair a fully bounded orphan-label block only when every label has
    // exactly one following text row. Never guess missing option labels.
    const labels=[raw.trim()];let j=i+1;
    while(j<lines.length&&/^\s*[a-d][.)]\s*$/i.test(lines[j]))labels.push(lines[j++].trim());
    while(j<lines.length&&!lines[j].trim())j++;
    const rows=lines.slice(j,j+labels.length).map(rowOf);
    if(labels.length>=3&&rows.length===labels.length&&rows.every(r=>r&&r.cells[0].trim()&&!r.cells[0].includes('[[')&&r.cells.slice(1).every(c=>/^[\s()[\]_—-]*$/.test(c)))){
     out.push(labels[0]+' '+rows[0].cells[0]);
     out.push('[[CHOICE_ROW: '+rows.slice(1).map((r,k)=>labels[k+1]+' '+r.cells[0]).join(' || ')+']]');
     i=j+labels.length-1;continue;
    }
   }
   if(mode==='choice'){
    // Slash alternatives are inline question content. Lettered options retain
    // their original response spaces and are never turned into matching rows.
    const text=row?row.cells.filter(Boolean).join(' '):raw;
    if(text.includes('/')&&!text.includes('[[SOURCE_')&&!text.includes('[[FIGURE')){out.push(text.replace(blankBracket,'').replace(/[□☐]/g,'').replace(/ +/g,' ').trim());lastRule=false;continue;}
    if(row&&['MATCH_ROW','TABLE_ROW'].includes(row.kind)){
     const c=row.cells;
     if(/^\p{Nd}+[.)]?\s/u.test(c[0])&&c.slice(1).some(x=>/^\(?[a-d][.)]\s/i.test(x))){out.push(c[0]);const options=c.slice(1).filter(x=>x.trim()&&!/^[\s()[\]_—-]*$/.test(x));out.push('[[CHOICE_ROW: '+options.join(' || ')+']]');continue;}
     if(c.every(x=>!x.trim()||/^\(?[a-d][.)]\s/i.test(x))){out.push('[[CHOICE_ROW: '+c.filter(Boolean).join(' || ')+']]');continue;}
    }
   }
   if(mode==='odd'){
    const words=row?row.cells:raw.trim().match(/^(\p{Nd}+[.)]?\s+\S+)\s+(\S+)\s+(\S+)$/u)?.slice(1);
    if(words&&words.length===3){out.push('[[TABLE_WIDTHS: 33,34,33]]','[[MATCH_ROW: '+words.join(' || ')+']]');continue;}
   }
   if(mode==='festival'&&row){const c=row.cells;
    if(c.length===4&&/^\d+[.)]/.test(c[0])&&/^\d+[.)]/.test(c[2])){out.push('[[TABLE_WIDTHS: 50,50]]','[[MATCH_ROW: '+c[0]+' (        ) || '+c[2]+' (        )]]');continue;}
    if(c.length===2&&c.every(x=>/^\d+[.)]/.test(x))){out.push('[[TABLE_WIDTHS: 50,50]]',raw);continue;}
   }
   if(mode==='festival'&&/^\s*\]\s*$/.test(raw))continue;
   // An unmarked help box must not expose protocol separators to teachers.
   if(mode==='completion'&&!raw.includes('[[')&&raw.includes('||')&&!/^\d+[.)]/.test(raw.trim())){out.push('[[TABLE_ROW: '+raw.split(/\s*\|\|\s*/).filter(Boolean).join(' || ')+']]');continue;}
   out.push(raw);lastRule=false;
  }
  const spaced=[];let written=false,pending=false,hasRule=false;
  const finishAnswer=()=>{if(pending&&!hasRule)spaced.push('[[ANSWER_LINES: 1]]');pending=false;hasRule=false;};
  for(const line of out){
   const h=heading(line),boundary=/PAPER_BREAK|^Class:/i.test(line);
   if(h||boundary){finishAnswer();written=h&&['answer','rewrite'].includes(type(h));}
   else if(written&&/^\s*\p{Nd}+[.)]?\s+\S/u.test(line)){finishAnswer();pending=true;}
   if(pending&&/ANSWER_LINES:|_{3,}/.test(line))hasRule=true;
   spaced.push(line);
  }
  finishAnswer();
  return spaced.join('\n').replace(/\([\s_—-]*\)/g,'(\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0)').replace(/(?<!\[)\[[\s_—-]*\](?!\])/g,'[\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0]');
 }
 function format(value){return String(value||'').split(/(\[\[PAPER_BREAK\]\]|(?=^Class:))/gim).map(formatPaper).join('');}
 function validate(value){
  const issues=[];let mode='',title='',items=0,blanks=0;
  const finish=()=>{if(items&&['completion','boolean'].includes(mode)&&!blanks)issues.push({code:'missing_answer_spaces',section:title,message:'Check answer spaces against the source.'});};
  for(const line of String(value||'').split('\n')){
   const h=heading(line);if(h){finish();mode=type(h);title=h.title;items=0;blanks=0;if(!h.ordinal)issues.push({code:'section_number',section:title,message:'Check the section number against the source.'});continue;}
   if(/^Class:|PAPER_BREAK/i.test(line)){finish();mode='';items=0;blanks=0;}
   if(/^\s*\p{Nd}+[.)]?\s/u.test(line))items++;
   if(/_{2,}|\.{3,}|ANSWER_LINES|\([\s—-]*\)|\[[\s—-]*\]/.test(line))blanks++;
   if(mode==='choice'&&/^\s*\[\[MATCH_ROW:/.test(line))issues.push({code:'choice_layout',section:title,message:'Check option labels and their question.'});
  }
  finish();return issues;
 }
 return {heading,type,format,validate};
});
