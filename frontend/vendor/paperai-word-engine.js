(function (global) {
    'use strict';

    const MODEL = () => global.PaperAIDocumentModel;
    const DX = () => global.docx;
    const SH = () => global.docxShapes;

    function available() {
        return !!(MODEL() && DX() && SH() && DX().Document && DX().Packer && SH().ShapeCanvasRun);
    }

    function stripMarkup(value) {
        return String(value || '')
            .replace(/\[\[REPLACE:\s*([\s\S]*?)\s*(?:->|→|=>)\s*([\s\S]*?)\]\]/gi, (_, a, b) => [a.trim(), b.trim()].filter(Boolean).join(' → '))
            .replace(/\[\[CIRCLED:\s*(\d+)\s*\]\]/gi, (_, n) => circledNumber(Number(n)))
            .replace(/\[\[(?:DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|UNDERLINE|BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE):\s*([\s\S]*?)\]\]/gi, (_, v) => String(v || '').trim());
    }

    function circledNumber(n) {
        const value = Number(n);
        if (value === 0) return '⓪';
        if (value >= 1 && value <= 20) return String.fromCodePoint(0x2460 + value - 1);
        return String(n ?? '');
    }

    function headingLike(text, index, firstTextIndex) {
        const t = stripMarkup(text).trim();
        if (!t) return false;
        if (index === firstTextIndex) return true;
        if (/^[A-Z][A-Z0-9 .\-/&]{5,}$/.test(t)) return true;
        if (/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)[.)\s]+\S+/i.test(t)) return true;
        if (/^(?:SECTION|PART|CHAPTER|QUESTION|प्रश्न|खंड|भाग)\b/i.test(t)) return true;
        return false;
    }

    function para(text, options = {}) {
        const d = DX();
        return new d.Paragraph({
            alignment: options.center ? d.AlignmentType.CENTER : (options.right ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT),
            spacing: {
                before: options.before ?? 0,
                after: options.after ?? 40,
                line: options.line ?? 276,
            },
            keepNext: !!options.keepNext,
            children: [
                new d.TextRun({
                    text: stripMarkup(text),
                    bold: !!options.bold,
                    italics: !!options.italics,
                    size: options.size ?? 21,
                    font: options.font || 'Tahoma',
                    color: options.color,
                })
            ]
        });
    }

    function noBorder() {
        const d = DX();
        const nil = { style: d.BorderStyle.NIL, size: 0, color: 'FFFFFF' };
        return { top: nil, bottom: nil, left: nil, right: nil, insideHorizontal: nil, insideVertical: nil };
    }

    function tableCell(children, width, options = {}) {
        const d = DX();
        const borders = options.bottom
            ? {
                ...noBorder(),
                bottom: { style: d.BorderStyle.SINGLE, size: options.lineSize ?? 5, color: options.color || '64748B' }
            }
            : noBorder();
        return new d.TableCell({
            children,
            width: { size: width, type: d.WidthType.DXA },
            verticalAlign: (d.VerticalAlignTable || d.VerticalAlign).CENTER,
            rowSpan: options.rowSpan,
            columnSpan: options.columnSpan,
            borders,
            margins: {
                top: options.top ?? 0,
                bottom: options.bottomMargin ?? 0,
                left: options.left ?? 20,
                right: options.right ?? 20
            },
            shading: options.shading ? { fill: options.shading } : undefined,
        });
    }

    function answerBlank(node) {
        const d = DX();
        const widths = [500, 9350];
        return new d.Table({
            width: { size: widths[0] + widths[1], type: d.WidthType.DXA },
            columnWidths: widths,
            borders: noBorder(),
            rows: [
                new d.TableRow({
                    cantSplit: true,
                    height: { value: 330, rule: d.HeightRule.ATLEAST },
                    children: [
                        tableCell([para(circledNumber(node.number), { size: 20, center: true, after: 0, line: 240, font: 'Segoe UI Symbol' })], widths[0], { right: 20 }),
                        tableCell([para('', { after: 0, line: 240 })], widths[1], { bottom: true, bottomMargin: 65, left: 0, right: 0 })
                    ]
                })
            ]
        });
    }

    function exerciseRow(node, single = false) {
        const d = DX();
        const itemCells = (item) => {
            const numberW = 420, textW = 1050, blankW = 3450;
            return [
                tableCell([para(circledNumber(item.number), { size: 19, center: true, after: 0, line: 230, font: 'Segoe UI Symbol' })], numberW, { right: 10 }),
                tableCell([para(item.text, { size: 19, after: 0, line: 230 })], textW, { left: 0, right: 20 }),
                tableCell([para('', { after: 0, line: 230 })], blankW, { bottom: item.hasBlank, bottomMargin: 60, left: 0, right: 35 })
            ];
        };

        let widths;
        let cells;
        if (single) {
            widths = [420, 1050, 3450, 4930];
            cells = [
                ...itemCells(node),
                tableCell([para('', { after: 0 })], widths[3])
            ];
        } else {
            widths = [420, 1050, 3450, 420, 1050, 3450];
            cells = [...itemCells(node.left), ...itemCells(node.right)];
        }

        return new d.Table({
            width: { size: widths.reduce((a,b)=>a+b,0), type: d.WidthType.DXA },
            columnWidths: widths,
            borders: noBorder(),
            rows: [new d.TableRow({ cantSplit: true, height: { value: 310, rule: d.HeightRule.ATLEAST }, children: cells })]
        });
    }

    function structuredTable(node, borders) {
        const d = DX();
        if (!node.rows?.length) return para('');
        const cols = Math.max(...node.rows.map(r => r.length));
        const total = 9850;
        const widths = Array.from({ length: cols }, () => Math.floor(total / cols));
        widths[widths.length - 1] += total - widths.reduce((a,b)=>a+b,0);
        const border = { style: d.BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
        const no = noBorder();
        return new d.Table({
            width: { size: total, type: d.WidthType.DXA },
            columnWidths: widths,
            borders: borders ? { top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border } : no,
            rows: node.rows.map((row, ri) => new d.TableRow({
                cantSplit: true,
                children: widths.map((w, ci) => new d.TableCell({
                    width: { size: w, type: d.WidthType.DXA },
                    borders: borders ? undefined : no,
                    margins: { top:40,bottom:40,left:60,right:60 },
                    shading: borders && ri === 0 ? { fill: 'F8FAFC' } : undefined,
                    children: [para(row[ci] || '', { size: 19, bold: borders && ri === 0, after: 0, line: 245 })]
                }))
            }))
        });
    }

    function branchDiagram(node) {
        const d = DX();
        const s = SH();
        const clean = (node.items || []).filter(x => x && (x.left || x.right));
        if (!clean.length) return para(node.root || '');

        // Same geometry as the Extracted SVG, scaled into Word DrawingML.
        const width = 620;
        const rowH = 46;
        const top = 28;
        const height = Math.max(120, top * 2 + (clean.length - 1) * rowH);
        const rootX = 72;
        const rootY = top + ((clean.length - 1) * rowH) / 2;
        const labelX = 190;
        const ruleStartX = 278;
        const ruleEndX = 410;
        const englishX = 430;

        const textBox = (id, text, x, y, w, h, size, bold = false) => ({
            id,
            type: 'rectangle',
            transformation: { offset: { left: x, top: y }, width: w, height: h },
            fill: 'none',
            line: 'none',
            children: [
                new d.Paragraph({
                    spacing: { before: 0, after: 0 },
                    children: [new d.TextRun({ text: String(text || ''), size, bold, font: 'Tahoma' })]
                })
            ]
        });

        const children = [
            {
                id: 'root',
                type: 'ellipse',
                transformation: { offset: { left: rootX - 26, top: rootY - 26 }, width: 52, height: 52 },
                fill: 'none',
                line: { color: '0F172A', width: 1.25 },
                children: [
                    new d.Paragraph({
                        alignment: d.AlignmentType.CENTER,
                        spacing: { before: 0, after: 0 },
                        children: [new d.TextRun({ text: String(node.root || ''), bold: true, size: 22, font: 'Tahoma' })]
                    })
                ]
            }
        ];

        clean.forEach((item, index) => {
            const y = top + index * rowH;
            const id = 'branch-left-' + index;
            children.push(textBox(id, item.left, labelX, y - 12, 72, 26, 19, false));
            children.push({
                type: 'connector',
                from: 'root',
                to: id,
                line: { color: '0F172A', width: 1.15, endArrow: 'triangle' }
            });
            if (item.right) {
                children.push({
                    type: 'line',
                    transformation: { offset: { left: ruleStartX, top: y }, width: ruleEndX - ruleStartX, height: 0 },
                    line: { color: '64748B', width: 0.8 }
                });
                children.push(textBox('branch-right-' + index, item.right, englishX, y - 12, 135, 26, 18, false));
            }
        });

        return new d.Paragraph({
            spacing: { before: 50, after: 50 },
            children: [new s.ShapeCanvasRun({ children })]
        });
    }

    function buildChildren(structuredText) {
        const d = DX();
        const model = MODEL().parse(structuredText);
        const firstTextIndex = model.nodes.findIndex(n => n.type === 'text' && String(n.text || '').trim());
        const children = [];

        model.nodes.forEach((node, index) => {
            if (node.type === 'pageBreak') {
                children.push(new d.Paragraph({ pageBreakBefore: true, children: [] }));
                return;
            }
            if (node.type === 'blank') {
                children.push(para('', { after: 20, line: 200 }));
                return;
            }
            if (node.type === 'branch') {
                children.push(branchDiagram(node));
                return;
            }
            if (node.type === 'answerBlank') {
                children.push(answerBlank(node));
                return;
            }
            if (node.type === 'twoColumnExercise') {
                children.push(exerciseRow(node, false));
                return;
            }
            if (node.type === 'singleExercise') {
                children.push(exerciseRow(node, true));
                return;
            }
            if (node.type === 'table') {
                children.push(structuredTable(node, true));
                return;
            }
            if (node.type === 'columns') {
                children.push(structuredTable(node, false));
                return;
            }
            if (node.type === 'text') {
                const heading = headingLike(node.text, index, firstTextIndex);
                const formLike = /_{3,}/.test(node.text) && /(?:Name|Class|Date|Roll|Sub|Marks|Examination|नाम|कक्षा|दिनांक)/i.test(node.text);
                children.push(para(node.text, {
                    bold: heading,
                    size: heading ? (index === firstTextIndex ? 27 : 23) : (formLike ? 19 : 20),
                    after: formLike ? 18 : (heading ? 50 : 28),
                    keepNext: heading,
                    line: 260,
                }));
            }
        });

        return children;
    }

    async function validateDocxBlob(blob, structuredText) {
        if (!global.JSZip) return { ok: true, checks: ['zip-validation-unavailable'] };

        const zip = await global.JSZip.loadAsync(blob);
        const file = zip.file('word/document.xml');
        if (!file) throw new Error('Generated Word package is missing document.xml.');

        const xml = await file.async('string');
        if (/\[\[(?:BRANCH_|TABLE_|COLUMN_|CIRCLED:)/i.test(xml)) {
            throw new Error('Internal PaperAI structure metadata leaked into the Word document.');
        }

        const model = MODEL().parse(structuredText);
        const required = [];
        model.nodes.forEach(node => {
            if (node.type === 'branch') {
                required.push(node.root, ...node.items.flatMap(item => [item.left, item.right]));
            }
        });

        for (const token of required.filter(Boolean)) {
            const plain = String(token).trim();
            if (plain && !/[<>&]/.test(plain) && !xml.includes(plain)) {
                throw new Error('Word export validation lost branch text: ' + plain);
            }
        }

        return {
            ok: true,
            checks: [
                'valid-docx-package',
                'no-internal-markers',
                required.length ? 'branch-text-preserved' : 'no-branch-required'
            ]
        };
    }

    async function makeDocx(structuredText) {
        if (!available()) throw new Error('Modern Word engine is not available.');
        const d = DX();

        const doc = new d.Document({
            styles: {
                default: {
                    document: {
                        run: { font: 'Tahoma', size: 20 },
                        paragraph: { spacing: { after: 28, line: 260 } }
                    }
                }
            },
            sections: [
                {
                    properties: {
                        page: {
                            size: { width: 11906, height: 16838 },
                            margin: { top: 620, right: 620, bottom: 620, left: 620, header: 300, footer: 300 }
                        }
                    },
                    children: buildChildren(structuredText)
                }
            ]
        });

        const blob = await d.Packer.toBlob(doc);
        const diagnostics = await validateDocxBlob(blob, structuredText);
        global.__paperAIWordDiagnostics = diagnostics;
        return blob;
    }

    global.PaperAIWordEngine = Object.freeze({
        available,
        makeDocx,
        validateDocxBlob
    });
})(window);
