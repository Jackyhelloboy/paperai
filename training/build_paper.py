"""PaperAI question-paper layout engine (training batch tool).

Turns literal OCR marker text (the `[[...]]` form the Worker emits) into a
print-ready A4 portrait MS Word document that matches the school reference
template in `training/`:

  * A4 portrait, narrow margins (side 0.5in, top 0.7in, bottom 0.5in)
  * full-width header banner
  * footer rule + bold 3-column line with a real Word PAGE field
  * page breaks on PART/SECTION/CLASS boundaries
  * section headings with right-aligned `NxM=P` marks
  * picture grids, option rows, match rows, branch diagrams as Word tables
  * real Word vector shapes for check boxes / ticks / circles
  * mark totals: per-section and grand `Max. Marks`

The same block model is written to `<stem>.preview.json` and compared to the
DOCX by `training/check_docx.py`.

Usage:
    python training/build_paper.py <input.txt|input.docx> [--out DIR]
    python training/build_paper.py --demo            # built-in sample paper
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import zipfile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from docx.shared import Emu, Pt

# ---------------------------------------------------------------------------
# Geometry / typography constants (measured, see training/paper_rules.json)
# ---------------------------------------------------------------------------
TWIP = 635  # EMU per twip
A4_W_TW = 11906
A4_H_TW = 16838
MARGIN_SIDE_TW = 720      # 0.5 in
MARGIN_TOP_TW = 1008      # 0.7 in
MARGIN_BOTTOM_TW = 720
CONTENT_W_TW = A4_W_TW - MARGIN_SIDE_TW * 2

FONT = "Tahoma"
FONT_DEV = "Noto Sans Devanagari"
TITLE_PT = 14
SECTION_PT = 12
BODY_PT = 11
FOOTER_PT = 11

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"

# ---------------------------------------------------------------------------
# Mark parsing / totals
# ---------------------------------------------------------------------------
# Accepts: "10x3=30", "10 x 3", "(5 x 2 = 10)", "15*3/45"
_MARKS_RE = re.compile(
    r"\(?\s*(\d+)\s*[xX\u00d7*]\s*(\d+)\s*(?:/\s*(\d+)\s*)?(?:=\s*(\d+)\s*)?\)?"
)


def parse_marks(text: str):
    """Return the first `NxM[=P]` mark equation found in `text`, or None."""
    m = _MARKS_RE.search(text or "")
    if not m:
        return None
    n = int(m.group(1))
    m2 = int(m.group(2))
    denom = int(m.group(3)) if m.group(3) else None
    total = int(m.group(4)) if m.group(4) else n * m2
    return {
        "raw": m.group(0).strip(),
        "n": n,
        "per": m2,
        "denom": denom,
        "total": total,
        "computed": n * m2,
        "mismatch": total != n * m2,
    }


def compute_marks(sections):
    """Sum every section's mark total into per-section and grand totals."""
    grand = 0
    mismatches = []
    for sec in sections:
        mk = sec.get("marks_info")
        if not mk:
            continue
        grand += mk["total"]
        if mk["mismatch"]:
            mismatches.append(
                f"{sec.get('text','')[:40]}: shows {mk['raw']} but {mk['n']}x{mk['per']}={mk['computed']}"
            )
    return {"grand_total": grand, "mismatches": mismatches}


# ---------------------------------------------------------------------------
# Marker-text parser  ->  ordered block list
# ---------------------------------------------------------------------------
SECTION_RE = re.compile(
    r"^\s*(?:PART\s*[-:]?\s*[A-Z]|SECTION\s*[-:]?\s*[A-Z]|UNIT\s*[-:]?\s*\w+)\b.*$", re.I
)
HEADING_RE = re.compile(
    r"^\s*(?:[IVXLCDM]+|[A-Z])[.)]?\s+\S.*$"
)
QUESTION_RE = re.compile(r"^\s*(?:\(?\d+\)?[.)]|\(?[a-z]\)|\(?[ivx]+\))\s+\S")
PICTURE_RE = re.compile(r"^\s*\[\[PICTURE:\s*(.*?)\]\]\s*$", re.I)
PICTURE_OPTION_RE = re.compile(r"^\s*\[\[PICTURE_OPTION:\s*(.*?)\]\]\s*$", re.I)
CHECKBOX_RE = re.compile(r"^\s*\[\[CHECKBOX\]\]\s*$", re.I)
OPTION_ROW_RE = re.compile(r"^\s*\[\[OPTION_ROW:\s*(.*?)\]\]\s*$", re.I)
MATCH_ROW_RE = re.compile(r"^\s*\[\[MATCH_ROW:\s*(.*?)\s*\|\|\s*(.*?)\]\]\s*$", re.I)
BRANCH_ROOT_RE = re.compile(r"^\s*\[\[BRANCH_ROOT:\s*(.*?)\]\]\s*$", re.I)
BRANCH_ITEM_RE = re.compile(r"^\s*\[\[BRANCH_ITEM:\s*(.*?)\s*\|\|\s*(.*?)\]\]\s*$", re.I)
BRANCH_END_RE = re.compile(r"^\s*\[\[BRANCH_END\]\]\s*$", re.I)
PAGEBREAK_RE = re.compile(r"^\s*\[\[PAGEBREAK\]\]\s*$", re.I)
CLASS_RE = re.compile(r"\b(?:CLASS|STD|STANDARD|GRADE)\s*[-:.]?\s*([IVXLCDM\d]+)", re.I)
TITLE_RE = re.compile(
    r"(?:ASSESSMENT|EXAMINATION|EXAM|ANNUAL|HALF[- ]?YEARLY|SUMMATIVE|FORMATIVE|FA|SA)\b", re.I
)

