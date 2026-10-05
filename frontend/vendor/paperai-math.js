/* Literal math formatting for previews and editable Word equations. No solving. */
(function (root) {
    'use strict';
    const symbols = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', theta:'θ', pi:'π', sigma:'σ', omega:'ω', Delta:'Δ', Sigma:'Σ', Omega:'Ω', times:'×', div:'÷', cdot:'·', pm:'±', le:'≤', leq:'≤', ge:'≥', geq:'≥', neq:'≠', approx:'≈', infty:'∞', to:'→', angle:'∠', degree:'°', percent:'%', sin:'sin', cos:'cos', tan:'tan', log:'log', ln:'ln' };
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    function parse(source) {
        if (source.length > 2000) throw Error('Equation too long');
        let i = 0, depth = 0;
        function group() {
            if (++depth > 30) throw Error('Equation too deep');
            while (/\s/.test(source[i] || '') && i < source.length) i++;
            let result;
            if (source[i] === '{') { i++; result = sequence('}'); if (source[i++] !== '}') throw Error('Unclosed group'); }
            else result = [atom(false)];
            depth--; return result;
        }
        function atom(allowScripts = true) {
            if (i >= source.length) throw Error('Missing equation term');
            let value;
            if (source[i] === '{') value = {type:'group', body:group()};
            else if (source[i] === '\\') {
                i++; const match = source.slice(i).match(/^[A-Za-z]+|^[%{}]/);
                if (!match) throw Error('Unsupported math command');
                i += match[0].length; const command = match[0];
                if (command === 'frac' || command === 'dfrac' || command === 'tfrac') value = {type:'fraction', top:group(), bottom:group()};
                else if (command === 'sqrt') {
                    let degree = null;
                    if (source[i] === '[') { i++; degree = sequence(']'); if (source[i++] !== ']') throw Error('Unclosed root degree'); }
                    value = {type:'root', body:group(), degree};
                } else if (command === 'text' || command === 'mathrm') value = {type:'group', body:group()};
                else if (command === 'left' || command === 'right') value = atom();
                else if (command === 'sum' || command === 'int') value = {type:'operator', value:command === 'sum' ? '∑' : '∫'};
                else if (command === 'begin') {
                    const environment = source.slice(i).match(/^\{(bmatrix|pmatrix|matrix)\}/);
                    if (!environment) throw Error('Unsupported equation environment');
                    i += environment[0].length;
                    const closing = '\\end{' + environment[1] + '}', end = source.indexOf(closing, i);
                    if (end < 0) throw Error('Unclosed matrix');
                    const rows = source.slice(i, end).split(/\\\\/).map(row => row.split('&').map(cell => parse(cell.trim())));
                    if (rows.length > 12 || rows.some(row => row.length > 12 || row.length !== rows[0].length)) throw Error('Invalid matrix');
                    i = end + closing.length; value = {type:'matrix', rows, fence:environment[1]};
                } else if (symbols[command]) value = {type:'text', value:symbols[command]};
                else if (command === '{' || command === '}' || command === '%') value = {type:'text', value:command};
                else throw Error('Unsupported math command: ' + command);
            } else value = {type:'text', value:source[i++]};
            let sub = null, sup = null;
            while (allowScripts && (source[i] === '^' || source[i] === '_')) {
                const script = source[i++], body = group();
                if (script === '^') sup = body; else sub = body;
            }
            return sub || sup ? {type:'script', body:[value], sub, sup} : value;
        }
        function sequence(end) {
            const result = [];
            while (i < source.length && source[i] !== end) {
                if (source[i] === '}') throw Error('Unexpected brace');
                result.push(atom());
            }
            return result;
        }
        return sequence(null);
    }
    function mathml(nodes) {
        return nodes.map(node => {
            if (node.type === 'fraction') return '<mfrac><mrow>' + mathml(node.top) + '</mrow><mrow>' + mathml(node.bottom) + '</mrow></mfrac>';
            if (node.type === 'root') return node.degree ? '<mroot><mrow>' + mathml(node.body) + '</mrow><mrow>' + mathml(node.degree) + '</mrow></mroot>' : '<msqrt>' + mathml(node.body) + '</msqrt>';
            if (node.type === 'group') return '<mrow>' + mathml(node.body) + '</mrow>';
            if (node.type === 'script') {
                const tag = node.sub && node.sup ? 'msubsup' : node.sub ? 'msub' : 'msup';
                return '<' + tag + '><mrow>' + mathml(node.body) + '</mrow>' + (node.sub ? '<mrow>' + mathml(node.sub) + '</mrow>' : '') + (node.sup ? '<mrow>' + mathml(node.sup) + '</mrow>' : '') + '</' + tag + '>';
            }
            if (node.type === 'matrix') {
                const table = '<mtable>' + node.rows.map(row => '<mtr>' + row.map(cell => '<mtd><mrow>' + mathml(cell) + '</mrow></mtd>').join('') + '</mtr>').join('') + '</mtable>';
                return node.fence === 'matrix' ? table : '<mrow><mo>' + (node.fence === 'bmatrix' ? '[' : '(') + '</mo>' + table + '<mo>' + (node.fence === 'bmatrix' ? ']' : ')') + '</mo></mrow>';
            }
            const tag = /^\d$/.test(node.value) ? 'mn' : /^[\p{L}]$/u.test(node.value) ? 'mi' : 'mo';
            return '<' + tag + '>' + escape(node.value) + '</' + tag + '>';
        }).join('');
    }
    function omml(nodes) {
        return nodes.map(node => {
            if (node.type === 'fraction') return '<m:f><m:num>' + omml(node.top) + '</m:num><m:den>' + omml(node.bottom) + '</m:den></m:f>';
            if (node.type === 'root') return '<m:rad><m:radPr><m:degHide m:val="' + (node.degree ? '0' : '1') + '"/></m:radPr><m:deg>' + omml(node.degree || []) + '</m:deg><m:e>' + omml(node.body) + '</m:e></m:rad>';
            if (node.type === 'group') return omml(node.body);
            if (node.type === 'script') {
                const tag = node.sub && node.sup ? 'm:sSubSup' : node.sub ? 'm:sSub' : 'm:sSup';
                return '<' + tag + '><m:e>' + omml(node.body) + '</m:e>' + (node.sub ? '<m:sub>' + omml(node.sub) + '</m:sub>' : '') + (node.sup ? '<m:sup>' + omml(node.sup) + '</m:sup>' : '') + '</' + tag + '>';
            }
            if (node.type === 'matrix') {
                const matrix = '<m:m>' + node.rows.map(row => '<m:mr>' + row.map(cell => '<m:e>' + omml(cell) + '</m:e>').join('') + '</m:mr>').join('') + '</m:m>';
                return node.fence === 'matrix' ? matrix : '<m:d><m:dPr><m:begChr m:val="' + (node.fence === 'bmatrix' ? '[' : '(') + '"/><m:endChr m:val="' + (node.fence === 'bmatrix' ? ']' : ')') + '"/></m:dPr><m:e>' + matrix + '</m:e></m:d>';
            }
            return '<m:r><m:t xml:space="preserve">' + escape(node.value) + '</m:t></m:r>';
        }).join('');
    }
    function parts(text) {
        const result = [], regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
        let last = 0, match;
        while ((match = regex.exec(text))) {
            if (match.index > last) result.push({text:text.slice(last, match.index)});
            try { result.push({math:parse(match[1] || match[2] || match[3] || match[4]), source:match[0]}); }
            catch (_) { result.push({text:match[0]}); }
            last = regex.lastIndex;
        }
        if (last < text.length) result.push({text:text.slice(last)});
        return result;
    }
    function preview(text) {
        return parts(String(text)).map(part => part.math ? '<math xmlns="http://www.w3.org/1998/Math/MathML" aria-label="' + escape(part.source) + '"><mrow>' + mathml(part.math) + '</mrow></math>' : escape(part.text)).join('');
    }
    function word(part, docx) {
        const xml = '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' + omml(part.math) + '</m:oMath>';
        return docx.ImportedXmlComponent.fromXmlString(xml);
    }
    root.PaperAIMath = Object.freeze({ parse, parts, preview, word, omml });
})(typeof window !== 'undefined' ? window : globalThis);
