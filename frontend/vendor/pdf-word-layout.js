(function (root) {
    'use strict';
    // Inline images are attached to real page paragraphs, never absolute page
    // coordinates. Floating page-relative shapes can collapse in Office viewers.
    function pageGeometry(width, height) {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            throw new Error('Invalid PDF page dimensions.');
        }
        const scale = Math.min(1, 1584 / Math.max(width, height));
        return {width: Math.round(width * scale * 20), height: Math.round(height * scale * 20)};
    }
    function sectionXml(size) {
        return '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="' + size.width + '" w:h="' + size.height +
            '"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
    }
    function pictureXml(index, size) {
        const fit = (size.height - 100) / size.height;
        const cx = Math.round(size.width * fit * 635), cy = (size.height - 100) * 635;
        return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy +
            '"/><wp:docPr id="' + index + '" name="PDF page ' + index + '" descr="Source PDF page preserved as an image"/>' +
            '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
            '<pic:nvPicPr><pic:cNvPr id="' + index + '" name="page-' + index + '.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
            '<pic:blipFill><a:blip r:embed="rIdPage' + index + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
            '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy +
            '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
            '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    function documentXml(pages) {
        if (!pages.length) throw new Error('The PDF has no pages.');
        let body = '';
        pages.forEach((page, i) => {
            const size = pageGeometry(page.width, page.height);
            const section = i < pages.length - 1 ? sectionXml(size) : '';
            body += '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>' + section +
                '</w:pPr>' + pictureXml(i + 1, size) + '</w:p>';
            if (i === pages.length - 1) body += sectionXml(size);
        });
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' +
            'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
            'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
            'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
            'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' + body + '</w:body></w:document>';
    }
    async function makePdfWord(pdfFile, options = {}) {
        const pdfjs = options.pdfjs || root.pdfjsLib;
        const Zip = options.Zip || root.JSZip;
        const createCanvas = options.createCanvas || (() => root.document.createElement('canvas'));
        if (!pdfjs || !Zip) throw new Error('PDF or Word library failed to load. Refresh and try again.');
        const loading = pdfjs.getDocument({data: await pdfFile.arrayBuffer(), isEvalSupported: false});
        let pdf;
        try {
            pdf = await loading.promise;
            const zip = new Zip(), pages = [], rels = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                options.onProgress?.(i, pdf.numPages);
                const page = await pdf.getPage(i), size = page.getViewport({scale: 1});
                // Bound canvas memory for large-format scans, processing one page at a time.
                const scale = Math.min(2, 4096 / Math.max(size.width, size.height), Math.sqrt(12000000 / (size.width * size.height)));
                const viewport = page.getViewport({scale}), canvas = createCanvas();
                canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                try {
                    const ctx = canvas.getContext('2d', {alpha: false});
                    if (!ctx) throw new Error('Could not create the PDF page canvas.');
                    await page.render({canvasContext: ctx, viewport, background: 'rgb(255,255,255)'}).promise;
                    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not render PDF page ' + i)), 'image/png'));
                    zip.file('word/media/page-' + i + '.png', await blob.arrayBuffer());
                    pages.push({width: size.width, height: size.height});
                    rels.push('<Relationship Id="rIdPage' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-' + i + '.png"/>');
                } finally {
                    canvas.width = canvas.height = 0;
                    page.cleanup?.();
                }
            }
            zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
            zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
            zip.file('word/document.xml', documentXml(pages));
            zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>');
            return zip.generateAsync({type: options.outputType || 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
        } finally { await (pdf ? pdf.destroy() : loading.destroy()); }
    }
    const api = {pageGeometry, documentXml, makePdfWord};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PaperAIPdfWord = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