_INLINE_ANNOT = re.compile(
    r"\[\[(DOUBLE-STRIKE|DOUBLE-UNDERLINE|STRIKE|INSERT|REPLACE|CIRCLED|UNDERLINE|"
    r"BOXED|HIGHLIGHT|MARGIN|STAMP|SIGNATURE):\s*([\s\S]*?)\]\]",
    re.I,
)


def _is_title(line: str) -> bool:
    return bool(TITLE_RE.search(line)) and len(line) <= 90 and "____" not in line


def parse_marker_text(text: str):
    """Parse OCR marker text into an ordered list of layout blocks."""
    blocks = []
    lines = text.replace("\r\n", "\n").split("\n")
    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        line = raw.strip()

        if not line:
            blocks.append({"type": "blank"})
            i += 1
            continue

        if PAGEBREAK_RE.match(line):
            blocks.append({"type": "pagebreak"})
            i += 1
            continue

        if CLASS_RE.search(line) and len(line) <= 80 and "____" not in line:
            blocks.append({"type": "title", "text": line})
            i += 1
            continue

        if _is_title(line):
            blocks.append({"type": "title", "text": line})
            i += 1
            continue

        # Branch diagram block
        m = BRANCH_ROOT_RE.match(line)
        if m:
            root = m.group(1).strip()
            items = []
            j = i + 1
            while j < n and not BRANCH_END_RE.match(lines[j].strip()):
                im = BRANCH_ITEM_RE.match(lines[j].strip())
                if im:
                    items.append({"left": im.group(1).strip(), "right": im.group(2).strip()})
                j += 1
            blocks.append({"type": "branch", "root": root, "items": items})
            i = j + 1
            continue

        # Picture grid: consecutive PICTURE / PICTURE_OPTION lines
        m = PICTURE_RE.match(line) or PICTURE_OPTION_RE.match(line)
        if m:
            pics = []
            while i < n:
                pm = PICTURE_RE.match(lines[i].strip())
                om = PICTURE_OPTION_RE.match(lines[i].strip())
                if pm:
                    pics.append({"label": pm.group(1).strip(), "checkbox": False})
                    i += 1
                elif om:
                    pics.append({"label": om.group(1).strip(), "checkbox": True})
                    i += 1
                elif lines[i].strip() == "":
                    # keep a gap only if more pictures follow
                    k = i + 1
                    while k < n and lines[k].strip() == "":
                        k += 1
                    if k < n and (PICTURE_RE.match(lines[k].strip()) or PICTURE_OPTION_RE.match(lines[k].strip())):
                        i = k
                        continue
                    break
                else:
                    break
            blocks.append({"type": "picture_grid", "pictures": pics})
            continue

        if CHECKBOX_RE.match(line):
            blocks.append({"type": "checkboxes", "count": 1})
            i += 1
            continue

        m = OPTION_ROW_RE.match(line)
        if m:
            choices = [c.strip() for c in m.group(1).split("||")]
            blocks.append({"type": "option_row", "choices": choices})
            i += 1
            continue

        m = MATCH_ROW_RE.match(line)
        if m:
            rows = []
            while i < n:
                rm = MATCH_ROW_RE.match(lines[i].strip())
                if not rm:
                    break
                rows.append([rm.group(1).strip(), rm.group(2).strip()])
                i += 1
            blocks.append({"type": "match_table", "rows": rows})
            continue

        # Section heading (with optional marks)
        mk = parse_marks(line)
        looks_heading = bool(SECTION_RE.match(line)) or bool(HEADING_RE.match(line))
        if looks_heading and not QUESTION_RE.match(line):
            heading_text = re.sub(r"\(?\s*\d+\s*[xX\u00d7*]\s*\d+[\s\S]*$", "", line).strip(" .\t")
            if not heading_text:
                heading_text = line
            blocks.append({
                "type": "section",
                "text": heading_text.rstrip("."),
                "marks": (mk["raw"] if mk else ""),
                "marks_info": mk,
            })
            i += 1
            continue

        # Ordinary content line (keeps inline annotations)
        blocks.append({"type": "text", "text": line, "raw": raw})
        i += 1

    return blocks


