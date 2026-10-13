// Reference-driven structure rules for training/*.docx and training/*.pdf.
// Formatting adaptation, not model-weight fine-tuning. The current page wins.
export const PAPER_LAYOUT_RULES = `
REFERENCE QUESTION-PAPER LAYOUT RULES (version 8, reviewed across the complete training corpus):
- Output editable text, native table/grid markers, and basic geometric shapes. Do not describe drawings as words or supply answers.
- Count PHYSICAL cell borders, not expected answer counts. A to Z does NOT imply 26 cells. Notebook ruling through a drawn box does NOT imply a second grid row. Ignore background notebook margins and ruled lines.
- Never split matching columns into alternating lines. Emit MATCH_ROW with ALL visible columns, including the middle blank bracket column: [[MATCH_ROW: 1. visible item || (   ) || a. visible option]]. Keep original row order; never solve the match. Pictures may occupy individual matching cells using FIGURE markers.
- When two or three separate short numbered questions share one unbordered horizontal row, use MATCH_ROW with each complete visible question and its blank answer space in its own cell. This marker represents physical columns, not solved matching. Preserve row-major reading order and the actual numbering, including source numbering mistakes. Do not stack the columns vertically or renumber them.
- Every section and its right-aligned marks use SECTION_ROW even if handwritten. Use exactly two fields: [[SECTION_ROW: I. full instruction including its section number || exact marks]]. Never split the Roman section number into a separate field. The literal flag none belongs only to geometry controls, never to question/section text or marks. Preserve marks literally. Keep the grid or first question directly after its section.
- Reference scans contain easily confused Devanagari forms: श्र versus ज्ञ, the isolated vowel sign ू versus the digit २, and े versus ै. Inspect the actual strokes independently. A conventional alphabet endpoint or a familiar word is not evidence; do not substitute a conventional form, complete a sequence, or solve a word-building question.
- In letter-building exercises, read EACH component between plus signs independently. An isolated vowel sign such as ा, ि, ी, ु, ू, ृ, े, ै, ो, ौ, ं, ँ or ः is question data even without a preceding consonant. Do not replace it with a lookalike consonant such as ण or a digit; do not emit a dotted-circle character that is absent from the source. Count repeated consonant strokes against the image: one written letter must not become two, and genuinely repeated letters must stay repeated. Keep irregular/repeated question numbers exactly as printed instead of repairing their sequence.
- Enlarged detail views may brighten a gray photographed page using a soft contrast adjustment. They are overlapping copies of the same source regions, not additional questions or pages. The original full-page image remains authoritative for colored corrections, completed responses and illustration bounds.
- Read the full page and keep intentional blank answer rules. Do not duplicate a source footer in the question body: use [[FOOTER: left text || center text]] for a clearly separate printed page footer, omitting its printed page number (the exporter supplies a live page field).
- For an ACTUAL drawing, illustration, map, graph or complex diagram, preserve the original pixels using a crop marker. Coordinates are x,y,width,height integers on the exact displayed image, normalized to 0–1000, origin TOP LEFT. Bound ONLY the illustration, including its diagram labels; exclude surrounding question text. Do not replace it with a generic picture.
- Single illustration: [[FIGURE: 100,250,180,120|visible caption|none]]. Blank caption is valid. Use box instead of none ONLY for a visible answer box belonging to this illustration.
- Several illustrations across one row: [[FIGURE_ROW: 100,250,180,120|1.|box || 400,250,180,120|2.|box]]. Each cell has its OWN crop. Exactly preserve the visible illustration count and row order. Put separately printed words below pictures in the caption, spelled exactly as visible; never infer object names.
- In counting exercises, all repeated drawings belonging to ONE numbered problem form ONE crop. Keep every object and its strokes inside that crop. Preserve the original vertical question rows; do not turn each repeated object into a new question or supply its count. Keep the separately written equals sign and blank answer rule as editable text outside the crop.
- Keep internal diagram labels, abacus rods/beads and number-strip ticks inside their illustration crop. Do not transcribe those same labels again as external captions or crop only one fragment of the diagram.
- For a real school banner at the page top, emit BANNER with four integer crop coordinates measured from THIS image. Crop only the school name, address and logos. Stop above editable Class/Subject/exam/Time/Marks/Name/Roll/Signature fields. Do not copy an example rectangle or use a default percentage-height crop. Do not repeat the school or address text already included inside that crop as body paragraphs. Preserve Name/Class/Subject/exam fields as editable text outside it. A clipped, unreadable school name must not be completed from memory.
- Written requests such as 'tiger pic' with NO actual illustration still use PICTURE markers; these are unfulfilled author instructions, not original picture assets. The exporter flags them for review.
- Basic circle/square/rectangle/triangle/cube outlines are SHAPE_ROW and stay editable shapes. Specify the observed answer space per shape: [[SHAPE_ROW: circle|none || square|box || triangle|line]]. none means no answer space, box means a visible blank box, line means a visible answer rule. Do not add a box merely because the question asks to name the shape. Complex shapes, shaded fractional shapes, cones and labelled geometrical diagrams use FIGURE crops instead of guessed geometry.
- When a table has a picture beside it, emit [[TABLE_REGION: x,y,width,height]] immediately before the table using the same normalized page coordinates as FIGURE. Emit the adjacent FIGURE immediately after the last TABLE_ROW, preserving its exact bounds. The exporter keeps this observed side-by-side composition; do not move the figure to a new row. Do not invent table bounds when uncertain.
- Bordered tables use TABLE_ROW for every row, including empty first/last cells. Preserve multiline cell contents with the explicit <br> separator, NOT extra rows. Use TABLE_WIDTHS: percentages separated by commas on a preceding marker line ONLY if the visible column proportions are clear.
- Use [[TABLE_HEADER: 1]] before a table ONLY when its first row contains visible column headings. Ordinary exercise rows and partially filled comparison tables are not headers. Never fill missing comparative forms, missing letters, number grids, matching answers or arithmetic results.
- Vertically stacked arithmetic is not ordinary prose. Emit [[ARITHMETIC_ROW: 34<br>+ 12<br>___ || 68<br>- 21<br>___]] with one cell per original problem and <br> between its observed lines. Preserve every operand, operator and visible answer rule; never calculate the answers. H/T/O labels above unbordered arithmetic stay in that arithmetic cell, not a bordered table. Use TABLE_ROW for a visibly bordered place-value chart; notebook ruling alone does not establish table borders.
- An individual question with a separate right-side mark uses [[QUESTION_ROW: exact question || exact mark]]. Fractions such as ½ and equations such as 4×½=2 must remain literal.
- A clearly visible original printed page number uses [[SOURCE_PAGE: integer]] control metadata. Never invent a page number. Read physical multi-column rows left to right; keep original question numbers, including mistakes. Never renumber column-major text into a new question order.
- Repeated headers indicate a new question paper only when visibly present. Read continuous questions across scan pages in order. Do not invent exam titles or copy a school banner from another page or reference.
- Output the question paper alone. Do not add assistant answers, solutions, answer keys, encouragement, formatting suggestions or explanatory introductions. Remove completed answers, worked solutions, answer keys and grading comments from answer positions; restore those spaces as blanks. Preserve question operands, examples, options, word banks and matching choices: these are question content, not completed answers. Resolve handwritten question corrections to the intended final wording automatically; omit cancelled drafts and insert the final replacement naturally. Do not emit editorial STRIKE, DOUBLE-STRIKE, REPLACE, INSERT or HIGHLIGHT markers.
- Letter grids use GRID or consecutive GRID_ROW markers. Up to 52 columns, 32 rows, 600 cells. Use only observed counts; uncertain borders remain [unclear]. Never turn ordinary notebook lines into ANSWER_LINES.
- These reference rules govern representation and layout only. Never copy questions, school identities, dates, marks or answers from a different training paper.
`;

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
    const text=String(value||'').replace(/(?:\\_){2,}/g,run=>run.replace(/\\/g,''));let out='',cursor=0;
    while(cursor<text.length){
        const start=text.indexOf('[[',cursor);if(start<0){out+=text.slice(cursor);break;}
        out+=text.slice(cursor,start);let end=start+2,level=1;
        while(end<text.length&&level){if(text.slice(end,end+2)==='[['){level++;end+=2;}else if(text.slice(end,end+2)===']]'){level--;end+=2;}else end++;}
        if(level){out+=text.slice(start);break;}
        const token=text.slice(start,end),m=token.match(/^\[\[([A-Z_-]+):\s*([\s\S]*)\]\]$/i);
        if(!m)out+=token;
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

    function nativePipeRows(value) {
        let questionsStarted=false,previousHeaderCount=0;
        return String(value||'').split('\n').map(line=>{
            if(/^\s*\[\[PAPER_BREAK\]\]\s*$/i.test(line))questionsStarted=false;
            if(/^\s*(?:\[\[(?:SECTION_ROW|QUESTION_ROW):|[0-9०-९]+[.)]\s|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)(?:[.)]?\s|[.)]?$))/i.test(line))questionsStarted=true;
            if(!line.includes('[[')&&line.includes('||')){
                const questions=line.split(/\s*\|\|\s*/).map(cell=>cell.trim());
                if(questions.length>=2&&questions.length<=4&&questions.every(cell=>cell.length<=300&&/^[0-9०-९]+(?:[.)।]\s*|\s+)\S[\s\S]*(?:_{2,}|\(\s*\))\s*$/u.test(cell))){questionsStarted=true;previousHeaderCount=0;return '[[MATCH_ROW: '+questions.join(' || ')+']]';}
            }
            const wrapped=line.match(/^\s*\[\[TABLE_ROW:\s*([\s\S]*)\]\]\s*$/i),fields=wrapped?wrapped[1]:line;
            if(questionsStarted||fields.includes('[[')||!fields.includes('||')||!/^\s*(?:class\s*:|subject\s*:|time\s*:|name\b[^|]{0,50}:|roll\b[^|]{0,15}:|invigilator\b|(?:total\s+)?marks\b)/i.test(fields)){previousHeaderCount=0;return line;}
            const cells=fields.split(/\s*\|\|\s*/).map(cell=>cell.trim());
            if(cells.length<2||cells.length>8||cells.some(cell=>cell.length>300)){previousHeaderCount=0;return line;}
            const separate=previousHeaderCount&&previousHeaderCount!==cells.length;previousHeaderCount=cells.length;
            return (separate?'\n':'')+'[[TABLE_ROW: '+cells.join(' || ')+']]';
        }).join('\n');
    }
