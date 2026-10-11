// Reference-driven structure rules for training/*.docx and training/*.pdf.
// Formatting adaptation, not model-weight fine-tuning. The current page wins.
export const PAPER_LAYOUT_RULES = `
REFERENCE QUESTION-PAPER LAYOUT RULES (version 6, reviewed across the complete training corpus):
- Output editable text, native table/grid markers, and basic geometric shapes. Do not describe drawings as words or supply answers.
- Count PHYSICAL cell borders, not expected answer counts. A to Z does NOT imply 26 cells. Notebook ruling through a drawn box does NOT imply a second grid row. Ignore background notebook margins and ruled lines.
- Never split matching columns into alternating lines. Emit MATCH_ROW with ALL visible columns, including the middle blank bracket column: [[MATCH_ROW: 1. visible item || (   ) || a. visible option]]. Keep original row order; never solve the match. Pictures may occupy individual matching cells using FIGURE markers.
- Every section and its right-aligned marks use SECTION_ROW even if handwritten. Preserve marks literally. Keep the grid or first question directly after its section.
- Read the full page and keep intentional blank answer rules. Do not duplicate a source footer in the question body: use [[FOOTER: left text || center text]] for a clearly separate printed page footer, omitting its printed page number (the exporter supplies a live page field).
- For an ACTUAL drawing, illustration, map, graph or complex diagram, preserve the original pixels using a crop marker. Coordinates are x,y,width,height integers on the exact displayed image, normalized to 0–1000, origin TOP LEFT. Bound ONLY the illustration, including its diagram labels; exclude surrounding question text. Do not replace it with a generic picture.
- Single illustration: [[FIGURE: 100,250,180,120|visible caption|none]]. Blank caption is valid. Use box instead of none ONLY for a visible answer box belonging to this illustration.
- Several illustrations across one row: [[FIGURE_ROW: 100,250,180,120|1.|box || 400,250,180,120|2.|box]]. Each cell has its OWN crop. Exactly preserve the visible illustration count and row order. Put separately printed words below pictures in the caption, spelled exactly as visible; never infer object names.
- In counting exercises, all repeated drawings belonging to ONE numbered problem form ONE crop. Keep every object and its strokes inside that crop. Preserve the original vertical question rows; do not turn each repeated object into a new question or supply its count. Keep the separately written equals sign and blank answer rule as editable text outside the crop.
- Keep internal diagram labels, abacus rods/beads and number-strip ticks inside their illustration crop. Do not transcribe those same labels again as external captions or crop only one fragment of the diagram.
- For a real school banner at the page top: [[BANNER: 40,10,920,100]]. Crop only the banner. Do not repeat the school or address text already included inside that crop as body paragraphs. Preserve Name/Class/Subject/exam fields as editable text outside it. A clipped, unreadable school name must not be completed from memory.
- Written requests such as 'tiger pic' with NO actual illustration still use PICTURE markers; these are unfulfilled author instructions, not original picture assets. The exporter flags them for review.
- Basic circle/square/rectangle/triangle/cube outlines are SHAPE_ROW and stay editable shapes. Specify the observed answer space per shape: [[SHAPE_ROW: circle|none || square|box || triangle|line]]. none means no answer space, box means a visible blank box, line means a visible answer rule. Do not add a box merely because the question asks to name the shape. Complex shapes, shaded fractional shapes, cones and labelled geometrical diagrams use FIGURE crops instead of guessed geometry.
- When a table has a picture beside it, emit [[TABLE_REGION: x,y,width,height]] immediately before the table using the same normalized page coordinates as FIGURE. Emit the adjacent FIGURE immediately after the last TABLE_ROW, preserving its exact bounds. The exporter keeps this observed side-by-side composition; do not move the figure to a new row. Do not invent table bounds when uncertain.
- Bordered tables use TABLE_ROW for every row, including empty first/last cells. Preserve multiline cell contents with the explicit <br> separator, NOT extra rows. Use TABLE_WIDTHS: percentages separated by commas on a preceding marker line ONLY if the visible column proportions are clear.
- Use [[TABLE_HEADER: 1]] before a table ONLY when its first row contains visible column headings. Ordinary exercise rows and partially filled comparison tables are not headers. Never fill missing comparative forms, missing letters, number grids, matching answers or arithmetic results.
- Vertically stacked arithmetic is not ordinary prose. Emit [[ARITHMETIC_ROW: 34<br>+ 12<br>___ || 68<br>- 21<br>___]] with one cell per original problem and <br> between its observed lines. Preserve every operand, operator and visible answer rule; never calculate the answers. H/T/O labels above unbordered arithmetic stay in that arithmetic cell, not a bordered table. Use TABLE_ROW for a visibly bordered place-value chart; notebook ruling alone does not establish table borders.
- An individual question with a separate right-side mark uses [[QUESTION_ROW: exact question || exact mark]]. Fractions such as ½ and equations such as 4×½=2 must remain literal.
- Repeated headers indicate a new question paper only when visibly present. Read continuous questions across scan pages in order. Do not invent exam titles or copy a school banner from another page or reference.
- Output the question paper alone. Do not add assistant answers, solutions, answer keys, encouragement, formatting suggestions or explanatory introductions. If an answer is actually written in the source, transcribe it faithfully; do not silently erase source content.
- Letter grids use GRID or consecutive GRID_ROW markers. Up to 52 columns, 32 rows, 600 cells. Use only observed counts; uncertain borders remain [unclear]. Never turn ordinary notebook lines into ANSWER_LINES.
- These reference rules govern representation and layout only. Never copy questions, school identities, dates, marks or answers from a different training paper.
`;

export function normaliseMarkerRows(text) {
    const names='SECTION_ROW|QUESTION_ROW|ARITHMETIC_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|TABLE_WIDTHS|TABLE_HEADER|TABLE_REGION';
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
