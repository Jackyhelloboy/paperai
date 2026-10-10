"""Deep structural analysis of every file in the training folder.

Produces training/analysis.json with per-file layout facts and
training/rules.json with the learned question-paper format ruleset.
"""
import os
import re
import json
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def analyze_docx(path):
    import docx
    from docx.shared import Emu

    d = docx.Document(path)
    info = {
        "type": "docx",
        "sections": [],
        "paragraphs": 0,
        "tables": len(d.tables),
        "inline_shapes": len(d.inline_shapes),
        "headings": [],
        "bold_runs": 0,
        "alignments": Counter(),
        "styles": Counter(),
        "lines": [],
        "page": {},
    }

    for s in d.sections:
        pw, ph = s.page_width, s.page_height
        info["sections"].append({
            "page_width_in": round(pw.inches, 2) if pw else None,
            "page_height_in": round(ph.inches, 2) if ph else None,
            "orientation": "landscape" if (pw and ph and pw > ph) else "portrait",
            "margins_in": {
                "top": round(s.top_margin.inches, 2) if s.top_margin else None,
                "bottom": round(s.bottom_margin.inches, 2) if s.bottom_margin else None,
                "left": round(s.left_margin.inches, 2) if s.left_margin else None,
                "right": round(s.right_margin.inches, 2) if s.right_margin else None,
            },
        })
    if info["sections"]:
        info["page"] = info["sections"][0]

    body = d.element.body
    tbl_i = 0
    for child in body.iterchildren():
        tag = child.tag.split('}')[-1]
        if tag == 'p':
            from docx.text.paragraph import Paragraph
            p = Paragraph(child, d)
            text = p.text.strip()
            if not text:
                continue
            info["paragraphs"] += 1
            info["styles"][p.style.name if p.style else "Normal"] += 1
            if p.alignment is not None:
                info["alignments"][str(p.alignment)] += 1
            is_bold = all(r.bold for r in p.runs if r.text.strip()) and any(
                r.bold for r in p.runs if r.text.strip())
            if is_bold:
                info["bold_runs"] += 1
            style_name = (p.style.name or "").lower()
            if "heading" in style_name or is_bold or info["paragraphs"] <= 6:
                info["headings"].append(text[:120])
            info["lines"].append({
                "t": text[:300],
                "b": bool(is_bold),
                "s": p.style.name if p.style else None,
                "sz": next((r.font.size.pt for r in p.runs if r.font.size), None),
            })
        elif tag == 'tbl':
            from docx.table import Table
            t = Table(child, d)
            rows = [[c.text.strip().replace("\n", " ")[:80] for c in r.cells] for r in t.rows]
            info["lines"].append({"table": rows[:20], "n_rows": len(rows),
                                  "n_cols": len(rows[0]) if rows else 0})
            tbl_i += 1

    return info


def analyze_pdf(path):
    import fitz

    doc = fitz.open(path)
    info = {
        "type": "pdf",
        "pages": doc.page_count,
        "page_sizes": [],
        "is_scan": True,
        "text_chars": 0,
        "lines": [],
        "images": 0,
        "drawings": 0,
        "fonts": set(),
        "page": {},
    }

    for i, page in enumerate(doc):
        rect = page.rect
        w_in = round(rect.width / 72, 2)
        h_in = round(rect.height / 72, 2)
        info["page_sizes"].append({
            "w_pt": round(rect.width, 1), "h_pt": round(rect.height, 1),
            "w_in": w_in, "h_in": h_in,
            "orientation": "landscape" if rect.width > rect.height else "portrait",
        })
        txt = page.get_text("text")
        info["text_chars"] += len(txt.strip())
        info["images"] += len(page.get_images(full=True))
        try:
            info["drawings"] += len(page.get_drawings())
        except Exception:
            pass
        try:
            for f in page.get_fonts(full=True):
                info["fonts"].add(f[3])
        except Exception:
            pass

        if i == 0:
            blocks = page.get_text("dict")["blocks"]
            for b in blocks:
                if b.get("type") != 0:
                    continue
                for l in b.get("lines", []):
                    spans = l.get("spans", [])
                    if not spans:
                        continue
                    text = "".join(s["text"] for s in spans).strip()
                    if not text:
                        continue
                    size = max(s["size"] for s in spans)
                    bold = any("Bold" in (s.get("font") or "") or (s.get("flags", 0) & 16)
                               for s in spans)
                    info["lines"].append({"t": text[:300], "sz": round(size, 1), "b": bold,
                                          "x0": round(b["bbox"][0], 0),
                                          "y": round(l["bbox"][1], 0)})
            info["lines"].sort(key=lambda r: (r.get("y", 0), r.get("x0", 0)))

    if info["text_chars"] > 200:
        info["is_scan"] = False
    if info["page_sizes"]:
        info["page"] = info["page_sizes"][0]
    info["fonts"] = sorted(info["fonts"])[:20]
    doc.close()
    return info


