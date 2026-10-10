// Reference-driven structure rules for training/*.docx and training/*.pdf.
// Formatting adaptation, not model-weight fine-tuning. The current page wins.
export const PAPER_LAYOUT_RULES = `
REFERENCE QUESTION-PAPER LAYOUT RULES (version 4):
- Output editable text, native table/grid markers, and basic geometric shapes. Do not describe drawings as words or supply answers.
- Count PHYSICAL cell borders, not expected answer counts. A to Z does NOT imply 26 cells. Notebook ruling through a drawn box does NOT imply a second grid row. Ignore background notebook margins and ruled lines.
- Never split matching columns into alternating lines when a visible left/right pair occupies one row. Emit MATCH_ROW in original row order; never solve the match.
- Every section and its right-aligned marks use SECTION_ROW even if handwritten. Preserve marks literally. Keep the grid or first question directly after its section.
- Read the full page and keep intentional blank answer rules. Do not duplicate a source footer in the question body: use [[FOOTER: left text || center text]] for a clearly separate printed page footer, omitting its printed page number (the exporter supplies a live page field).
- For an ACTUAL drawing, illustration, map, graph or complex diagram, preserve the original pixels using a crop marker. Coordinates are x,y,width,height integers on the exact displayed image, normalized to 0–1000, origin TOP LEFT. Bound ONLY the illustration, including its diagram labels; exclude surrounding question text. Do not replace it with a generic picture.
- Single illustration: [[FIGURE: 100,250,180,120|visible caption|none]]. Blank caption is valid. Use box instead of none ONLY for a visible answer box belonging to this illustration.
- Several illustrations across one row: [[FIGURE_ROW: 100,250,180,120|1.|box || 400,250,180,120|2.|box]]. Each cell has its OWN crop. Exactly preserve the visible illustration count and row order. Put separately printed words below pictures in the caption, spelled exactly as visible; never infer object names.
- For a real school banner at the page top: [[BANNER: 40,10,920,100]]. Crop only the banner. Do not repeat the school or address text already included inside that crop as body paragraphs. Preserve Name/Class/Subject/exam fields as editable text outside it. A clipped, unreadable school name must not be completed from memory.
- Written requests such as 'tiger pic' with NO actual illustration still use PICTURE markers; these are unfulfilled author instructions, not original picture assets. The exporter flags them for review.
- Basic circle/square/rectangle/triangle/cube outlines are SHAPE_ROW and stay editable shapes. Complex shapes use FIGURE crops instead of guessed geometry.
- Bordered tables use TABLE_ROW for every row, including empty first/last cells. Preserve multiline cell contents with the explicit <br> separator, NOT extra rows. Use TABLE_WIDTHS: percentages separated by commas on a preceding marker line ONLY if the visible column proportions are clear.
- Letter grids use GRID or consecutive GRID_ROW markers. Up to 52 columns, 32 rows, 600 cells. Use only observed counts; uncertain borders remain [unclear]. Never turn ordinary notebook lines into ANSWER_LINES.
- These reference rules govern representation and layout only. Never copy questions, school identities, dates, marks or answers from a different training paper.
`;

export function normaliseMarkerRows(text) {
    const names='SECTION_ROW|MATCH_ROW|TABLE_ROW|GRID_ROW|FIGURE_ROW|FIGURE|SHAPE_ROW|GRID|ANSWER_LINES|CHOICE_ROW|OPTION_ROW|BANNER|FOOTER|TABLE_WIDTHS';
    const bare=new RegExp('^\\s*('+names+'):\\s*(.*?)\\s*$','i');
    return String(text||'').split('\n').map(line=>{
        const m=line.match(bare);
        return m ? '[['+m[1].toUpperCase()+': '+m[2].replace(/\]\]$/,'')+']]' : line;
    }).join('\n');
}
