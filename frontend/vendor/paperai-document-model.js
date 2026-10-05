(function (global) {
    'use strict';

    const CIRCLED = /[⓪①-⑳❶-❿]/;

    function normalizeQuestionMetadata(value) {
        const label = token => String(token || '').trim().replace(/[.)।:;]+$/u, '');
        let out = String(value || '').replace(/\[\[QUESTION_(SECTION|ITEM):\s*([^\n]*?)\]\]/gi, (raw, kind, body) => {
            let fields;
            if (body.includes('|')) fields = body.split(body.includes('||') ? /\s*\|\|\s*/ : /\s*\|\s*/);
            else {
                const first = body.indexOf(','), last = body.lastIndexOf(',');
                if (first < 0 || (kind.toUpperCase() === 'SECTION' && first === last)) return raw;
                fields = kind.toUpperCase() === 'SECTION'
                    ? [body.slice(0, first), body.slice(first + 1, last), body.slice(last + 1)]
                    : [body.slice(0, first), body.slice(first + 1)];
            }
            fields = fields.map(part => part.trim());
            if (fields.length !== (kind.toUpperCase() === 'SECTION' ? 3 : 2)) return raw;
            fields[0] = label(fields[0]);
            return '[[QUESTION_' + kind.toUpperCase() + ': ' + fields.join(' || ') + ']]';
        });
        out = out.replace(/^[ \t]*\[\[ANSWER_RULE(?::[ \t]*_*)?\]\][ \t]*$/gmi, '[[ANSWER_RULE]]');
        out = out.replace(/\[\[ANSWER_RULE:[ \t]*_*[ \t]*\]\]/gi, '\n[[ANSWER_RULE]]\n');
        out = out.replace(/\[\[COLUMN_(START|END)\]\]/gi, (_, edge) => '[[COLUMNS_' + edge.toUpperCase() + ']]');
        // Accept compact model responses without exposing internal layout markers.
        out = out.replace(/([^\n])(\[\[(?:COLUMNS|TABLE|WORDSEARCH)_(?:START|END)\]\])/gi, '$1\n$2')
            .replace(/(\[\[(?:COLUMNS|TABLE|WORDSEARCH)_(?:START|END)\]\])(?=[^\n])/gi, '$1\n')
            .replace(/\]\](?=\[\[(?:COLUMN_ROW|TABLE_ROW|WORDSEARCH_ROW|WORDSEARCH_ANSWER):)/gi, ']]\n')
            .replace(/([^\n])(\*\*[IVXivx]{1,8}[.)]\s+[^\n]*?\*\*)/g, '$1\n$2')
            .replace(/(\*\*[IVXivx]{1,8}[.)]\s+[^\n]*?\*\*)(?=\d+[.)]\p{L})/gu, '$1\n');
        // Repair only an unspaced, consecutive list of at least three items.
        // Decimal numbers, prose, source words and nonconsecutive labels stay intact.
        out = out.split('\n').map(line => {
            if (!/^\s*\d+[.)]\p{L}/u.test(line)) return line;
            const labels = [...line.matchAll(/\d+[.)](?=\p{L})/gu)];
            if (labels.length < 3 || labels.some((m, i) => i && Number.parseInt(m[0], 10) !== Number.parseInt(labels[i - 1][0], 10) + 1)) return line;
            return labels.map((m, i) => line.slice(i ? m.index : 0, labels[i + 1]?.index ?? line.length)).join('\n');
        }).join('\n');
        // The model sometimes prints a heading and immediately repeats it as metadata.
        let previous = '';
        return out.split('\n').filter(line => {
            if (!line.trim()) return true;
            const section = line.match(/^\[\[QUESTION_SECTION: (.*?) \|\| (.*?) \|\| (.*?)\]\]$/i);
            const visible = section ? [section[1] + '.', section[2], section[3]].filter(Boolean).join(' ') : line;
            const key = visible.trim().replace(/^([IVXivx]+)[.)।:;]+\s*/u, '$1. ').replace(/\s+/g, ' ');
            const duplicate = /^(?:[IVXivx]+\.\s|\[\[QUESTION_SECTION:)/.test(visible) && key === previous;
            previous = key;
            return !duplicate;
        }).join('\n');
    }

    // Older results may include generated audit copy. It is not paper content.
    // Keep an ordinary source line beginning with "Review:" unless it belongs
    // to the specific generated block.
    function cleanOutputText(value) {
        let inAudit = false;
        return normalizeQuestionMetadata(String(value || '').split('\n').filter(line => {
            if (/^\s*(?:\*\*)?(?:AI reconstruction check|Paper pattern):(?:\*\*)?/i.test(line)) {
                inAudit = true;
                return false;
            }
            if (inAudit && /^\s*(?:\*\*)?Review:(?:\*\*)?/i.test(line)) return false;
            if (line.trim()) inAudit = false;
            return true;
        }).join('\n').replace(
            /visible Roman\/section label|exact visible (?:instruction|marks formula|question number|question text)/gi,
            '[unclear]'
        ));
    }

    function circledNumberValue(ch) {
        if (!ch) return null;
        const cp = ch.codePointAt(0);
        if (cp === 0x24EA) return 0;
        if (cp >= 0x2460 && cp <= 0x2473) return cp - 0x245F;
        if (cp >= 0x2776 && cp <= 0x277F) return cp - 0x2775;
        return null;
    }

    function splitCells(value) {
        return String(value || '').split(/\s*\|\|\s*/).map(v => v.trim());
    }

    function readNumber(token) {
        const source = String(token || '').trim();
        let m = source.match(/^\[\[CIRCLED:\s*(\d+)\s*\]\]$/i);
        if (m) return Number(m[1]);
        if (/^\d+[.)]?$/.test(source)) return Number(source.match(/\d+/)[0]);
        if (source.length === 1 && CIRCLED.test(source)) return circledNumberValue(source);
        return null;
    }

    function parseBranch(lines, start) {
        const m = String(lines[start] || '').match(/^\s*\[\[BRANCH_ROOT:\s*([\s\S]*?)\]\]\s*$/i);
        if (!m) return null;
        const items = [];
        let i = start + 1;
        while (i < lines.length) {
            if (/^\s*\[\[BRANCH_END\]\]\s*$/i.test(lines[i])) {
                return { node: { type: 'branch', root: m[1].trim(), items }, next: i + 1 };
            }
            const row = String(lines[i] || '').match(/^\s*\[\[BRANCH_ITEM:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i);
            if (row) items.push({ left: row[1].trim(), right: row[2].trim() });
            i++;
        }
        return items.length ? { node: { type: 'branch', root: m[1].trim(), items }, next: i } : null;
    }

    function parseWordSearch(lines, start) {
        if (!/^\s*\[\[WORDSEARCH_START\]\]\s*$/i.test(String(lines[start] || ''))) return null;

        const rows = [];
        const answers = [];
        let i = start + 1;

        while (i < lines.length) {
            if (/^\s*\[\[WORDSEARCH_END\]\]\s*$/i.test(lines[i])) {
                return {
                    node: { type: 'wordSearch', rows, answers },
                    next: i + 1
                };
            }

            const row = String(lines[i] || '').match(
                /^\s*\[\[WORDSEARCH_ROW:\s*([\s\S]*?)\]\]\s*$/i
            );
            if (row) {
                rows.push(splitCells(row[1]));
                i++;
                continue;
            }

            const answer = String(lines[i] || '').match(
                /^\s*\[\[WORDSEARCH_ANSWER:\s*([^\]]+?)\s*\]\]\s*$/i
            );
            if (answer) answers.push(readNumber(answer[1]) ?? answer[1].trim());

            i++;
        }

        return rows.length || answers.length
            ? { node: { type: 'wordSearch', rows, answers }, next: i }
            : null;
    }

    function parseStructured(lines, start, kind) {
        const table = kind === 'table';
        const startRe = table ? /^\s*\[\[TABLE_START\]\]\s*$/i : /^\s*\[\[COLUMNS_START\]\]\s*$/i;
        if (!startRe.test(String(lines[start] || ''))) return null;
        const endRe = table ? /^\s*\[\[TABLE_END\]\]\s*$/i : /^\s*\[\[COLUMNS_END\]\]\s*$/i;
        const rowRe = table
            ? /^\s*\[\[TABLE_ROW:\s*([\s\S]*?)\]\]\s*$/i
            : /^\s*\[\[COLUMN_ROW:\s*([\s\S]*?)\]\]\s*$/i;
        const rows = [];
        let i = start + 1;
        while (i < lines.length) {
            if (endRe.test(lines[i])) return { node: { type: kind, rows }, next: i + 1 };
            const m = String(lines[i] || '').match(rowRe);
            if (m) rows.push(splitCells(m[1]));
            i++;
        }
        return rows.length ? { node: { type: kind, rows }, next: i } : null;
    }

    function parseAnswerBlank(line) {
        const m = String(line || '').match(
            /^\s*((?:\[\[CIRCLED:\s*\d+\s*\]\]|[⓪①-⑳❶-❿]|\d+[.)]?))\s*_{8,}\s*$/
        );
        if (!m) return null;
        return { type: 'answerBlank', number: readNumber(m[1]), rawNumber: m[1], raw: String(line || '') };
    }

    function parseTwoColumnExercise(line) {
        const m = String(line || '').match(
            /^\s*(\[\[CIRCLED:\s*\d+\s*\]\]|[⓪①-⑳❶-❿]|\d+[.)]?)\s+([\s\S]*?_{3,})\s+(\[\[CIRCLED:\s*\d+\s*\]\]|[⓪①-⑳❶-❿]|\d+[.)]?)\s+([\s\S]*?_{3,})\s*$/
        );
        if (!m) return null;
        const item = (num, raw) => ({
            number: readNumber(num),
            rawNumber: num,
            text: raw.replace(/_{3,}\s*$/, '').trim(),
            hasBlank: /_{3,}\s*$/.test(raw)
        });
        return { type: 'twoColumnExercise', left: item(m[1], m[2]), right: item(m[3], m[4]), raw: String(line || '') };
    }

    function parseSingleExercise(line) {
        const m = String(line || '').match(
            /^\s*(\[\[CIRCLED:\s*\d+\s*\]\]|[⓪①-⑳❶-❿]|\d+[.)]?)\s+([\s\S]*?_{3,})\s*$/
        );
        if (!m) return null;
        const text = m[2].replace(/_{3,}\s*$/, '').trim();
        if (!text) return null;
        return {
            type: 'singleExercise',
            number: readNumber(m[1]),
            rawNumber: m[1],
            text,
            hasBlank: /_{3,}\s*$/.test(m[2]),
            raw: String(line || '')
        };
    }

    function parseStyledLine(line) {
        const m = String(line || '').match(
            /^\s*\[\[LINE_STYLE:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i
        );
        if (!m) return null;

        const meta = {};
        String(m[1] || '').split(';').forEach(part => {
            const pieces = part.split('=');
            if (pieces.length < 2) return;
            const key = pieces.shift().trim();
            const value = pieces.join('=').trim();
            if (key) meta[key] = value;
        });

        return {
            type: 'styledText',
            text: String(m[2] || '').trim(),
            style: {
                role: ['title','heading','body'].includes(meta.role) ? meta.role : 'body',
                align: ['left','center','right'].includes(meta.align) ? meta.align : 'left',
                weight: meta.weight === 'bold' ? 'bold' : 'normal',
                size: ['small','body','heading','title'].includes(meta.size) ? meta.size : 'body'
            }
        };
    }

    function parsePageProfileLine(line) {
        const m = String(line || '').match(/^\s*\[\[PAGE_PROFILE:\s*([\s\S]*?)\]\]\s*$/i);
        if (!m) return null;

        const profile = {};
        String(m[1] || '').split(';').forEach(part => {
            const pair = part.split('=');
            if (pair.length < 2) return;
            const key = pair.shift().trim();
            const value = pair.join('=').trim();
            if (!key) return;
            profile[key] = value;
        });

        const number = (key, min, max, fallback) => {
            const n = Number(profile[key]);
            return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
        };

        return {
            kind: ['question-paper','worksheet','form','table','general'].includes(profile.kind) ? profile.kind : 'general',
            orientation: profile.orientation === 'landscape' ? 'landscape' : 'portrait',
            density: ['compact','normal','spacious'].includes(profile.density) ? profile.density : 'normal',
            titleAlign: ['left','center','right'].includes(profile.title_align) ? profile.title_align : 'left',
            titleWeight: profile.title_weight === 'bold' ? 'bold' : 'normal',
            columns: Math.max(1, Math.min(3, Number(profile.columns) || 1)),
            titleSize: number('title_size', 12, 20, 16),
            headingSize: number('heading_size', 10, 16, 12),
            bodySize: number('body_size', 9, 14, 10),
            englishFont: 'Tahoma',
            confidence: ['high','medium','low'].includes(profile.confidence) ? profile.confidence : 'low'
        };
    }

    function devanagariDigitToNumber(value) {
        const map = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
        const normalized = String(value || '').replace(/[०-९]/g, ch => map[ch] || ch);
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
    }

    function parseMarksPattern(text) {
        const m = String(text || '').match(/(\d+|[०-९]+)\s*[x×X]\s*(\d+|[०-९]+)\s*=\s*(\d+|[०-९]+)\s*M?/i);
        if (!m) return null;
        return {
            raw: m[0],
            expectedItems: devanagariDigitToNumber(m[1]),
            marksEach: devanagariDigitToNumber(m[2]),
            totalMarks: devanagariDigitToNumber(m[3])
        };
    }

    function parseSectionHeadingLine(text, style = null) {
        const source = String(text || '').trim();
        if (!source) return null;
        const m = source.match(/^\s*([IVXivx]{1,8})\s*[.)।:;\-]{0,3}\s+(.+)$/);
        if (!m) return null;

        const body = m[2].trim();
        const marks = parseMarksPattern(source);
        const title = marks ? body.replace(marks.raw, '').replace(/[|·\-–—]+\s*$/, '').trim() : body;

        return {
            type: 'sectionHeading',
            label: m[1].toUpperCase(),
            text: source,
            title,
            marks,
            style: style || null
        };
    }

    function parseQuestionLine(text, style = null) {
        const source = String(text || '').trim();
        if (!source) return null;

        const m = source.match(/^\s*((?:\d+|[०-९]+|[⓪①-⑳❶-❿]))\s*[.)।:;\-]{1,3}\s*(.+)$/u);
        if (!m) return null;

        const number = CIRCLED.test(m[1])
            ? circledNumberValue(m[1])
            : devanagariDigitToNumber(m[1]);

        return {
            type: 'questionLine',
            number,
            rawNumber: m[1],
            text: m[2].trim(),
            raw: source,
            style: style || null
        };
    }

    function parseAnswerRuleLine(text) {
        const source = String(text || '').trim();
        if (!/^_{8,}$/.test(source)) return null;
        return { type: 'answerRule', raw: source };
    }

    function parseQuestionPaperMarker(line) {
        const source = String(line || '');

        const section = source.match(
            /^\s*\[\[QUESTION_SECTION:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i
        );
        if (section) {
            const label = String(section[1] || '').trim();
            const instruction = String(section[2] || '').trim();
            const marksText = String(section[3] || '').trim();
            const visible = [label ? label + '.' : '', instruction, marksText].filter(Boolean).join(' ');
            return {
                type: 'sectionHeading',
                label: label.toUpperCase(),
                title: instruction,
                text: visible,
                marks: parseMarksPattern(marksText || visible),
                style: null
            };
        }

        const item = source.match(
            /^\s*\[\[QUESTION_ITEM:\s*([\s\S]*?)\s*\|\|\s*([\s\S]*?)\]\]\s*$/i
        );
        if (item) {
            const rawNumber = String(item[1] || '').trim();
            const questionText = String(item[2] || '').trim();
            const number = CIRCLED.test(rawNumber)
                ? circledNumberValue(rawNumber)
                : devanagariDigitToNumber(rawNumber);
            return {
                type: 'questionLine',
                number,
                rawNumber,
                text: questionText,
                raw: rawNumber + '. ' + questionText,
                style: null
            };
        }

        if (/^\s*\[\[ANSWER_RULE\]\]\s*$/i.test(source)) {
            return { type: 'answerRule', raw: '___________________________________________________________________________' };
        }

        return null;
    }

    function parse(text) {
        const source = cleanOutputText(text).normalize('NFC');
        const lines = source.split('\n');
        const nodes = [];
        let profile = null;
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            const pageProfile = parsePageProfileLine(line);
            if (pageProfile) {
                profile = pageProfile;
                i++;
                continue;
            }

            const questionMarker = parseQuestionPaperMarker(line);
            if (questionMarker) {
                nodes.push(questionMarker);
                i++;
                continue;
            }

            const styledLine = parseStyledLine(line);
            if (styledLine) {
                const section = parseSectionHeadingLine(styledLine.text, styledLine.style);
                if (section) {
                    nodes.push(section);
                } else {
                    const question = parseQuestionLine(styledLine.text, styledLine.style);
                    nodes.push(question || styledLine);
                }
                i++;
                continue;
            }

            if (/^\s*\[\[PAGE_BREAK\]\]\s*$/i.test(line)) {
                nodes.push({ type: 'pageBreak' });
                i++;
                continue;
            }

            const wordSearch = parseWordSearch(lines, i);
            if (wordSearch) { nodes.push(wordSearch.node); i = wordSearch.next; continue; }

            const table = parseStructured(lines, i, 'table');
            if (table) { nodes.push(table.node); i = table.next; continue; }

            const columns = parseStructured(lines, i, 'columns');
            if (columns) { nodes.push(columns.node); i = columns.next; continue; }

            const branch = parseBranch(lines, i);
            if (branch) { nodes.push(branch.node); i = branch.next; continue; }

            const answer = parseAnswerBlank(line);
            if (answer) {
                nodes.push(answer);
                i++;
                while (i < lines.length && /^\s*_{2,}\s*$/.test(lines[i])) i++;
                continue;
            }

            const pair = parseTwoColumnExercise(line);
            if (pair) { nodes.push(pair); i++; continue; }

            const single = parseSingleExercise(line);
            if (single) { nodes.push(single); i++; continue; }

            const section = parseSectionHeadingLine(line);
            if (section) { nodes.push(section); i++; continue; }

            const question = parseQuestionLine(line);
            if (question) { nodes.push(question); i++; continue; }

            const answerRule = parseAnswerRuleLine(line);
            if (answerRule) { nodes.push(answerRule); i++; continue; }

            if (!line.trim()) nodes.push({ type: 'blank' });
            else nodes.push({ type: 'text', text: line });
            i++;
        }

        return {
            type: 'document',
            nodes,
            source,
            profile: profile || {
                kind: 'general',
                orientation: 'portrait',
                density: 'normal',
                titleAlign: 'left',
                titleWeight: 'normal',
                columns: 1,
                titleSize: 16,
                headingSize: 12,
                bodySize: 10,
                englishFont: 'Tahoma',
                confidence: 'low'
            }
        };
    }

    global.PaperAIDocumentModel = Object.freeze({
        parse,
        cleanOutputText,
        normalizeQuestionMetadata,
        splitCells,
        circledNumberValue,
        readNumber,
        parseMarksPattern
    });
})(window);