export function normaliseMarkerRows(text) {
    text=nativePipeRows(cleanQuestionPaper(text));
    text=text.replace(/\[\[GRID:\s*(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:\|\s*(?:\|\s*)?(?:none|box))?\s*\]\](?:[ \t]+(?:none|box)(?=[ \t]*(?:\n|$)))?/gi,(_,columns,rows)=>'[[GRID: '+columns+'x'+rows+']]');
    const names='SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION|SOURCE_PAGE';
    const bare=new RegExp('^\\s*('+names+'):\\s*(.*?)\\s*$','i');
    text=String(text||'').replace(/\[\[REPLACE:\s*([^\[\]]*?)\s*\|\|\s*([^\[\]]*?)\]\]/gi,(_,oldText,newText)=>'[[REPLACE: '+oldText.trim()+' -> '+newText.trim()+']]');
    const joined=[];let depth=0;
    for(const line of text.split('\n')){
        if(depth>0&&joined.length)joined[joined.length-1]+=' '+line.trim();else joined.push(line);
        depth=Math.max(0,depth+(line.match(/\[\[/g)||[]).length-(line.match(/\]\]/g)||[]).length);
    }
    return joined.map(line=>{
        const m=line.match(bare);
        return m ? '[['+m[1].toUpperCase()+': '+m[2].replace(/\]\]$/,'')+']]' : line;
    }).join('\n');
}
