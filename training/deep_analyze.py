"""Deep geometry study of the reference question papers / handwriting notes.

For each PDF it records, per page: content bounding box (=> effective margins),
every text span with x/y/size/font/bold, image boxes, vector-drawing boxes, and
line-gap statistics. Scanned PDFs report image size and effective DPI instead.
The JSON feeds training/paper_model.md.

Run:  python training/deep_analyze.py
"""
import json
import os

import pymupdf as fitz

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "paper_model.json")


def analyze(path):
    doc = fitz.open(path)
    pages = []
    for page in doc:
        spans = []
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for sp in line.get("spans", []):
                    if not sp.get("text", "").strip():
                        continue
                    spans.append({
                        "t": sp["text"].strip()[:120],
                        "x": round(sp["bbox"][0], 1),
                        "y": round(sp["bbox"][1], 1),
                        "x1": round(sp["bbox"][2], 1),
                        "y1": round(sp["bbox"][3], 1),
                        "sz": round(sp["size"], 1),
                        "bold": bool(sp.get("flags", 0) & 16),
                    })
        spans.sort(key=lambda s: (round(s["y"]), s["x"]))

        images = []
        for info in page.get_images(full=True):
            for r in page.get_image_rects(info[0]) or []:
                images.append({"x": round(r.x0, 1), "y": round(r.y0, 1),
                               "w": round(r.width, 1), "h": round(r.height, 1)})
        drawings = []
        for d in page.get_drawings():
            r = d.get("rect")
            if r is None or r.is_empty:
                continue
            drawings.append({"x": round(r.x0, 1), "y": round(r.y0, 1),
                             "w": round(r.width, 1), "h": round(r.height, 1)})

        margins = None
        if spans:
            margins = {
                "left_in": round(min(s["x"] for s in spans) / 72, 2),
                "right_in": round((page.rect.width - max(s["x1"] for s in spans)) / 72, 2),
                "top_in": round(min(s["y"] for s in spans) / 72, 2),
                "bottom_in": round((page.rect.height - max(s["y1"] for s in spans)) / 72, 2),
            }
        ys = sorted(set(round(s["y"]) for s in spans))
        gaps = [ys[i + 1] - ys[i] for i in range(len(ys) - 1)]

        pages.append({
            "n_spans": len(spans),
            "size_in": [round(page.rect.width / 72, 2), round(page.rect.height / 72, 2)],
            "content_margins_in": margins,
            "font_sizes": sorted(set(s["sz"] for s in spans)),
            "bold_font_sizes": sorted(set(s["sz"] for s in spans if s["bold"])),
            "n_images": len(page.get_images(full=True)),
            "n_drawings": len(drawings),
            "median_line_gap_pt": sorted(gaps)[len(gaps) // 2] if gaps else None,
            "image_boxes": images[:20],
            "drawing_boxes": drawings[:20],
            "spans": spans[:80],
        })
    doc.close()
    return pages


def main():
    report = {}
    for fn in sorted(os.listdir(HERE)):
        if not fn.lower().endswith(".pdf"):
            continue
        path = os.path.join(HERE, fn)
        try:
            report[fn] = analyze(path)
        except Exception as e:
            report[fn] = {"error": str(e)}
        pages = report[fn]
        if isinstance(pages, list) and pages:
            p0 = pages[0]
            print(f"{fn}: {len(pages)} pages  size={p0['size_in']}  "
                  f"margins={p0['content_margins_in']}  sizes={p0['font_sizes']}  "
                  f"bold={p0['bold_font_sizes']}  gap={p0['median_line_gap_pt']}pt")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()