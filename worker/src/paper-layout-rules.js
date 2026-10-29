// Reference-driven structure rules for training/*.docx and training/*.pdf.
// Formatting adaptation, not model-weight fine-tuning. The current page wins.
export const PAPER_LAYOUT_RULES = `
REFERENCE QUESTION-PAPER LAYOUT RULES (version 9, reviewed against scanned multi-class papers):
- Treat each Roman-numbered bit/section as one source unit. Transcribe its printed Roman label, instruction, marks, questions, options, word bank and answer spaces exactly once, in physical order. A repeated heading paraphrase is an OCR duplicate, not an extra bit. Never merge adjacent bits or move an item across their boundary. If the source repeats a number or has a marks/count inconsistency, preserve it and never repair it from expectation.
- A scanned page is not necessarily a new paper. A new paper begins only when the visible source starts a fresh title/Class/Subject and first bit (normally I); continuation pages retain the preceding paper identity. Keep Class and Subject exactly as written on the actual new-paper header, including Roman numerals. If either is unreadable, leave it blank or [unclear]; do not borrow it from another page, another class or the training corpus. Discard repeated student-field forms on continuation pages from the clean question body.
- Decide layout by visible borders and alignment. Ruled notebook background never creates a table. Multiple-choice a/b/c options and true/false brackets are question content, not a bordered table. Keep each option with its own question; make a table only when actual cell borders are drawn. Never invent an extra name/roll/marks table inside a bit.
- For each bit, cross-check the first and last physical item, numbering and any mark against this page before returning it. Do not supply answers, fill word blanks, infer a missing question, correct source spelling, or replace a difficult word with a likely textbook phrase. Use [unclear] for unreadable source strokes.
- Output editable text, native table/grid markers, and basic geometric shapes. Do not describe drawings as words or supply answers.
- Count PHYSICAL cell borders, not expected answer counts. A to Z does NOT imply 26 cells. Notebook ruling through a drawn box does NOT imply a second grid row. Ignore background notebook margins and ruled lines.
- Never split matching columns into alternating lines. Emit MATCH_ROW with ALL visible columns, including the middle blank bracket column: [[MATCH_ROW: 1. visible item || (   ) || a. visible option]]. Keep original row order; never solve the match. Pictures may occupy individual matching cells using FIGURE markers.
- When two or three separate short numbered questions share one unbordered horizontal row, use MATCH_ROW with each complete visible question and its blank answer space in its own cell. This marker represents physical columns, not solved matching. Preserve row-major reading order and the actual numbering, including source numbering mistakes. Do not stack the columns vertically or renumber them.
- Every section and its right-aligned marks use SECTION_ROW even if handwritten. Use exactly two fields: [[SECTION_ROW: I. full instruction including its section number || exact marks]]. Never split the Roman section number into a separate field. The literal flag none belongs only to geometry controls, never to question/section text or marks. Preserve marks literally. Keep the grid or first question directly after its section.
- Reference scans contain easily confused Devanagari forms: श्र versus ज्ञ, the isolated vowel sign ू versus the digit २, and े versus ै. Inspect the actual strokes independently. A conventional alphabet endpoint or a familiar word is not evidence; do not substitute a conventional form, complete a sequence, or solve a word-building question.
- In letter-building exercises, read EACH component between plus signs independently. An isolated vowel sign such as ा, ि, ी, ु, ू, ृ, े, ै, ो, ौ, ं, ँ or ः is question data even without a preceding consonant. Do not replace it with a lookalike consonant such as ण or a digit; do not emit a dotted-circle character that is absent from the source. Count repeated consonant strokes against the image: one written letter must not become two, and genuinely repeated letters must stay repeated. Keep irregular/repeated question numbers exactly as printed instead of repairing their sequence.
- Enlarged detail views may brighten a gray photographed page using a soft contrast adjustment. They are overlapping copies of the same source regions, not additional questions or pages. The original full-page image remains authoritative for colored corrections, completed responses and illustration bounds.
- Read the full page and keep intentional blank answer rules. Do not duplicate a source footer in the question body: use [[FOOTER: left text || center text]] for a clearly separate printed page footer, omitting its printed page number (the exporter supplies a live page field).
- First classify each visual region as actual illustration versus printed question/option text. Text, even inside a box, column, unusual font, faint scan, or beside an answer circle, MUST be transcribed as editable text/CHOICE_ROW/MATCH_ROW, not cropped as FIGURE, FIGURE_ROW, SOURCE_FIGURE, or an entire screenshot. If a region mixes a diagram and text, crop only the diagram while transcribing the outside question/option text separately. A failed OCR reading is not evidence that text is a picture. Ask the second visual reader to resolve unclear letters before treating the region as a figure.
- For an ACTUAL drawing, illustration, map, graph or complex diagram, preserve the original pixels using a crop marker. Coordinates are x,y,width,height integers on the exact displayed image, normalized to 0–1000, origin TOP LEFT. Bound ONLY the illustration, including its diagram labels; exclude surrounding question text. Do not replace it with a generic picture.
- Single illustration: [[FIGURE: 100,250,180,120|visible caption|none]]. Blank caption is valid. Use box instead of none ONLY for a visible answer box belonging to this illustration.
- Picture-cell ownership is mandatory: each exercise illustration keeps its own visible item number, caption, missing-letter blank or option group. Never combine several numbers/options into a shared caption or attach one picture’s letters to the next picture. Keep an explicit line break between a picture number and its options. Inspect every source picture independently and count all illustrations before emitting the row.
- Several illustrations across one row: [[FIGURE_ROW: 100,250,180,120|1.|box || 400,250,180,120|2.|box]]. Each cell has its OWN crop. Exactly preserve the visible illustration count and row order. Never emit each picture as a separate one-picture FIGURE when several pictures share a row. Use at most five picture cells per row, continuing left to right on the next row. Put separately printed words below pictures in the caption, spelled exactly as visible; never infer object names.
- In counting exercises, all repeated drawings belonging to ONE numbered problem form ONE crop. Keep every object and its strokes inside that crop. Preserve the original vertical question rows; do not turn each repeated object into a new question or supply its count. Keep the separately written equals sign and blank answer rule as editable text outside the crop.
- Keep internal diagram labels, abacus rods/beads and number-strip ticks inside their illustration crop. Do not transcribe those same labels again as external captions or crop only one fragment of the diagram.
- Written requests such as 'tiger pic' with NO actual illustration still use PICTURE markers; these are unfulfilled author instructions, not original picture assets. The exporter flags them for review. Bundled training placeholder images are not verified original illustrations; do not substitute them for arbitrary animals/plants or invent default pictures. Only use an exact teacher-supplied asset when an explicit picture request identifies it unambiguously.
- Basic circle/square/rectangle/triangle/cube outlines are SHAPE_ROW and stay editable shapes. Specify the observed answer space per shape: [[SHAPE_ROW: circle|none || square|box || triangle|line]]. none means no answer space, box means a visible blank box, line means a visible answer rule. Do not add a box merely because the question asks to name the shape. Complex shapes, shaded fractional shapes, cones and labelled geometrical diagrams use FIGURE crops instead of guessed geometry.
- When a table has a picture beside it, emit [[TABLE_REGION: x,y,width,height]] immediately before the table using the same normalized page coordinates as FIGURE. Emit the adjacent FIGURE immediately after the last TABLE_ROW, preserving its exact bounds. The exporter keeps this observed side-by-side composition; do not move the figure to a new row. Do not invent table bounds when uncertain.
- Bordered tables use TABLE_ROW for every row, including empty first/last cells. Preserve multiline cell contents with the explicit <br> separator, NOT extra rows. Use TABLE_WIDTHS: percentages separated by commas on a preceding marker line ONLY if the visible column proportions are clear.
- Use [[TABLE_HEADER: 1]] before a table ONLY when its first row contains visible column headings. Ordinary exercise rows and partially filled comparison tables are not headers. Never fill missing comparative forms, missing letters, number grids, matching answers or arithmetic results.
- Vertically stacked arithmetic is not ordinary prose. Emit [[ARITHMETIC_ROW: 34<br>+ 12<br>___ || 68<br>- 21<br>___]] with one cell per original problem and <br> between its observed lines. Preserve every operand, operator and visible answer rule; never calculate the answers. H/T/O labels above unbordered arithmetic stay in that arithmetic cell, not a bordered table. Use TABLE_ROW for a visibly bordered place-value chart; notebook ruling alone does not establish table borders.
- An individual question with a separate right-side mark uses [[QUESTION_ROW: exact question || exact mark]]. Fractions such as ½ and equations such as 4×½=2 must remain literal.
- A clearly visible original printed page number uses [[SOURCE_PAGE: integer]] control metadata. Never invent a page number. Read physical multi-column rows left to right; keep original question numbers, including mistakes. Never renumber column-major text into a new question order.
- Repeated headers indicate a new question paper only when visibly present. Read continuous questions across scan pages in order. Do not invent exam titles or copy a school banner from another page or reference.
- Output the question paper alone. Do not add assistant answers, solutions, answer keys, encouragement, formatting suggestions or explanatory introductions. Remove completed answers, worked solutions, answer keys and grading comments from answer positions; restore those spaces as blanks. Preserve question operands, examples, options, word banks and matching choices: these are question content, not completed answers. Resolve handwritten question corrections to the intended final wording automatically; omit cancelled drafts and insert the final replacement naturally. Do not emit editorial STRIKE, DOUBLE-STRIKE, REPLACE, INSERT or HIGHLIGHT markers.
- Determine answer positions from visible source layout. Handwriting or an answer-like word alone is not evidence of a completed response. Preserve a complete question sentence before its separate answer rule, including clues and true/false statements; never replace words inside that sentence with blanks. When the boundary is uncertain, retain the source wording. Preserve the count and grouping of separate missing-letter positions.
- Writing instructions: distinguish alphabet writing, missing-letter completion, tracing and word-building in every script. Preserve literal endpoints, do not put solved letters in empty boxes. Use source-observed cells first. Never infer letter counts from marks alone; ambiguous alphabet conventions/endpoints require teacher review. Verify every visible section/item and its own marks against pixels, including page joins; recover missed source content rather than inventing questions or marks.
- Full-width ANSWER_LINES are allowed only for written question-and-answer bits. Do not add them to matching, fill-in blanks, opposites, gender changes, sentence usage, multiple choice or yes/no bits. Preserve inline blanks, brackets, letter grids and picture options exactly.
- Letter grids use GRID or consecutive GRID_ROW markers. Up to 52 columns, 32 rows, 600 cells. Use only observed counts; uncertain borders remain [unclear]. Never turn ordinary notebook lines into ANSWER_LINES.
- CLEAN EXAM OUTPUT OVERRIDE: Omit school logos, school-name banners, addresses, printed administrative Name/Roll/Date/Signature/Time/Total Marks boxes and notebook page furniture. Never output BANNER for these. Preserve visible Class and Subject as plain editable labels for identifying the paper, never as a grid. Preserve the actual exam title at the beginning, section instructions, section marks, questions, options, help boxes, matching columns, maps and illustrations. Preserve source wording literally, including grammar and spelling; never rewrite a question to improve it. All classes can occur in one PDF; changing class starts a separate paper, not a continuation.
- PROFESSIONAL EXPORT: Read every section number carefully, including III/IV/V and continuations. Preserve all original question numbers. Use SECTION_ROW with the complete instruction and separate literal marks, even when its closing bracket is faint. Empty response brackets contain spaces, never underscores. Slash alternatives remain inside their question sentence. Lettered MCQ options use CHOICE_ROW and never MATCH_ROW. For figure crops, independently verify the whole outline and caption against the full-page image; never crop only a cap fragment or include unrelated notebook words. Preserve all visible illustration strokes without replacing pixels.
- SECTION TYPES: Identify the instruction before choosing layout. Answer/rewrite questions use a full-width answer rule below each question when the source requests one. Matching alone pairs left items with right options; keep the original unmatched order. MCQ has one numbered stem followed by its attached a/b/c/d choices. Fill blanks, missing letters, question tags and grammar exercises preserve every original blank exactly where it appears; never supply a missing article, word, letter or answer. Genuine comparison tables retain all columns and empty cells. Letters/cards retain their original template and blanks. Unknown exercise types retain their original text and physical grouping rather than defaulting to matching.
- Preserve Roman section labels beyond XV, including XVI and XVII. Recognize instructions such as Unscramble, Complete, Change, Join, Add, State, Use, Underline, Identify and all non-English instructions as section headings. Preserve M., Marks., fractions and trailing score punctuation. Keep one heading and one score; do not repeat either as prose.
- Read ALL dark front-side handwritten Hindi questions from the top to the bottom, including the first answer section and word-meaning headings. Do not discard question rows as administrative headers. Read matras, anusvara, chandrabindu and nukta from strokes; never replace an unfamiliar word with a guessed correction. Faint reverse-side show-through is not question content.
- Teacher notes about answer space are formatting directions: omit the note itself and use one full-width ANSWER_LINES rule below each affected written-answer question, following the selected single-line paper format. Ordinary notebook ruling is not an answer rule. A written "kite pic" or other explicit object-picture request is NOT a source drawing: preserve its exact words and keep it in its own bit so a labelled default illustration can be supplied. Never borrow a drawing from the next bit to fill an earlier picture request. Do not infer an object when the request is unreadable; leave a review placeholder.
- Picture ownership follows section instructions and their source boundaries. A new instruction such as "look at the following pictures and write their names" starts a separate exercise even if its Roman heading is faint. Keep its actual drawings and answer spaces together. A later "circle the first letter of the picture's name" instruction starts another exercise: pair each drawing with ONLY its own visible letter options directly beneath it; never turn the options into picture captions or detach them into prose. Preserve observed 3-across and 2-by-2 drawing groups and reading order; do not invent Hindi letters or solve the questions.
- Word banks belong with their own section on the left, with every supplied word preserved. Do not solve a word bank or change it because it seems wrong. Preserve a matching option label together with its text; it is not a separate blank answer column.
- These reference rules govern representation and layout only. Never copy questions, school identities, dates, marks or answers from a different training paper.
`;

    function normaliseRecognitionMarkup(value) {
        // Some readers emit a small HTML table instead of the row protocol.
        // Parse only complete, unambiguous forms as text; never evaluate HTML,
        // strip arbitrary tags, decode angle entities, or guess merged cells.
        let text=String(value||'').replace(/&(?:nbsp|#160|#x0*a0);/gi,'\u00a0');
        text=text.replace(/\\hspace\*?\{\s*(\d+(?:\.\d+)?)\s*cm\s*\}/gi,(_,cm)=>'_'.repeat(Math.max(4,Math.min(24,Math.round(Number(cm)*4)))))
            .replace(/\\underline\{([^{}]*)\}/gi,'$1').replace(/\\underline\{([^{}]*)\}/gi,'$1')
            .replace(/\\hline\b/gi,'').replace(/\\n\b/g,'<br>');
        const cell=value=>String(value).replace(/[ \t]*\r?\n[ \t]*/g,' ').trim();
        const row=body=>'[[TABLE_ROW: '+cell(body)+']]';
        const htmlRows=body=>{
            const rows=[];let rest=body.trim();
            while(rest){
                const native=rest.match(/^<TABLE_ROW\s*>([\s\S]*?)<\/TABLE_ROW\s*>/i);
                if(native){if(/<\/?TABLE_ROW\b/i.test(native[1]))return null;rows.push(row(native[1]));rest=rest.slice(native[0].length).trim();continue;}
                const tr=rest.match(/^<tr\s*>([\s\S]*?)<\/tr\s*>/i);
                if(!tr)return null;
                const cells=[];let contents=tr[1].trim();
                while(contents){
                    const td=contents.match(/^<(td|th)\s*>([\s\S]*?)<\/\1\s*>/i);
                    if(!td||/<\/?(?:table|tr|td|th)\b/i.test(td[2])||td[2].includes('|'))return null;
                    cells.push(cell(td[2]));contents=contents.slice(td[0].length).trim();
                }
                if(!cells.length)return null;
                rows.push('[[TABLE_ROW: '+cells.join(' || ')+']]');rest=rest.slice(tr[0].length).trim();
            }
            return rows.length?rows.join('\n'):null;
        };
        const region=body=>{
            if(!/^\s*\d{1,4}\s*,\s*\d{1,4}\s*,\s*\d{1,4}\s*,\s*\d{1,4}\s*$/.test(body))return null;
            const [x,y,w,h]=body.split(',').map(Number);
            return w>0&&h>0&&x+w<=1000&&y+h<=1000?'[[TABLE_REGION: '+[x,y,w,h].join(',')+']]':null;
        };
        text=text.replace(/(^|\n)[ \t]*<TABLE_REGION:\s*([^<>\n]+)>([\s\S]*?)<\/TABLE_REGION\s*>[ \t]*(?=\n|$)/gi,
            (whole,prefix,bounds,body)=>{const marker=region(bounds);return marker?prefix+marker+'\n'+body.trim():whole;});
        text=text.replace(/(^|\n)[ \t]*<TABLE_REGION:\s*([^<>\n]+)>[ \t]*(?=\n|$)/gi,
            (whole,prefix,bounds)=>{const marker=region(bounds);return marker?prefix+marker:whole;});
        text=text.replace(/(^|\n)[ \t]*<table\s*>([\s\S]*?)<\/table\s*>[ \t]*(?=\n|$)/gi,
            (whole,prefix,body)=>{const rows=htmlRows(body);return rows===null?whole:prefix+rows;});
        text=text.replace(/(^|\n)[ \t]*<TABLE_ROW\s*>([\s\S]*?)<\/TABLE_ROW\s*>[ \t]*(?=\n|$)/gi,
            (whole,prefix,body)=>/<\/?TABLE_ROW\b/i.test(body)?whole:prefix+row(body));
        // <br> is an intentional separator inside native row cells. Outside
        // those cells it is a text line break, not printable markup.
        let output='',cursor=0;const stack=[];
        while(cursor<text.length){
            if(text.slice(cursor,cursor+2)==='[['){
                const kind=text.slice(cursor).match(/^\[\[([A-Z_]+):/i)?.[1]||'';
                stack.push(Boolean(stack.at(-1))||/^(?:TABLE|GRID|MATCH|ARITHMETIC|CHOICE|OPTION|SECTION|QUESTION)_ROW$/i.test(kind));
                output+='[[';cursor+=2;continue;
            }
            if(text.slice(cursor,cursor+2)===']]'){stack.pop();output+=']]';cursor+=2;continue;}
            if(text[cursor]==='<'){
                const br=text.slice(cursor).match(/^<br\s*\/?>/i);
                if(br){output+=stack.at(-1)?'<br>':'\n';cursor+=br[0].length;continue;}
            }
            output+=text[cursor++];
        }
        return output;
    }
    const PAPER_FIELD_PATTERNS=[
        ['exam',/\bname\s+of\s+(?:the\s+)?examination\b/i],['roll',/(?:\broll\s*(?:no\.?|number)?\b|अनुक्रमांक|క్రమ సంఖ్య|வரிசை எண்|ಕ್ರಮ ಸಂಖ್ಯೆ|റോൾ നമ്പർ)/iu],
        ['class',/(?:\bclass\b|कक्षा|తరగతి|வகுப்பு|ತರಗತಿ|ക്ലാസ്|শ্রেণি|درجہ)/iu],
        ['subject',/(?:\bsub(?:ject)?\.?\s*:|विषय\s*[:：]|విషయం\s*[:：]|పాఠ్యాంశం\s*[:：]|பாடம்\s*[:：]|ವಿಷಯ\s*[:：]|വിഷയം\s*[:：]|বিষয়\s*[:：]|مضمون\s*[:：])/iu],
        ['marks',/(?:\b(?:total\s+)?marks?\b|कुल\s*अंक|మొత్తం\s*మార్కులు|மொத்த மதிப்பெண்கள்|ಒಟ್ಟು ಅಂಕಗಳು|ആകെ മാർക്ക്)/iu],
        ['name',/(?:\bname\s*[:：]|नाम\s*[:：]|పేరు\s*[:：]|பெயர்\s*[:：]|ಹೆಸರು\s*[:：]|പേര്\s*[:：])/iu],
        ['date',/(?:\bdate\s*[:：]|दिनांक\s*[:：]|తేదీ\s*[:：]|தேதி\s*[:：]|ದಿನಾಂಕ\s*[:：])/iu],
        ['time',/(?:\btime\s*[:：]|समय\s*[:：]|సమయం\s*[:：]|நேரம்\s*[:：]|ಸಮಯ\s*[:：])/iu]
    ];
    function paperFieldLabels(value) {
        const source=String(value||'').replace(/<br>/gi,' '),found=[];
        for(const [name,pattern] of PAPER_FIELD_PATTERNS)if(pattern.test(source))found.push(name);
        return new Set(found);
    }
    function sectionOrdinal(value) {
        const hit=String(value||'').match(/^\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW):\s*)?([IVX]{1,6})(?:[.)\s]|$)/i);
        if(!hit)return 0;
        const numeral=hit[1].toUpperCase(),valueMap={I:1,V:5,X:10};
        const total=[...numeral].reduce((sum,char,index)=>sum+(valueMap[numeral[index+1]]>valueMap[char]?-valueMap[char]:valueMap[char]),0);
        const canonical=n=>['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'][n];
        return total>0&&total<=20&&canonical(total)===numeral?total:0;
    }
    function dedupeSectionPrelude(value) {
        const lines=String(value||'').split('\n');
        const words=s=>String(s||'').replace(/^\s*\[\[SECTION_ROW:\s*/i,'').split(/\s*\|\|/)[0]
            .replace(/^\s*[IVX]{1,6}[.)\s]+/i,'').replace(/[\W_]+/g,' ').trim().toLowerCase();
        for(let i=1;i<lines.length;i++){
            if(!sectionOrdinal(lines[i])||!/^\s*\[\[SECTION_ROW:/i.test(lines[i]))continue;
            let previous=i-1;while(previous>=0&&!lines[previous].trim())previous--;
            if(previous<0||/^\s*\[\[/.test(lines[previous])||sectionOrdinal(lines[previous]))continue;
            const before=words(lines[previous]),heading=words(lines[i]);
            if(before.length>=12&&before===heading)lines[previous]='';
        }
        return lines.join('\n');
    }
    function suppressContinuationHeaders(value) {
        const lines=String(value||'').split('\n'),out=[];
        const control=line=>/^\s*\[\[TABLE_(?:REGION|WIDTHS|HEADER):/i.test(line);
        const row=line=>String(line||'').match(/^\s*\[\[TABLE_ROW:\s*([\s\S]*?)\]\]\s*$/i);
        const question=line=>sectionOrdinal(line)>0||/^\s*(?:\[\[QUESTION_ROW:\s*)?[0-9०-९]+[.)।]\s/u.test(line);
        const nextContent=index=>{while(index<lines.length&&(!lines[index].trim()||control(lines[index])))index++;return lines[index]||'';};
        const laterCleaner=(index,labels,currentColumns,currentRows)=>{
            for(let j=index;j<Math.min(lines.length,index+18);j++){
                if(question(lines[j])||/^\s*\[\[(?:PAGE_BREAK|PAPER_BREAK|SOURCE_BANNER):/i.test(lines[j]))break;
                if(!control(lines[j])&&!row(lines[j]))continue;
                const bodies=[];let maxColumns=0;
                while(j<lines.length&&(control(lines[j])||row(lines[j]))){if(bodies.length&&control(lines[j]))break;const found=row(lines[j]);if(found){bodies.push(found[1]);maxColumns=Math.max(maxColumns,found[1].split(/\s*\|\|\s*/).length);}j++;}
                const other=paperFieldLabels(bodies.join(' ')),overlap=[...labels].filter(x=>other.has(x)).length;
                if(overlap>=3&&(maxColumns<currentColumns||bodies.length>currentRows))return true;
            }
            return false;
        };
        let questionsStarted=false,headerSeen=false;
        for(let i=0;i<lines.length;){
            const line=lines[i];
            if(/^\s*\[\[PAPER_BREAK\]\]\s*$/i.test(line)||/^\s*\[\[SOURCE_BANNER:/i.test(line)){questionsStarted=false;headerSeen=false;out.push(line);i++;continue;}
            if(control(line)||row(line)){
                const block=[];let maxColumns=0,rows=0,j=i;
                while(j<lines.length&&(control(lines[j])||row(lines[j]))){if(rows&&control(lines[j]))break;block.push(lines[j]);const found=row(lines[j]);if(found){rows++;maxColumns=Math.max(maxColumns,found[1].split(/\s*\|\|\s*/).length);}j++;}
                const labels=paperFieldLabels(block.join(' '));
                if(labels.size>=2&&((labels.has('name')&&(labels.has('marks')||labels.has('roll')||labels.has('class')||labels.has('subject')))||labels.size>=3)){
                    const ordinal=sectionOrdinal(nextContent(j));
                    if(questionsStarted&&ordinal===1){questionsStarted=false;headerSeen=false;}
                    const continuation=questionsStarted&&ordinal>1;
                    const malformedDuplicate=!questionsStarted&&(maxColumns>5||(rows===1&&labels.size>=5))&&laterCleaner(j,labels,maxColumns,rows);
                    if(!continuation&&!malformedDuplicate){out.push(...block);headerSeen=true;}
                    i=j;continue;
                }
            }
            out.push(line);
            if(!questionsStarted&&paperFieldLabels(line).has('class')&&/^\s*(?:class\b|\[\[TABLE_ROW:\s*class\b)/i.test(line))headerSeen=true;
            if(question(line))questionsStarted=true;i++;
        }
        return dedupeSectionPrelude(out.join('\n').replace(/\n{3,}/g,'\n\n'));
    }
    function canonicalPaperRow(kind,body) {
        if(!/^(?:SECTION_ROW|QUESTION_ROW|MATCH_ROW)$/.test(kind))return '[['+kind+': '+body+']]';
        const cells=[];let depth=0,start=0;
        for(let i=0;i<body.length;i++){
            if(body.slice(i,i+2)==='[['){depth++;i++;}
            else if(body.slice(i,i+2)===']]'){depth--;i++;}
            else if(!depth&&body.slice(i,i+2)==='||'){cells.push(body.slice(start,i).trim());start=i+2;i++;}
        }
        cells.push(body.slice(start).trim());
        if(kind==='MATCH_ROW'){
            if(cells.length>1&&/^none$/i.test(cells[cells.length-1])&&cells.slice(0,-1).some(cell=>/_{2,}|\[\[(?:GRID|ANSWER_LINES):/i.test(cell)))cells[cells.length-1]='';
            return '[['+kind+': '+cells.join(' || ')+']]';
        }
        while(cells.length>1&&/^(?:none|null)?$/i.test(cells[cells.length-1]))cells.pop();
        if(cells.length===1)return cells[0];
        const n='(?:[0-9०-९]+(?:[./][0-9०-९]+)?[¼½¾]?|[¼½¾])';
        const mark=new RegExp('^\\(?'+n+'(?:\\s*[x×X*]\\s*'+n+'\\s*=\\s*'+n+'\\s*(?:M|[Mm]arks?)?|\\s*(?:M|[Mm]arks?|अंक))?\\)?$');
        const last=cells[cells.length-1];
        if(mark.test(last))return '[['+kind+': '+cells.slice(0,-1).join(' ')+' || '+last+']]';
        // A question row with no actual score is ordinary question text.
        // Geometry flags are not printable marks or new question content.
        return cells.join(' ');
    }

export function cleanQuestionPaper(value, depth=0) {
    if(depth>16)return '';
    if(depth===0)value=normaliseRecognitionMarkup(value);
    const text=String(value||'').replace(/(?:\\_){2,}/g,run=>run.replace(/\\/g,''));let out='',cursor=0;
    while(cursor<text.length){
        const start=text.indexOf('[[',cursor);if(start<0){out+=text.slice(cursor);break;}
        out+=text.slice(cursor,start);let end=start+2,level=1;
        while(end<text.length&&level){if(text.slice(end,end+2)==='[['){level++;end+=2;}else if(text.slice(end,end+2)===']]'){level--;end+=2;}else end++;}
        if(level){out+=text.slice(start);break;}
        const token=text.slice(start,end),m=token.match(/^\[\[([A-Z_-]+):\s*([\s\S]*)\]\]$/i);
        if(!m){const boxed=token.match(/^\[\[\s*([0-9०-९]+)\s*\]\]$/u);out+=boxed?'[[BOXED: '+boxed[1]+']]':token;}
        else {const name=m[1].toUpperCase(),body=m[2];
            if(/^(?:STRIKE|DOUBLE-STRIKE|ANSWER|SOLUTION|ANSWER_KEY|MARGIN|STAMP)$/.test(name)){}
            else if(name==='REPLACE'){const pieces=body.split(/\s*(?:->|→|=>|\|\|)\s*/);out+=pieces.length>1?cleanQuestionPaper(pieces.slice(1).join(' '),depth+1):'';}
            else if(/^(?:INSERT|HIGHLIGHT)$/.test(name))out+=cleanQuestionPaper(body,depth+1);
            else {let content=cleanQuestionPaper(body,depth+1);if(/^(?:SECTION_ROW|QUESTION_ROW|TABLE_ROW|GRID_ROW|MATCH_ROW|CHOICE_ROW|OPTION_ROW|ARITHMETIC_ROW)$/.test(name))content=content.replace(/(?<!\|)\s+\|\s+(?!\|)/g,' || ');out+=canonicalPaperRow(name,content);}
        }
        cursor=end;
    }
    return depth===0?out.replace(/^(?:\s*)(?:Ans(?:wer)?|Solution|उत्तर|जवाब)\s*[:：]\s*[^\n]+$/gim,'____________________'):out;
}

    function pipeTableRows(value) {
        const lines=String(value||'').split('\n'),out=[];
        const cells=line=>{
            const raw=String(line||'').trim();
            if(!/^\|.*\|$/.test(raw)||raw.includes('[['))return null;
            const body=raw.slice(1,-1);
            const parts=body.split(body.includes('||')&&/\S/.test(body.replace(/\|/g,''))?/\s*\|\|\s*/:/\s*\|\s*/).map(cell=>cell.trim());
            return parts.length>=2&&parts.length<=52&&!parts.some(cell=>cell.includes('|'))?parts:null;
        };
        const divider=row=>row&&row.every(cell=>/^:?-{3,}:?$/.test(cell));
        for(let i=0;i<lines.length;i++){
            const row=cells(lines[i]),next=cells(lines[i+1]);
            if(row&&next&&row.length===next.length&&divider(next)){
                out.push('[[TABLE_ROW: '+row.join(' || ')+']]');i++;
                while(i+1<lines.length){
                    const following=cells(lines[i+1]);
                    if(!following||following.length!==row.length||divider(following))break;
                    out.push('[[TABLE_ROW: '+following.join(' || ')+']]');i++;
                }
                continue;
            }
            if(row&&row.every(cell=>!cell)){
                let rows=1;
                while(i+1<lines.length&&rows<32&&(rows+1)*row.length<=600){
                    const following=cells(lines[i+1]);
                    if(!following||following.length!==row.length||following.some(Boolean))break;
                    rows++;i++;
                }
                out.push('[[GRID: '+row.length+'x'+rows+']]');continue;
            }
            // A standalone Indic letter strip following an alphabet instruction
            // represents visible cells, not mathematical absolute-value bars.
            const previous=out.slice().reverse().find(line=>line.trim())||'';
            if(row&&row.length>=4&&/वर्णमाला/.test(previous)&&row.every(cell=>/^[\p{L}\p{M}]{1,4}$/u.test(cell))){
                out.push('[[GRID_ROW: '+row.join(' || ')+']]');continue;
            }
            out.push(lines[i]);
        }
        return out.join('\n');
    }
    function nativePipeRows(value) {
        let questionsStarted=false,previousHeaderCount=0;
        return String(value||'').split('\n').map(line=>{
            if(/^\s*\[\[PAPER_BREAK\]\]\s*$/i.test(line))questionsStarted=false;
            if(/^\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW):|[0-9०-९]+[.)]\s|(?:[IVX]{1,6})(?:[.)]?\s|[.)]?$))/i.test(line))questionsStarted=true;
            if(!line.includes('[[')&&line.includes('||')){
                const questions=line.split(/\s*\|\|\s*/).map(cell=>cell.trim());
                if(questions.length>=2&&questions.length<=4&&questions.every(cell=>cell.length<=300&&/^[0-9०-९]+(?:[.)।]\s*|\s+)\S[\s\S]*(?:_{2,}|\(\s*\))\s*$/u.test(cell))){questionsStarted=true;previousHeaderCount=0;return '[[MATCH_ROW: '+questions.join(' || ')+']]';}
            }
            const wrapped=line.match(/^\s*\[\[TABLE_ROW:\s*([\s\S]*)\]\]\s*$/i),fields=wrapped?wrapped[1]:line;
            if(questionsStarted||fields.includes('[[')||(!wrapped&&!fields.includes('||'))||!/^\s*(?:class\s*:|subject\s*:|time\s*:|name\b[^|]{0,50}:|roll\b[^|]{0,15}:|invigilator\b|(?:total\s+)?marks\b)/i.test(fields)){previousHeaderCount=0;return line;}
            const cells=fields.split(/\s*\|\|\s*/).map(cell=>cell.trim());
            if(cells.length<(wrapped?1:2)||cells.length>8||cells.some(cell=>cell.length>300)){previousHeaderCount=0;return line;}
            const separate=previousHeaderCount&&previousHeaderCount!==cells.length;previousHeaderCount=cells.length;
            return (separate?'\n':'')+'[[TABLE_ROW: '+cells.join(' || ')+']]';
        }).join('\n');
    }

    // Allocate empty exercise cells only for explicit, unambiguous writing ranges.
    // Marks are preserved, never used as a proxy for the number of letters.
    function alphabetWritingBoxes(text) {
        const sequences=[Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),Array.from('abcdefghijklmnopqrstuvwxyz'),
            ['अ','आ','इ','ई','उ','ऊ','ऋ','ए','ऐ','ओ','औ'],
            ['क','ख','ग','घ','ङ','च','छ','ज','झ','ञ','ट','ठ','ड','ढ','ण','त','थ','द','ध','न','प','फ','ब','भ','म','य','र','ल','व','श','ष','स','ह']];
        const lines=String(text||'').split('\n'),out=[];
        for(let i=0;i<lines.length;i++) {
            const line=lines[i];out.push(line);
            if(!/(?:write|लिख|लि[खख]|वर्णमाला)/iu.test(line)||!/(?:alphabet|letters?|वर्णमाला|अक्षर)/iu.test(line))continue;
            if(/(?:missing|complete|fill|रिक्त|खाली|पूर)/iu.test(line))continue;
            // Existing source boxes/tables and answer material always take priority.
            const following=lines.slice(i+1,i+4).join('\n');
            if(/\[\[(?:GRID|TABLE|ANSWER_LINES)|_{3,}|[□▢]/i.test(line+'\n'+following))continue;
            const range=line.match(/([A-Za-z\u0904-\u0939])\s*[”"'’]?\s*(?:से|to|through|[-–])\s*[“"'‘]?\s*([A-Za-z\u0904-\u0939])(?:\s|[”"'’]|तक|[.,।]|$)/iu);
            if(!range)continue;
            const seq=sequences.find(s=>s.includes(range[1])&&s.includes(range[2]));
            if(!seq)continue;
            const start=seq.indexOf(range[1]),end=seq.indexOf(range[2]);
            if(end<start)continue;
            const count=end-start+1;
            for(let left=count;left>0;left-=10)out.push('[[GRID: '+Math.min(10,left)+'x1]]');
        }
        return out.join('\n');
    }

export function normaliseMarkerRows(text) {
    text=alphabetWritingBoxes(nativePipeRows(pipeTableRows(cleanQuestionPaper(text))));
    text=text.replace(/\[\[GRID:\s*(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:\|\s*(?:\|\s*)?(?:none|box))?\s*\]\](?:[ \t]+(?:none|box)(?=[ \t]*(?:\n|$)))?/gi,(_,columns,rows)=>'[[GRID: '+columns+'x'+rows+']]');
    const names='SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION|SOURCE_PAGE';
    const bare=new RegExp('^\\s*('+names+'):\\s*(.*?)\\s*$','i');
    text=String(text||'').replace(/\[\[REPLACE:\s*([^\[\]]*?)\s*\|\|\s*([^\[\]]*?)\]\]/gi,(_,oldText,newText)=>'[[REPLACE: '+oldText.trim()+' -> '+newText.trim()+']]');
    const joined=[];let depth=0;
    for(const line of text.split('\n')){
        if(depth>0&&joined.length)joined[joined.length-1]+=' '+line.trim();else joined.push(line);
        depth=Math.max(0,depth+(line.match(/\[\[/g)||[]).length-(line.match(/\]\]/g)||[]).length);
    }
    return suppressContinuationHeaders(joined.map(line=>{
        const m=line.match(bare);
        return m ? '[['+m[1].toUpperCase()+': '+m[2].replace(/\]\]$/,'')+']]' : line;
    }).join('\n'));
}
