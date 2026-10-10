# Paper Model Study — Reference Question Papers vs. Current Output

Derived from measured geometry (not opinion) of everything in `training/`.
Machine-readable form: `training/paper_model.json` (raw) and
`training/paper_rules.json` (rules). Regenerate raw data with
`python training/deep_analyze.py`.

## 1. Corpus

| File | Kind | Pages | Notes |
|---|---|---|---|
| I/II/III/IV/V - SA-1 SCIENCE.pdf | printed paper (text layer) | 4 each | the design target |
| UKG FA-1.pdf | printed paper | 4 | lower-primary variant |
| english.pdf | handwritten scan (image-only) | 13 | input sample |
| maths.pdf | handwritten scan (image-only) | 9 | input sample |
| out/*.docx | current app output | — | to be compared |

All references are **A4 portrait**.

## 2. Measured page spec (printed papers)

- Page: **8.27 × 11.69 in** (A4 portrait), 595 × 842 pt.
- Effective content margins (text bbox, not page box):
  - left **0.29–0.49 in** (≈ 0.4)
  - right **0.41–0.56 in** (≈ 0.45)
  - top **1.0–1.07 in** (space reserved for the header banner)
  - bottom **0.34–0.55 in** (space reserved for the footer rule)
- So margins are **narrow** (~0.4 in sides) and **asymmetric**: extra top room
  for a header, small bottom room for a footer.
- Fonts: embedded CID (Tahoma-family look). Sizes:
  - **14 pt** — class/subject title line (e.g. `I-SCIENCE`)
  - **13 pt** — section headings, question text, marks (bold or regular)
  - **11 pt** — answer blanks (underscore rules), footer
- Line pitch: median gap **23–40 pt** (≈ 1.4–1.8× the 13 pt size).
  Blank lines are ~25 pt apart.

## 3. Header / footer chrome (present on every page)

From `I - SA-1 SCIENCE.pdf`:

- **Header page 1:** a full-width banner **image** at
  `x=37 y=21 w=553 h=100` pt (≈ 7.7 × 1.4 in) — school name/logo/photo strip.
  A small vector box at `(84,69,99,22)` (logo / date cell inside the banner).
- **Title line:** class-subject (e.g. `I-SCIENCE`, 14 pt) near the top.
- **Footer (every page):** a horizontal rule at `y≈793–797` spanning the full
  content width (517 pt), followed by a bold 11 pt 3-column line:
  `SUMMATIVE ASSESSMENT-I` | `I-SCIENCE` | `PAGE NO:0X`.

## 4. Section heading model

Every question group is one **bold 13 pt line** made of three zones:

```
[roman]   [heading text ........................]   [marks]
 x=21      x=50 (indented)                            right-aligned (x≈280–541)
```

Observed variants (all equivalent):
- `I` + `Answer the following Questions` + `10x3=30`
- `I.` + `Shorts Questions and Answers.` and marks in a later span
- `I. Shorts Questions and Answers.` (roman, text, and no marks in one span)
- `III    Fill in the blanks.` + `5x2=10`

Marks string format is uniform: **`NxM=P`** (`10x3=30`, `15x3=45`, `4x5=20`,
`5x2=10`, `5x1=5`) and is **right-aligned** on the same line.

## 5. Question-type catalog (decision rules)

| Type | Signature | Layout rule |
|---|---|---|
| Short answer | `1.  question` then one or more `____` lines | 11 pt full-width underscore rules, 2–3 per question |
| Long answer | same, more blank lines | 4–6 underscore rules |
| Fill in blanks | inline `____` + `( option / option )` | blank inline with question, options in parens |
| MCQ | question + `(       )` at right (x≈460) | answer box right-aligned; options `a) b) c)` in 2–3 columns |
| True/False | `1. statement ....  (    )` | `( )` right-aligned |
| Match the following | two columns + leader lines | left column `1.`..`5.`, right `i)`..`v)`; thin rules/leaders between |
| Label/name picture | `a) b) c)` with images | image above each label, evenly spaced columns |

Sub-items use `a) b) c)`; question numbers are `1. 2. 3.`.

## 6. Image placement rules (from page 4 of paper I)

- Images sit **beside** their label, not stacked: e.g. label `a)` at `(21,105)`
  with the image at `(69,78,63,58)` — image top-aligned with the label.
- Image widths measured: **52–113 pt** (≈ 0.7–1.6 in); typical **58–93 pt**.
  Heights 38–112 pt. Aspect ratio preserved.
- Odd-one-out / matching items place **3 images across one row**
  (x≈69 / 161 / 247), each ~60–110 pt wide, then the next row.
- Multi-row image grids keep a consistent left gutter and even horizontal gaps.

## 7. Multi-page rules (newest requirement)

- A paper is one logical document: pages **continue** (same header/footer,
  continuous `PAGE NO:`), questions flow across the break.
- **Do not orphan** a section heading at the bottom of a page — keep it with at
  least the first question (`keepNext`).
- **Page break when the class/school header changes** (a new cover/heading font
  block implies a new paper).
- **Serialize random uploads**: teacher drops page photos in arbitrary order →
  order them by detected header/title and by question numbering, then merge.
- **Compact**: prefer more content per page; only break on a real boundary.

## 8. Gap: current app vs reference

Current `frontend/index.html` DOCX (`docxDocumentXml`):
- Page A4 portrait ✓, margins uniform **0.5 in**, font Tahoma 11 pt, line 1.25.
- **No** header banner, **no** footer rule/3-column footer, **no** page numbers.
- **No** page-break logic, **no** multi-page assembly; one upload → one sheet.
- Section headings are styled but **not** laid out as the 3-zone
  roman/heading/right-aligned-marks line.
- Answer blanks, MCQ answer boxes, and match-columns are approximated, not
  placed with the measured coordinates.
- Images are emitted but not arranged into even rows/grids.

## 9. Decision engine ("why this works" + self-improvement)

The design is a set of **deterministic layout rules** (above) applied by a
classifier. Recommended architecture:

1. **Classify** each line: `header`, `title`, `section`, `question`,
   `subitem`, `blank`, `mcq`, `truefalse`, `match`, `image`, `table`.
2. **Group** lines into a section block; attach marks from the `NxM=P` pattern.
3. **Place** blocks on A4 pages with the measured margins; apply keep-with-next,
   page-break-on-header, and compaction.
4. **Fit images** into a measured grid (right-column images beside labels).
5. **Score** the result (margins within tolerance, no orphan heading, page
   count ≤ budget, all questions present) and feed corrections back as new
   rules — the trial-and-error loop.
6. **Verify** automatically with `training/check_docx.py` + `verify.mjs`
   (0 console errors, structural match, geometry within tolerance).

## 10. Update 2 — full corpus re-scan (Word references + multilingual)

The training folder was expanded. New evidence:

- **Word references** (`Social 6-10.docx`, `English 6.docx`, `Class_1..5_Science_Annual.docx`):
  every one carries a full-width **header banner image ≈ 558×100 pt**, section headings
  `I.  ...` with `NxM=P` marks, question forms `1. ...`, sub-parts `A) ... (or) B) ...`,
  `PART - A` / `PART - B` dividers, and inline MCQ options `A) B) C) D)`.
- **Main language/class papers** (`HINDI SA-1.pdf` 17 pages, `fa-2 sci.pdf` 10 pages,
  `entrance class 2..5.pdf`, `entrance class UKG.pdf`): A4 portrait, some with tall
  content (page-break handling required), Hindi (Devanagari) and larger title sizes
  up to 33 pt.
- **Handwriting inputs**: `english.pdf` (13 pp), `maths.pdf` (9 pp), plus `hindi class 1.pdf`,
  `class 2/3 hindi.pdf` — all image-only scans, confirming multi-page, random-order input.
- **Page size conflict**: `Social*`/`English*` are US Letter (8.5×11); the school
  deliverable is **A4 portrait**, so A4 wins.

### Implemented decisions (page-aware layout engine)

Measured against the above and now live in `frontend/index.html`:

1. **Margins** — A4 portrait, sides 0.5 in (narrow), top 0.7 in (header room),
   bottom 0.5 in. (`check_docx.py` updated to accept top ≤ 0.75 in.)
2. **Footer on every page** — top rule + bold 11 pt line
   `title | PAGE NO: {PAGE}` with a real Word `PAGE` field (`footer1.xml`).
3. **Automatic page breaks** — `w:pageBreakBefore` on the boundary heading for
   `PART/SECTION/UNIT`, `CLASS/GRADE/STD`, `SUMMATIVE/ANNUAL/FA/SA + roman`,
   a repeated all-caps school banner, and an explicit `[[PAGEBREAK]]` marker.
4. **Preview parity** — a dashed `qp-page-break` divider marks each break on screen.
5. **Verification** — `check_docx.py` now asserts the footer part, its relationship
   and content-type override, the `sectPr` footer reference, the PAGE field, and counts
   page breaks. `verify.mjs` end-to-end run: 0 console errors, 0 failed requests, both
   samples `ok: true`.

### Still open

- Header banner **image** is not reproduced (asset missing); only space + centred title.
- Multi-image upload → auto-sort → single merged paper is designed but not yet built
  (`multipage.serialize_random_uploads`).
- Self-learning loop needs the KV binding (absent from `worker/wrangler.toml`).
- No source Word/PDF **pairs** exist to train the extraction→design mapping.