def _trim_edge_blanks(blocks):
    """Drop leading/trailing blank blocks so a document never opens on empty
    pages (check_docx rejects more than two leading blanks)."""
    start = 0
    while start < len(blocks) and blocks[start]["type"] == "blank":
        start += 1
    end = len(blocks)
    while end > start and blocks[end - 1]["type"] == "blank":
        end -= 1
    return blocks[start:end]


# ---------------------------------------------------------------------------
# Reference DOCX -> marker text (so existing Word papers can be re-laid out)
# ---------------------------------------------------------------------------
def docx_to_marker_text(path: str) -> str:
    doc = Document(path)
    out = []
    for p in doc.paragraphs:
        txt = "".join(r.text for r in p.runs)
        if p.style and p.style.name and "Heading" in p.style.name:
            txt = txt.strip()
        out.append(txt.rstrip())
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if len(cells) == 2:
                out.append(f"[[MATCH_ROW: {cells[0]} || {cells[1]}]]")
            else:
                out.append(" | ".join(cells))
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Word XML helpers
# ---------------------------------------------------------------------------
def _xml(s: str):
    return parse_xml(f'<w:x xmlns:w="{W}">{s}</w:x>')


def run_xml(text, *, bold=False, size=BODY_PT, font=FONT, italic=False, underline=False):
    rpr = [f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>']
    if bold:
        rpr.append("<w:b/>")
    if italic:
        rpr.append("<w:i/>")
    if underline:
        rpr.append('<w:u w:val="single"/>')
    rpr.append(f'<w:sz w:val="{int(size*2)}"/><w:szCs w:val="{int(size*2)}"/>')
    safe = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    return f'<w:r><w:rPr>{"".join(rpr)}</w:rPr><w:t xml:space="preserve">{safe}</w:t></w:r>'


def tab_run():
    return "<w:r><w:tab/></w:r>"


def pagebreak_paragraph():
    return _xml('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')


def set_keep_next(p):
    pPr = p._p.get_or_add_pPr()
    if pPr.find(qn("w:keepNext")) is None:
        pPr.append(OxmlElement("w:keepNext"))


# -- shape emitters (real Word vector drawings) ------------------------------
def _shape_drawing(name, cx, cy, geom_xml):
    return (
        '<w:r><w:drawing>'
        f'<wp:inline xmlns:wp="{WP}" distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{cx}" cy="{cy}"/>'
        f'<wp:docPr id="{abs(hash(name)) % 100000}" name="{name}"/>'
        f'<wp:cNvGraphicFramePr/>'
        f'<a:graphic xmlns:a="{A}">'
        f'<a:graphicData uri="{WPS}">'
        f'<wps:wsp xmlns:wps="{WPS}"><wps:cNvSpPr/><wps:spPr>'
        f'<a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        f"{geom_xml}"
        f'</wps:spPr><wps:bodyPr/></wps:wsp>'
        f'</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    )


def shape_checkbox_xml(size_emu=180000):
    geom = (
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        '<a:noFill/>'
        '<a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>'
    )
    return _shape_drawing("CheckBox", size_emu, size_emu, geom)


def shape_check_xml(size_emu=180000):
    geom = (
        '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>'
        '<a:rect l="0" t="0" r="r" b="b"/>'
        '<a:pathLst><a:path w="21600" h="21600" fill="none">'
        '<a:moveTo><a:pt x="3000" y="11500"/></a:moveTo>'
        '<a:lnTo><a:pt x="9000" y="17500"/></a:lnTo>'
        '<a:lnTo><a:pt x="19000" y="3500"/></a:lnTo>'
        '</a:path></a:pathLst></a:custGeom>'
        '<a:noFill/>'
        '<a:ln w="19050"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>'
    )
    return _shape_drawing("Tick", size_emu, size_emu, geom)


def shape_circle_xml(size_emu=180000):
    geom = (
        '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'
        '<a:noFill/>'
        '<a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>'
    )
    return _shape_drawing("Circle", size_emu, size_emu, geom)


def shape_arrow_xml(cx=360000, cy=180000):
    geom = (
        '<a:prstGeom prst="rightArrow"><a:avLst/></a:prstGeom>'
        '<a:solidFill><a:srgbClr val="000000"/></a:solidFill>'
    )
    return _shape_drawing("Arrow", cx, cy, geom)


def shape_run_xml(kind):
    if kind == "check":
        return shape_check_xml()
    if kind == "circle":
        return shape_circle_xml()
    if kind == "arrow":
        return shape_arrow_xml()
    return shape_checkbox_xml()


# -- annotation-aware run builder (strike / replace / circled ...) -----------
def content_runs(text):
    """Convert a text line with inline [[...]] annotations into Word runs."""
    parts = []
    pos = 0
    for m in _INLINE_ANNOT.finditer(text):
        if m.start() > pos:
            parts.append(run_xml(text[pos:m.start()]))
        kind = m.group(1).upper()
        body = m.group(2)
        if kind in ("STRIKE", "DOUBLE-STRIKE"):
            r = run_xml(body)
            r = r.replace("<w:rPr>", '<w:rPr><w:strike w:val="true"/>')
            parts.append(r)
        elif kind in ("UNDERLINE", "DOUBLE-UNDERLINE"):
            parts.append(run_xml(body, underline=True))
        elif kind == "REPLACE":
            old, _, new = body.partition("->")
            r = run_xml(old.strip())
            r = r.replace("<w:rPr>", '<w:rPr><w:strike w:val="true"/>')
            parts.append(r)
            parts.append(run_xml(" " + new.strip(), underline=True))
        elif kind == "INSERT":
            parts.append(run_xml(body, underline=True))
        elif kind == "CIRCLED":
            parts.append(run_xml(body))
            parts.append(shape_run_xml("circle"))
        elif kind == "BOXED":
            parts.append(run_xml(body))
            parts.append(shape_run_xml("check"))
        else:  # HIGHLIGHT / MARGIN / STAMP / SIGNATURE
            parts.append(run_xml(body, italic=True))
        pos = m.end()
    if pos < len(text):
        parts.append(run_xml(text[pos:]))
    return "".join(parts) or run_xml("")


def add_paragraph(doc, runs_xml, *, align=None, keep_next=False, marks=None,
                  size=BODY_PT, page_break_before=False):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    if keep_next:
        pPr.append(OxmlElement("w:keepNext"))
    if page_break_before:
        pPr.append(OxmlElement("w:pageBreakBefore"))
    if align is not None:
        p.alignment = align
    if marks is not None:
        tabs = OxmlElement("w:tabs")
        tab = OxmlElement("w:tab")
        tab.set(qn("w:val"), "right")
        tab.set(qn("w:pos"), str(CONTENT_W_TW))
        tabs.append(tab)
        pPr.append(tabs)
        _inject(p, runs_xml + tab_run() + run_xml(marks, bold=True, size=size))
    else:
        _inject(p, runs_xml)
    return p


def _inject(paragraph, runs_xml):
    for child in parse_xml(f'<w:p xmlns:w="{W}">{runs_xml}</w:p>'):
        paragraph._p.append(child)
    return paragraph


# ---------------------------------------------------------------------------
# DOCX renderer
# ---------------------------------------------------------------------------
def _banner_png(title="PAPERAI SCHOOL"):
    from PIL import Image, ImageDraw
    w, h = 1116, 200
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline="black", width=3)
    d.rectangle([8, 8, 120, h - 8], outline="black", width=2)
    d.text((40, h // 2 - 8), "LOGO", fill="black")
    d.text((140, 30), title, fill="black")
    d.text((140, 120), "S C H O O L   Q U E S T I O N   P A P E R", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _add_footer(sec, title="", assessment=""):
    sec.footer.is_linked_to_previous = False
    p = sec.footer.paragraphs[0]
    pPr = p._p.get_or_add_pPr()
    bdr = parse_xml(
        f'<w:pBdr xmlns:w="{W}"><w:top w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>'
    )
    pPr.append(bdr)
    tabs = OxmlElement("w:tabs")
    for pos in (0, CONTENT_W_TW // 2, CONTENT_W_TW):
        t = OxmlElement("w:tab")
        t.set(qn("w:val"), "center" if pos == CONTENT_W_TW // 2 else ("right" if pos else "left"))
        t.set(qn("w:pos"), str(pos))
        tabs.append(t)
    pPr.append(tabs)
    _inject(p, run_xml(assessment or "ASSESSMENT", bold=True, size=FOOTER_PT)
             + tab_run() + run_xml(title, bold=True, size=FOOTER_PT)
             + tab_run()
             + f'<w:r><w:rPr><w:b/><w:sz w:val="{FOOTER_PT*2}"/></w:rPr><w:t xml:space="preserve">PAGE NO: </w:t></w:r>'
             + f'<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>')


def _add_picture_grid(doc, pictures):
    cols = 3 if len(pictures) >= 3 else max(1, len(pictures))
    for start in range(0, len(pictures), cols):
        chunk = pictures[start:start + cols]
        table = doc.add_table(rows=1, cols=cols)
        table.autofit = True
        for c in range(cols):
            cell = table.rows[0].cells[c]
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if c < len(chunk):
                pic = chunk[c]
                p = cell.paragraphs[0]
                run = p.add_run()
                try:
                    run.add_picture(picture_path_for(pic["label"]), width=Emu(640080))
                except Exception:
                    run.add_text(f"[{pic['label']}]")
                if pic.get("checkbox"):
                    _inject(p, shape_checkbox_xml())
                run2 = p.add_run(" " + pic["label"])
                run2.font.size = Pt(BODY_PT - 2)
    return table


def _add_match_table(doc, rows):
    table = doc.add_table(rows=len(rows), cols=2)
    _set_table_borders(table)
    for r, (left, right) in enumerate(rows):
        _set_cell(table.rows[r].cells[0], left)
        _set_cell(table.rows[r].cells[1], right)
    return table


def _add_branch_table(doc, root, items):
    table = doc.add_table(rows=1 + len(items), cols=2)
    _set_table_borders(table)
    _set_cell(table.rows[0].cells[0], root)
    _set_cell(table.rows[0].cells[1], "→")
    for idx, it in enumerate(items, start=1):
        _set_cell(table.rows[idx].cells[0], it.get("left", ""))
        _set_cell(table.rows[idx].cells[1], it.get("right", ""))
    return table


def _add_option_row(doc, choices):
    table = doc.add_table(rows=1, cols=len(choices))
    for c, choice in enumerate(choices):
        p = table.rows[0].cells[c].paragraphs[0]
        run = p.add_run(choice)
        run.font.size = Pt(BODY_PT)
    return table


def _set_cell(cell, text):
    cell.text = ""
    p = cell.paragraphs[0]
    if text:
        run = p.add_run(text)
        run.font.size = Pt(BODY_PT)


_PLACEHOLDER_CACHE = {}


def picture_path_for(label):
    """Return a real raster image path for a picture label.

    Real pictures are looked up next to the engine and in frontend/ by label;
    when none exists a labelled PNG placeholder is synthesized, because
    python-docx cannot embed SVG (the repo's default-picture.svg).
    """
    here = os.path.dirname(__file__)
    for base in (here, os.path.join(here, "..", "frontend")):
        for ext in (".png", ".jpg", ".jpeg"):
            cand = os.path.normpath(os.path.join(base, str(label) + ext))
            if os.path.exists(cand):
                return cand
    return _placeholder_png(label)


def _placeholder_png(label):
    key = str(label)
    cached = _PLACEHOLDER_CACHE.get(key)
    if cached and os.path.exists(cached):
        return cached
    from PIL import Image, ImageDraw, ImageFont
    w, h = 360, 240
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline="black", width=3)
    # simple picture glyph
    d.rectangle([30, 40, 170, 155], outline="black", width=2)
    d.polygon([(45, 145), (95, 92), (155, 145)], outline="black")
    d.ellipse([130, 58, 155, 83], outline="black")
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    d.text((30, 175), "PICTURE", fill="black", font=font)
    d.text((30, 198), key[:40], fill="black", font=font)
    cache_dir = os.path.join(os.path.dirname(__file__), "_assets")
    os.makedirs(cache_dir, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", key) or "image"
    path = os.path.join(cache_dir, f"placeholder_{safe}.png")
    img.save(path, format="PNG")
    _PLACEHOLDER_CACHE[key] = path
    return path


def _set_table_borders(table):
    """Add explicit single-line borders inline so the DOCX is self-describing
    (check_docx classifies bordered tables as `table`, borderless as `options`)."""
    tblPr = table._tbl.tblPr
    for stale in tblPr.findall(qn("w:tblBorders")):
        tblPr.remove(stale)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement("w:" + edge)
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "4")
        e.set(qn("w:space"), "0")
        e.set(qn("w:color"), "000000")
        borders.append(e)
    tblPr.append(borders)
    return table


def render_docx(blocks, out_path, meta=None):
    meta = meta or {}
    doc = Document()

    sec = doc.sections[0]
    sec.page_width = Emu(A4_W_TW * TWIP)
    sec.page_height = Emu(A4_H_TW * TWIP)
    sec.left_margin = Emu(MARGIN_SIDE_TW * TWIP)
    sec.right_margin = Emu(MARGIN_SIDE_TW * TWIP)
    sec.top_margin = Emu(MARGIN_TOP_TW * TWIP)
    sec.bottom_margin = Emu(MARGIN_BOTTOM_TW * TWIP)

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(BODY_PT)

    # header banner
    sec.header.is_linked_to_previous = False
    hp = sec.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    banner = meta.get("banner_path") or os.path.join(os.path.dirname(__file__), "_banner.png")
    if not os.path.exists(banner):
        with open(banner, "wb") as fh:
            fh.write(_banner_png(meta.get("school", "PAPERAI SCHOOL")))
    try:
        hp.add_run().add_picture(banner, width=Emu(CONTENT_W_TW * TWIP))
    except Exception:
        pass

    _add_footer(sec, title=meta.get("footer_title", "SCIENCE"), assessment=meta.get("assessment", "SUMMATIVE ASSESSMENT-I"))

    body = doc.element.body
    pending_break = False
    for blk in blocks:
        t = blk["type"]
        if t == "pagebreak":
            pending_break = True
            continue
        if pending_break and t in ("picture_grid", "match_table", "branch", "option_row", "checkboxes"):
            add_paragraph(doc, "", page_break_before=True)
            pending_break = False
        if t == "title":
            add_paragraph(doc, run_xml(blk["text"], bold=True, size=TITLE_PT),
                          align=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True,
                          page_break_before=pending_break)
        elif t == "section":
            add_paragraph(doc, run_xml(blk["text"], bold=True, size=SECTION_PT),
                          keep_next=True, marks=blk.get("marks", ""), size=SECTION_PT,
                          page_break_before=pending_break)
        elif t == "text":
            add_paragraph(doc, content_runs(blk["text"]), page_break_before=pending_break)
        elif t == "total":
            add_paragraph(doc, run_xml(blk["text"], bold=True, size=SECTION_PT),
                          align=WD_ALIGN_PARAGRAPH.RIGHT, page_break_before=pending_break)
        elif t == "blank":
            add_paragraph(doc, "", page_break_before=pending_break)
        elif t == "picture_grid":
            _add_picture_grid(doc, blk["pictures"])
        elif t == "match_table":
            _add_match_table(doc, blk["rows"])
        elif t == "branch":
            _add_branch_table(doc, blk["root"], blk["items"])
        elif t == "option_row":
            _add_option_row(doc, blk["choices"])
        elif t == "checkboxes":
            add_paragraph(doc, shape_checkbox_xml() + run_xml("  "),
                          page_break_before=pending_break)
        pending_break = False

    totals = compute_marks([b for b in blocks if b["type"] == "section"])

    doc.save(out_path)

    # check_docx expects the header banner relationship to be named rIdHeaderImg.
    _rename_header_rid(out_path)
    return totals


def _rename_header_rid(path):
    tmp = path + ".tmp"
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/_rels/header1.xml.rels":
                s = data.decode("utf-8")
                m = re.search(r'Id="(rId\d+)"[^>]*Type="[^"]*image"', s)
                if m and m.group(1) != "rIdHeaderImg":
                    s = s.replace(f'Id="{m.group(1)}"', 'Id="rIdHeaderImg"')
                    data = s.encode("utf-8")
            if item.filename == "word/header1.xml":
                s = data.decode("utf-8")
                m = re.search(r'r:embed="(rId\d+)"', s)
                if m and m.group(1) != "rIdHeaderImg":
                    s = s.replace(f'r:embed="{m.group(1)}"', 'r:embed="rIdHeaderImg"')
                    data = s.encode("utf-8")
            zout.writestr(item, data)
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Preview JSON (block signature consumed by check_docx.py)
# ---------------------------------------------------------------------------
def write_preview(blocks, out_path):
    out = []
    for b in blocks:
        t = b["type"]
        if t == "title":
            out.append({"type": "title", "text": b["text"]})
        elif t == "section":
            out.append({"type": "section", "text": b["text"], "marks": b.get("marks", "")})
        elif t == "picture_grid":
            for pic in b["pictures"]:
                out.append({"type": "picture", "text": ""})
        elif t == "match_table":
            out.append({"type": "table", "rows": [[r[0], r[1]] for r in b["rows"]]})
        elif t == "branch":
            rows = [[b["root"], "→"]] + [[i.get("left", ""), i.get("right", "")] for i in b["items"]]
            out.append({"type": "table", "rows": rows})
        elif t == "option_row":
            out.append({"type": "options", "rows": [b["choices"]]})
        elif t == "blank":
            out.append({"type": "blank"})
        elif t == "checkboxes":
            out.append({"type": "picture", "text": ""})
        elif t == "text":
            out.append({"type": "text", "text": b["text"]})
        elif t == "total":
            out.append({"type": "text", "text": b["text"]})
    # pagebreak -> nothing
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"blocks": out}, fh, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------------------
# Class-paper separation
# ---------------------------------------------------------------------------
def split_by_class(blocks):
    """Split the block stream whenever a new CLASS/STD title block appears."""
    papers = []
    current = None
    for b in blocks:
        if b["type"] == "title" and CLASS_RE.search(b["text"]):
            key = CLASS_RE.search(b["text"]).group(1).upper()
            if current is not None and key != current["key"]:
                papers.append(current)
                current = None
        if current is None:
            current = {"key": (CLASS_RE.search(b["text"]).group(1).upper()
                               if b["type"] == "title" and CLASS_RE.search(b["text"]) else "UNKNOWN"),
                       "blocks": []}
        current["blocks"].append(b)
    if current and current["blocks"]:
        papers.append(current)
    return papers


# ---------------------------------------------------------------------------
# Smart-fit: compact content toward a page budget
# ---------------------------------------------------------------------------
# Rough line-height cost of each block at 11pt on A4 portrait with the narrow
# margins above (usable height ~9.7in, ~40 body lines of usable space).
LINES_PER_PAGE = 40
_BLOCK_LINES = {
    "title": 1.6,
    "section": 1.5,
    "text": 1.0,
    "blank": 1.0,
    "total": 1.5,
    "checkboxes": 1.4,
    "option_row": 1.4,
    "picture_grid": 4.5,
}


def estimate_block_lines(block):
    t = block["type"]
    if t == "picture_grid":
        return _BLOCK_LINES["picture_grid"]
    if t == "match_table":
        return len(block.get("rows", [])) + 0.5
    if t == "branch":
        return len(block.get("items", [])) + 1.5
    return _BLOCK_LINES.get(t, 1.0)


def estimate_lines(blocks):
    return sum(estimate_block_lines(b) for b in blocks)


def estimate_pages(blocks):
    import math
    return max(1, math.ceil(estimate_lines(blocks) / LINES_PER_PAGE))


def _strip_blanks(blocks, keep_gap=True):
    """Collapse blank runs to a single gap (or remove them entirely)."""
    out = []
    for b in blocks:
        if b["type"] == "blank":
            if keep_gap and out and out[-1]["type"] != "blank":
                out.append(b)
            continue
        out.append(b)
    while out and out[-1]["type"] == "blank":
        out.pop()
    if out and out[0]["type"] == "blank":
        out.pop(0)
    return out


def smart_fit(blocks, page_budget=None, ai_hook=None):
    """Compact `blocks` toward `page_budget` pages.

    Deterministic first: collapse then drop blank gaps. An optional `ai_hook`
    is consulted only after the deterministic pass still overflows; it must
    return a block list (or None to abstain). Any hook error falls back to the
    deterministic result. Returns (blocks, info).
    """
    info = {
        "page_budget": page_budget,
        "estimated_pages_before": estimate_pages(blocks),
        "estimated_pages_after": estimate_pages(blocks),
        "removed_blanks": 0,
        "ai_used": False,
        "steps": [],
    }
    if not page_budget:
        return blocks, info

    before = len(blocks)
    if estimate_pages(blocks) > page_budget:
        blocks = _strip_blanks(blocks, keep_gap=True)
        info["steps"].append("collapse_blank_runs")

    if estimate_pages(blocks) > page_budget:
        blocks = _strip_blanks(blocks, keep_gap=False)
        info["steps"].append("drop_blanks")

    if estimate_pages(blocks) > page_budget and ai_hook is not None:
        try:
            fitted = ai_hook(blocks, page_budget, estimate_pages(blocks))
            if fitted:
                blocks = fitted
                info["ai_used"] = True
                info["steps"].append("ai_fit")
        except Exception as exc:  # never let a hook break the build
            info["steps"].append(f"ai_fit_error:{exc}")

    info["removed_blanks"] = before - len(blocks)
    info["estimated_pages_after"] = estimate_pages(blocks)
    return blocks, info


def _http_ai_fit_hook(url):
    """Build an AI-fit hook that POSTs the block list to `url`."""
    import urllib.request

    def hook(blocks, budget, current_pages):
        payload = json.dumps({
            "page_budget": budget,
            "current_pages": current_pages,
            "lines_per_page": LINES_PER_PAGE,
            "blocks": blocks,
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("blocks")

    return hook


# ---------------------------------------------------------------------------
# Demo input
# ---------------------------------------------------------------------------
DEMO = """Class 5 Science Annual Examination
PART - A
I. Answer the following questions.       (10 x 3 = 30)
1) Define photosynthesis.
2) Name the three types of blood vessels.
3) What is migration?
II. Fill in the blanks.       (5 x 2 = 10)
1) Plants that grow under water are called ______.
2) Sugar and starch are types of ______.
[[PICTURE: leaf]]
[[PICTURE: root]]
[[PICTURE_OPTION: stem]]
III. Choose the correct answer.       (5 x 1 = 5)
1) This is a pulling force.
[[OPTION_ROW: Work || Gravity || Friction || Energy]]
2) This is an animal fibre.
[[OPTION_ROW: Cotton || Jute || Coir || Silk]]
IV. Match the following.       (5 x 1 = 5)
[[MATCH_ROW: Photosynthesis || Makes food]]
[[MATCH_ROW: Heart || Pumps blood]]
[[MATCH_ROW: Lungs || Breathing]]
[[PAGEBREAK]]
V. Look at the picture and tick the correct box.       (3 x 1 = 3)
[[CHECKBOX]]
[[PICTURE_OPTION: flower]]
VI. Complete the tree.       (2 x 1 = 2)
[[BRANCH_ROOT: Plant]]
[[BRANCH_ITEM: Root || Absorbs water]]
[[BRANCH_ITEM: Stem || Transports food]]
[[BRANCH_END]]
"""


def build(input_path=None, text=None, out_dir=None, page_budget=None, ai_hook=None):
    if text is None:
        if input_path and input_path.lower().endswith(".docx"):
            text = docx_to_marker_text(input_path)
        else:
            with open(input_path, encoding="utf-8") as fh:
                text = fh.read()
    stem = "paper"
    if input_path:
        stem = os.path.splitext(os.path.basename(input_path))[0]
    out_dir = out_dir or os.path.join(os.path.dirname(__file__), "out")
    os.makedirs(out_dir, exist_ok=True)

    blocks = parse_marker_text(text)
    blocks = _trim_edge_blanks(blocks)
    blocks, fit_info = smart_fit(blocks, page_budget, ai_hook=ai_hook)

    # Fold the grand mark total into the block stream so the preview and the
    # DOCX always carry the identical trailing block.
    totals = compute_marks([b for b in blocks if b["type"] == "section"])
    if totals["grand_total"]:
        blocks.append({"type": "total", "text": f"MAX. MARKS: {totals['grand_total']}"})

    papers = split_by_class(blocks)
    results = []
    for idx, paper in enumerate(papers):
        pblocks = paper["blocks"]
        suffix = f"_{paper['key']}" if paper["key"] != "UNKNOWN" and len(papers) > 1 else ""
        docx_path = os.path.join(out_dir, f"{stem}{suffix}.docx")
        preview_path = os.path.join(out_dir, f"{stem}{suffix}.preview.json")
        totals = render_docx(pblocks, docx_path, meta={"school": stem})
        write_preview(pblocks, preview_path)
        results.append({
            "paper": paper["key"],
            "docx": docx_path,
            "preview": preview_path,
            "grand_total": totals["grand_total"],
            "mark_mismatches": totals["mismatches"],
            "blocks": len(pblocks),
            "smart_fit": fit_info,
        })
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build A4 question-paper DOCX from OCR marker text.")
    ap.add_argument("input", nargs="?", help="OCR marker text or reference .docx")
    ap.add_argument("--out", help="output directory (default training/out)")
    ap.add_argument("--pages", type=int, help="page budget for smart-fit compaction")
    ap.add_argument("--ai-fit", action="store_true",
                    help="use the AI fit hook at $PAPERAI_AI_FIT_URL when still over budget")
    ap.add_argument("--demo", action="store_true", help="build the built-in sample paper")
    args = ap.parse_args(argv)

    ai_hook = None
    if args.ai_fit:
        url = os.environ.get("PAPERAI_AI_FIT_URL")
        if url:
            ai_hook = _http_ai_fit_hook(url)
        else:
            print("note: --ai-fit set but PAPERAI_AI_FIT_URL is empty; using deterministic fit",
                  file=sys.stderr)

    kwargs = {"out_dir": args.out, "page_budget": args.pages, "ai_hook": ai_hook}
    if args.demo or not args.input:
        results = build(text=DEMO, **kwargs)
    else:
        results = build(input_path=args.input, **kwargs)

    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
