(function (global) {
    'use strict';

    const FAMILY = 'PaperAIDevanagari';
    const KEY = '{4A6B57A2-6289-4F6C-A41D-17D678216ECB}';
    const FONT_PART = 'word/fonts/PaperAIDevanagari.odttf';
    const FONT_REL = 'rIdPaperAIHindiFont';
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const scriptUrl = global.document?.currentScript?.src;
    const fontUrl = scriptUrl ? new URL('fonts/PaperAIDevanagari-Regular.ttf', scriptUrl).href
        : 'vendor/fonts/PaperAIDevanagari-Regular.ttf';
    let fontPromise = null;

    async function loadFont() {
        if (!fontPromise) {
            fontPromise = (async () => {
                const response = await global.fetch(fontUrl, {signal:AbortSignal.timeout(20000)});
                if (!response.ok) throw new Error('Hindi font could not load. Please try Word export again.');
                const bytes = new Uint8Array(await response.arrayBuffer());
                if (bytes.length < 32 || bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) {
                    throw new Error('Hindi font download was invalid. Please refresh and try Word export again.');
                }
                return bytes;
            })().catch(error => { fontPromise = null; throw error; });
        }
        return fontPromise;
    }

    // ECMA-376 font obfuscation: XOR only the first 32 bytes with the reversed GUID.
    function obfuscateFont(source) {
        const bytes = new Uint8Array(source);
        const key = KEY.replace(/[{}-]/g, '').match(/../g).map(x => parseInt(x, 16)).reverse();
        for (let i = 0; i < 32; i++) bytes[i] ^= key[i % 16];
        return bytes;
    }

    function appendXml(xml, tag, content) {
        const close = '</' + tag + '>';
        if (xml.includes(close)) return xml.replace(close, content + close);
        return xml.replace(new RegExp('<' + tag + '(\\s[^>]*?)?\\s*/>'), (_, attributes) =>
            '<' + tag + (attributes || '') + '>' + content + close);
    }

    function hindiRuns(xml) {
        return xml.replace(/<w:r(?=\s|>)[^>]*>[\s\S]*?<\/w:r>/g, run => {
            if (!/[\u0900-\u097f]/u.test(run)) return run;
            const props = '<w:rFonts w:ascii="' + FAMILY + '" w:hAnsi="' + FAMILY +
                '" w:eastAsia="' + FAMILY + '" w:cs="' + FAMILY + '"/>' +
                '<w:cs/><w:lang w:val="hi-IN" w:eastAsia="hi-IN" w:bidi="hi-IN"/>';
            const clean = run.replace(/<w:rFonts\b[^>]*\/\s*>|<w:lang\b[^>]*\/\s*>|<w:cs\b[^>]*\/\s*>/g, '');
            return clean.includes('<w:rPr>') ? clean.replace('<w:rPr>', '<w:rPr>' + props)
                : clean.replace(/(<w:r(?=\s|>)[^>]*>)/, '$1<w:rPr>' + props + '</w:rPr>');
        });
    }

    async function finalize(blob, source) {
        if (!/[\u0900-\u097f]/u.test(String(source || ''))) return blob;
        if (!global.JSZip) throw new Error('Word font support could not load. Refresh and try again.');
        const zip = await global.JSZip.loadAsync(await blob.arrayBuffer());
        if (!zip.file('word/document.xml')) throw new Error('Word document is missing its content.');
        const xml = await zip.file('word/document.xml').async('string');
        if (!/[\u0900-\u097f]/u.test(xml)) return blob;
        const bytes = await loadFont();
        zip.file('word/document.xml', hindiRuns(xml));
        // Shape labels, headers and footers use the same readable font as body text.
        for (const file of Object.values(zip.files)) {
            if (!file.dir && /^word\/(?:header|footer)\d+\.xml$/.test(file.name)) {
                zip.file(file.name, hindiRuns(await file.async('string')));
            }
        }
        zip.file(FONT_PART, obfuscateFont(bytes));
        const font = '<w:font w:name="' + FAMILY + '"><w:family w:val="swiss"/><w:pitch w:val="variable"/>' +
            '<w:embedRegular r:id="' + FONT_REL + '" w:fontKey="' + KEY + '" w:subsetted="false"/></w:font>';
        const existingTable = zip.file('word/fontTable.xml');
        const fontTable = existingTable ? await existingTable.async('string')
            : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="' + W + '" xmlns:r="' + R + '"></w:fonts>';
        zip.file('word/fontTable.xml', appendXml(fontTable, 'w:fonts', font));
        const relPart = 'word/_rels/fontTable.xml.rels';
        const existingRels = zip.file(relPart);
        const fontRels = existingRels ? await existingRels.async('string') : '<Relationships xmlns="' + REL + '"></Relationships>';
        zip.file(relPart, appendXml(fontRels, 'Relationships', '<Relationship Id="' + FONT_REL + '" Type="' + R +
            '/font" Target="fonts/PaperAIDevanagari.odttf"/>'));
        const docRels = await zip.file('word/_rels/document.xml.rels').async('string');
        if (!docRels.includes(R + '/fontTable')) zip.file('word/_rels/document.xml.rels', appendXml(docRels, 'Relationships',
            '<Relationship Id="rIdPaperAIFontTable" Type="' + R + '/fontTable" Target="fontTable.xml"/>'));
        let contentTypes = await zip.file('[Content_Types].xml').async('string');
        if (!contentTypes.includes('Extension="odttf"')) contentTypes = appendXml(contentTypes, 'Types',
            '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>');
        if (!contentTypes.includes('PartName="/word/fontTable.xml"')) contentTypes = appendXml(contentTypes, 'Types',
            '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>');
        zip.file('[Content_Types].xml', contentTypes);
        // Keep the complete font on subsequent saves so manual Hindi editing still works.
        const settingsPart = zip.file('word/settings.xml');
        let settings = settingsPart ? await settingsPart.async('string') : '<w:settings xmlns:w="' + W + '"></w:settings>';
        settings = settings.replace(/<w:embedTrueTypeFonts\b[^>]*\/>|<w:saveSubsetFonts\b[^>]*\/>/g, '');
        settings = settings.replace(/(<w:settings\b[^>]*>)/, '$1<w:embedTrueTypeFonts/><w:saveSubsetFonts w:val="false"/>');
        zip.file('word/settings.xml', settings);
        if (!docRels.includes(R + '/settings')) zip.file('word/_rels/document.xml.rels', appendXml(
            await zip.file('word/_rels/document.xml.rels').async('string'), 'Relationships',
            '<Relationship Id="rIdPaperAISettings" Type="' + R + '/settings" Target="settings.xml"/>'));
        if (!contentTypes.includes('PartName="/word/settings.xml"')) zip.file('[Content_Types].xml', appendXml(contentTypes, 'Types',
            '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'));
        return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
    }

    global.PaperAIWordFonts = Object.freeze({finalize});
})(window);