def main():
    report = {}
    for fn in sorted(os.listdir(HERE)):
        p = os.path.join(HERE, fn)
        if not os.path.isfile(p):
            continue
        ext = os.path.splitext(fn)[1].lower()
        if ext not in (".docx", ".pdf"):
            continue
        try:
            info = analyze_docx(p) if ext == ".docx" else analyze_pdf(p)
        except Exception as e:
            info = {"type": ext.lstrip("."), "error": str(e)}
        report[fn] = info
        print(f"analysed {fn}: {info.get('type')} tables={info.get('tables','-')} "
              f"lines={len(info.get('lines', []))} err={info.get('error')}")

    for info in report.values():
        for k, v in list(info.items()):
            if isinstance(v, Counter):
                info[k] = dict(v.most_common())
            elif isinstance(v, set):
                info[k] = sorted(v)[:20]
    with open(os.path.join(HERE, "analysis.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    # ---- aggregate format rules ----
    page_sizes = Counter()
    margins = Counter()
    table_shapes = Counter()
    header_fields = Counter()
    section_heads = Counter()
    marks_tokens = Counter()
    bold_first = 0
    total = 0

    field_re = re.compile(
        r"^(name|class|section|roll\s*(no|number)|date|subject|time|marks|max\s*marks|"
        r"school|paper|set|term|exam|academic|session|sign)", re.I)
    sec_re = re.compile(r"^([ivx]+|[a-z])\s*[.)\-–]\s*(.+)$", re.I)
    marks_re = re.compile(r"(\d+\s*[x×]\s*\d+\s*=\s*\d+|\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*marks?\b|\d+\s*M\b)", re.I)

    for fn, info in report.items():
        if info.get("error"):
            continue
        total += 1
        if info.get("page"):
            pg = info["page"]
            if pg.get("w_in"):
                page_sizes[f"{pg['w_in']}x{pg['h_in']} {pg.get('orientation')}"] += 1
            m = pg.get("margins_in")
            if m:
                margins[str(m)] += 1
        for ln in info.get("lines", []):
            if "table" in ln:
                table_shapes[f"{ln['n_rows']}x{ln['n_cols']}"] += 1
                for row in ln["table"][:3]:
                    for cell in row:
                        if field_re.match(cell.strip()):
                            header_fields[cell.strip().lower()[:30]] += 1
                continue
            t = ln.get("t", "").strip()
            if field_re.match(t):
                header_fields[t.lower()[:40]] += 1
            m = sec_re.match(t)
            if m and len(t) < 90:
                section_heads[m.group(1).upper() + " " + m.group(2)[:50]] += 1
            for mk in marks_re.findall(t):
                marks_tokens[mk.strip().lower()] += 1
            if ln.get("b"):
                bold_first += 1

    rules = {
        "generated_from": sorted(report.keys()),
        "files_analysed": total,
        "page_sizes": page_sizes.most_common(20),
        "margins": margins.most_common(10),
        "table_shapes": table_shapes.most_common(20),
        "header_fields": header_fields.most_common(40),
        "section_headings": section_heads.most_common(40),
        "marks_notations": marks_tokens.most_common(30),
        "bold_line_count": bold_first,
    }
    with open(os.path.join(HERE, "rules.json"), "w", encoding="utf-8") as f:
        json.dump(rules, f, ensure_ascii=False, indent=1)

    print("\n=== PAGE SIZES ===")
    for k, v in rules["page_sizes"]:
        print(f"  {k}: {v}")
    print("=== MARGINS ===")
    for k, v in rules["margins"]:
        print(f"  {k}: {v}")
    print("=== TABLE SHAPES ===")
    for k, v in rules["table_shapes"]:
        print(f"  {k}: {v}")
    print("=== HEADER FIELDS (top 25) ===")
    for k, v in rules["header_fields"][:25]:
        print(f"  {k}: {v}")
    print("=== SECTION HEADINGS (top 25) ===")
    for k, v in rules["section_headings"][:25]:
        print(f"  {k}: {v}")
    print("=== MARKS (top 20) ===")
    for k, v in rules["marks_notations"][:20]:
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
