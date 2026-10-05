/* Shared, offline teacher tools. No network calls or automatic AI. */
(function (root) {
    'use strict';
    const telugu = Object.freeze({ enti: 'ఏంటి', emiti: 'ఏమిటి', enduku: 'ఎందుకు', ela: 'ఎలా', evaru: 'ఎవరు', ekkada: 'ఎక్కడ', avunu: 'అవును', kaadu: 'కాదు', nenu: 'నేను', nuvvu: 'నువ్వు', meeru: 'మీరు', idi: 'ఇది', adi: 'అది' });
    function nativeRoman(text, language) {
        if (language !== 'te') return '';
        let replaced = false, unknown = false;
        const output = String(text).replace(/[A-Za-z]+/g, word => {
            const value = telugu[word.toLowerCase()];
            if (!value) { unknown = true; return word; }
            replaced = true; return value;
        });
        return replaced && !unknown ? output : '';
    }
    function sentenceAt(text, caret) {
        text = String(text); caret = Math.max(0, Math.min(text.length, caret));
        let start = caret, end = caret;
        // A caret immediately after punctuation belongs to that sentence.
        if (start && /[.!?।]/.test(text[start - 1])) start--;
        while (start && !/[.!?।\n]/.test(text[start - 1])) start--;
        while (end < text.length && !/[.!?।\n]/.test(text[end])) end++;
        if (end < text.length && text[end] !== '\n') end++;
        const raw = text.slice(start, end), source = raw.trim();
        start += raw.indexOf(source);
        return source && source.length <= 600 ? { start, end: start + source.length, source } : null;
    }
    function numericTokens(text) {
        return String(text).match(/[0-9०-९౦-౯]+(?:[.,][0-9०-९౦-౯]+)*/g) || [];
    }
    function preservesNumbers(source, candidate) {
        if (JSON.stringify(numericTokens(source)) !== JSON.stringify(numericTokens(candidate))) return false;
        const formulas = text => String(text).match(/\$[^$]+\$/g) || [];
        if (JSON.stringify(formulas(source)) !== JSON.stringify(formulas(candidate))) return false;
        const operators = text => String(text).match(/[+×÷=^_≤≥≠∑∫√]/g) || [];
        return JSON.stringify(operators(source)) === JSON.stringify(operators(candidate));
    }
    function marksSummary(text) {
        const normalized = String(text).replace(/[०-९౦-౯]/g, c => String(c.charCodeAt(0) - (c >= '౦' ? 0x0c66 : 0x0966)));
        const lines = normalized.split(/\n/), sections = [], warnings = [];
        let declared = null, items = 0;
        for (const line of lines) {
            const total = line.match(/(?:total\s*(?:marks)?|maximum\s*marks|max\.?\s*marks|कुल\s*अंक|మొత్తం\s*మార్కులు)\s*[:=–-]?\s*(\d+(?:\.\d+)?)/i);
            if (total) declared = Number(total[1]);
            if (/^\s*(?:\d+[.)]|\[\[QUESTION_(?:LINE|NUMBER):)/.test(line)) items++;
            const expr = line.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*(?:M\b|marks?\b|अंक|మార్కులు)/i);
            if (expr) {
                const count = Number(expr[1]), each = Number(expr[2]), shown = Number(expr[3]);
                sections.push({ count, each, marks: shown, correct: Math.abs(count * each - shown) < 0.001, label: line.replace(/\[\[[^\]]*\]\]/g, '').replace(/\*\*/g, '').trim() });
                if (Math.abs(count * each - shown) >= 0.001) warnings.push('Check section: ' + count + ' × ' + each + ' does not equal ' + shown + '.');
            } else if (/\d+\s*[xX×*][^\n]*\bM\b/i.test(line)) warnings.push('A section has an unreadable marks expression.');
        }
        const sectionMarks = sections.reduce((sum, s) => sum + s.marks, 0);
        if (declared !== null && sections.length && sectionMarks !== declared) warnings.push('Detected section marks (' + sectionMarks + ') differ from the stated total (' + declared + ').');
        return { items, sections, sectionMarks, declared, warnings, complete: declared !== null && sections.length > 0 && sectionMarks === declared && warnings.length === 0 };
    }
    root.PaperAITeacherTools = Object.freeze({ nativeRoman, sentenceAt, preservesNumbers, marksSummary });
})(typeof window !== 'undefined' ? window : globalThis);
