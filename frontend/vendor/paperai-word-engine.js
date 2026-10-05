(function (global) {
    'use strict';

    const MODEL = () => global.PaperAIDocumentModel;
    const DX = () => global.docx;
    const SH = () => global.docxShapes;

    const TEXT_FONT = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Mangal', cs: 'Mangal' };
    function textFont(value) {
        return /[\u0900-\u097f]/u.test(String(value || ''))
            ? { ...TEXT_FONT, ascii: 'Mangal', hAnsi: 'Mangal' } : TEXT_FONT;
    }

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

    function numberLabel(raw, number) {
        const token = String(raw ?? number ?? '').trim();
        if (/^\[\[CIRCLED:/i.test(token) || /^[⓪①-⑳❶-❿]$/.test(token)) return token;
        return token.replace(/[.)।:;]+$/u, '') + '.';
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

    let inlineShapeSequence = 0;

    function circledNumberShapeRun(value, options = {}) {
        const d = DX();
        const s = SH();
        const id = 'inline-circle-' + (++inlineShapeSequence);
        const size = 20;

        return new s.ShapeCanvasRun({
            children: [
                {
                    id,
                    type: 'ellipse',
                    transformation: {
                        offset: { left: 0, top: 0 },
                        width: size,
                        height: size
                    },
                    fill: 'none',
                    line: { color: '111827', width: 1 },
                    children: [
                        new d.Paragraph({
                            alignment: d.AlignmentType.CENTER,
                            spacing: { before: 0, after: 0, line: 200 },
                            children: [
                                new d.TextRun({
                                    text: String(value ?? ''),
                                    bold: true,
                                    size: Math.max(15, (options.size || 20) - 3),
                                    font: TEXT_FONT
                                })
                            ]
                        })
                    ]
                }
            ]
        });
    }

    function inlineRuns(value, options = {}) {
        const d = DX();
        const source = String(value || '');
        const runs = [];
        const token = /\[\[CIRCLED:\s*(\d+)\s*\]\]|([⓪①-⑳❶-❿])/g;
        let last = 0;
        let match;

        const pushText = (text) => {
            if (!text) return;
            runs.push(new d.TextRun({
                text: stripMarkup(text),
                bold: !!options.bold,
                italics: !!options.italics,
                size: options.size ?? 21,
                font: textFont(text),
                color: options.color || '000000'
            }));
        };

        while ((match = token.exec(source)) !== null) {
            pushText(source.slice(last, match.index));
            const number = match[1]
                ? Number(match[1])
                : circledNumberValue(match[2]);
            runs.push(circledNumberShapeRun(number, options));
            last = token.lastIndex;
        }

        pushText(source.slice(last));
        return runs.length ? runs : [
            new d.TextRun({
                text: stripMarkup(source),
                bold: !!options.bold,
                italics: !!options.italics,
                size: options.size ?? 21,
                font: textFont(source),
                color: options.color || '000000'
            })
        ];
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
            children: inlineRuns(text, options)
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

    function wordSearchBlock(node) {
        const d = DX();
        const rows = Array.isArray(node.rows) ? node.rows : [];
        const answers = Array.isArray(node.answers) ? node.answers : [];
        if (!rows.length && !answers.length) return para('');

        const colCount = Math.max(1, ...rows.map(row => row.length || 0));
        const leftWidth = 4250;
        const rightWidth = 5500;
        const cellWidth = Math.floor(leftWidth / colCount);
        const gridWidths = Array.from({ length: colCount }, () => cellWidth);
        gridWidths[gridWidths.length - 1] += leftWidth - gridWidths.reduce((a,b)=>a+b,0);

        const gridBorder = { style: d.BorderStyle.SINGLE, size: 5, color: '64748B' };
        const grid = new d.Table({
            width: { size: leftWidth, type: d.WidthType.DXA },
            columnWidths: gridWidths,
            borders: {
                top: gridBorder,
                bottom: gridBorder,
                left: gridBorder,
                right: gridBorder,
                insideHorizontal: gridBorder,
                insideVertical: gridBorder,
            },
            rows: rows.map(row => new d.TableRow({
                cantSplit: true,
                height: { value: 440, rule: d.HeightRule.EXACT },
                children: gridWidths.map((width, col) => new d.TableCell({
                    width: { size: width, type: d.WidthType.DXA },
                    verticalAlign: (d.VerticalAlignTable || d.VerticalAlign).CENTER,
                    margins: { top: 0, bottom: 0, left: 15, right: 15 },
                    children: [
                        para(row[col] || '', {
                            size: 21,
                            center: true,
                            after: 0,
                            line: 220,
                            font: TEXT_FONT
                        })
                    ]
                }))
            }))
        });

        const visualRows = Math.max(rows.length, answers.length, 1);
        const answerRows = [];
        for (let i = 0; i < visualRows; i++) {
            if (i < answers.length) {
                const widths = [520, rightWidth - 520];
                answerRows.push(new d.TableRow({
                    cantSplit: true,
                    height: { value: 440, rule: d.HeightRule.EXACT },
                    children: [
                        tableCell(
                            [para(circledNumber(answers[i]), {
                                size: 20,
                                center: true,
                                after: 0,
                                line: 220,
                                font: 'Segoe UI Symbol'
                            })],
                            widths[0],
                            { left: 0, right: 30, top: 0, bottomMargin: 0 }
                        ),
                        tableCell(
                            [para('', { after: 0, line: 220 })],
                            widths[1],
                            {
                                bottom: true,
                                bottomMargin: 85,
                                left: 0,
                                right: 50,
                                top: 0,
                                color: '64748B'
                            }
                        )
                    ]
                }));
            } else {
                answerRows.push(new d.TableRow({
                    cantSplit: true,
                    height: { value: 440, rule: d.HeightRule.EXACT },
                    children: [
                        tableCell([para('', { after: 0 })], rightWidth, {
                            columnSpan: 2,
                            left: 0, right: 0, top: 0, bottomMargin: 0
                        })
                    ]
                }));
            }
        }

        const answersTable = new d.Table({
            width: { size: rightWidth, type: d.WidthType.DXA },
            columnWidths: [520, rightWidth - 520],
            borders: noBorder(),
            rows: answerRows
        });

        const outerWidths = [leftWidth, rightWidth];
        return new d.Table({
            width: { size: leftWidth + rightWidth, type: d.WidthType.DXA },
            columnWidths: outerWidths,
            borders: noBorder(),
            rows: [
                new d.TableRow({
                    cantSplit: true,
                    children: [
                        tableCell([grid], outerWidths[0], {
                            left: 0, right: 120, top: 0, bottomMargin: 0
                        }),
                        tableCell([answersTable], outerWidths[1], {
                            left: 120, right: 0, top: 0, bottomMargin: 0
                        })
                    ]
                })
            ]
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
                    children: [new d.TextRun({ text: String(text || ''), size, bold, font: TEXT_FONT })]
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
                        children: [new d.TextRun({ text: String(node.root || ''), bold: true, size: 22, font: TEXT_FONT })]
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

    function questionParagraph(node, bodySize) {
        const d = DX();
        return new d.Paragraph({
            indent: { left: 400, hanging: 400 },
            spacing: { after: 60, line: 300 },
            children: [
                ...inlineRuns(numberLabel(node.rawNumber, node.number), { size: bodySize }),
                ...inlineRuns(' ' + (node.text || ''), { size: bodySize })
            ]
        });
    }

    function columnParagraphs(node, bodySize) {
        const d = DX();
        const count = Math.max(1, ...node.rows.map(row => row.length));
        return node.rows.map(row => new d.Paragraph({
            spacing: { after: 80, line: 300 },
            tabStops: Array.from({ length: count - 1 }, (_, i) => ({
                type: d.TabStopType.LEFT, position: Math.floor(9850 * (i + 1) / count)
            })),
            children: row.flatMap((cell, i) => [
                ...(i ? [new d.TextRun({ children: [new d.Tab()] })] : []),
                ...inlineRuns(cell, { size: bodySize })
            ])
        }));
    }

    function buildChildren(structuredText) {
        const d = DX();
        const model = MODEL().parse(structuredText);
        const profile = model.profile || {};
        const firstTextIndex = model.nodes.findIndex(n =>
            (n.type === 'text' || n.type === 'styledText' || n.type === 'sectionHeading' || n.type === 'questionLine') &&
            String(n.text || '').trim()
        );
        const children = [];
        const density = profile.density || 'normal';
        const bodyAfter = density === 'compact' ? 18 : density === 'spacious' ? 42 : 28;
        const blankAfter = density === 'compact' ? 10 : density === 'spacious' ? 34 : 20;
        const bodySize = Math.max(24, Math.round((Number(profile.bodySize) || 12) * 2));
        const headingSize = Math.round((Number(profile.headingSize) || 12) * 2);
        const titleSize = Math.round((Number(profile.titleSize) || 16) * 2);

        model.nodes.forEach((node, index) => {
            if (node.type === 'pageBreak') {
                // Uploaded page boundaries do not dictate the exported page layout.
                // Word fills each page and continues naturally onto the next.
                return;
            }
            if (node.type === 'blank') {
                children.push(para('', { after: blankAfter, line: density === 'compact' ? 180 : 200 }));
                return;
            }
            if (node.type === 'branch') {
                children.push(branchDiagram(node));
                return;
            }
            if (node.type === 'wordSearch') {
                children.push(wordSearchBlock(node));
                return;
            }
            if (node.type === 'sectionHeading') {
                const style = node.style || {};
                children.push(para(node.text || '', {
                    bold: style.weight === 'normal' ? false : true,
                    size: headingSize,
                    after: density === 'compact' ? 24 : 38,
                    keepNext: true,
                    line: density === 'compact' ? 235 : density === 'spacious' ? 290 : 260,
                    center: style.align === 'center',
                    right: style.align === 'right',
                    font: TEXT_FONT
                }));
                return;
            }
            if (node.type === 'questionLine') {
                children.push(questionParagraph(node, bodySize));
                return;
            }
            if (node.type === 'answerRule') {
                children.push(para('___________________________________________________________________________', { size: bodySize }));
                return;
            }
            if (node.type === 'answerBlank') {
                children.push(questionParagraph({ ...node, text: (node.raw.match(/_{3,}/) || ['________________'])[0] }, bodySize));
                return;
            }
            if (node.type === 'twoColumnExercise') {
                children.push(para(node.raw || '', { size: bodySize, after: 60 }));
                return;
            }
            if (node.type === 'singleExercise') {
                children.push(questionParagraph({ ...node, text: node.text + ' ' + (node.raw.match(/_{3,}/) || ['________________'])[0] }, bodySize));
                return;
            }
            if (node.type === 'table') {
                children.push(structuredTable(node, true));
                return;
            }
            if (node.type === 'columns') {
                children.push(...columnParagraphs(node, bodySize));
                return;
            }
            if (node.type === 'styledText') {
                const style = node.style || {};
                const role = style.role || 'body';
                const styledSize = style.size === 'title' ? titleSize :
                    style.size === 'heading' ? headingSize :
                    style.size === 'small' ? Math.max(16, bodySize - 2) :
                    bodySize;
                children.push(para(node.text, {
                    bold: style.weight === 'bold',
                    size: styledSize,
                    after: role === 'title' ? (density === 'compact' ? 30 : 48) :
                        role === 'heading' ? (density === 'compact' ? 24 : 38) :
                        bodyAfter,
                    keepNext: role === 'title' || role === 'heading',
                    line: density === 'compact' ? 235 : density === 'spacious' ? 290 : 260,
                    center: style.align === 'center',
                    right: style.align === 'right',
                    font: TEXT_FONT
                }));
                return;
            }

            if (node.type === 'text') {
                const heading = headingLike(node.text, index, firstTextIndex);
                const formLike = /_{3,}/.test(node.text) && /(?:Name|Class|Date|Roll|Sub|Marks|Examination|नाम|कक्षा|दिनांक)/i.test(node.text);
                const isTitle = heading && index === firstTextIndex;
                const titleAlign = profile.titleAlign || 'left';
                children.push(para(node.text, {
                    bold: isTitle ? profile.titleWeight !== 'normal' : heading,
                    size: isTitle ? titleSize : (heading ? headingSize : (formLike ? Math.max(18, bodySize - 1) : bodySize)),
                    after: formLike ? Math.max(12, bodyAfter - 8) : (heading ? (density === 'compact' ? 32 : 50) : bodyAfter),
                    keepNext: heading,
                    line: density === 'compact' ? 235 : density === 'spacious' ? 290 : 260,
                    center: isTitle && titleAlign === 'center',
                    right: isTitle && titleAlign === 'right',
                    font: TEXT_FONT
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
        if (/\[\[(?:PAGE_PROFILE:|LINE_STYLE:|QUESTION_|ANSWER_RULE|WORDSEARCH_|BRANCH_|TABLE_|COLUMN_|CIRCLED:)/i.test(xml)) {
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
        const model = MODEL().parse(structuredText);
        const profile = model.profile || {};
        const landscape = profile.orientation === 'landscape';
        const density = profile.density || 'normal';
        const margin = density === 'compact' ? 520 : density === 'spacious' ? 760 : 620;

        const doc = new d.Document({
            styles: {
                default: {
                    document: {
                        run: { font: TEXT_FONT, size: 24, color: '000000' },
                        paragraph: { spacing: { after: 28, line: 260 } }
                    }
                }
            },
            sections: [
                {
                    properties: {
                        page: {
                            size: landscape
                                ? { width: 16838, height: 11906, orientation: d.PageOrientation.LANDSCAPE }
                                : { width: 11906, height: 16838, orientation: d.PageOrientation.PORTRAIT },
                            margin: { top: margin, right: margin, bottom: margin, left: margin, header: 300, footer: 300 }
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
