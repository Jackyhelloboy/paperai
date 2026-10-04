(function (global) {
    'use strict';

    const CIRCLED = /[⓪①-⑳❶-❿]/;

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
            text,
            hasBlank: /_{3,}\s*$/.test(m[2]),
            raw: String(line || '')
        };
    }

    function parse(text) {
        const source = String(text || '').normalize('NFC');
        const lines = source.split('\n');
        const nodes = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

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

            if (!line.trim()) nodes.push({ type: 'blank' });
            else nodes.push({ type: 'text', text: line });
            i++;
        }

        return { type: 'document', nodes, source };
    }

    global.PaperAIDocumentModel = Object.freeze({
        parse,
        splitCells,
        circledNumberValue,
        readNumber
    });
})(window);
