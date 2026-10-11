"""Read every training document and render unique files for visual review.

Generated outputs are diagnostics, never implicit supervised targets. Rendering
is optional and lives outside the repository. Run with the bundled Python:
  review_corpus.py --render-root /absolute/scratch/path
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import fitz
from lxml import etree
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def word(path):
    with zipfile.ZipFile(path) as z:
        document = etree.fromstring(z.read('word/document.xml'))
        paragraphs = []
        for p in document.iter(W + 'p'):
            value = ''.join(n.text or '' if n.tag == W + 't' else '\t' if n.tag == W + 'tab' else '\n'
                            for n in p.iter() if n.tag in {W+'t', W+'tab', W+'br'})
            if value.strip(): paragraphs.append(value)
        tables = []
        for t in document.iter(W + 'tbl'):
            rows = []
            for tr in t.findall(W+'tr'):
                cells = []
                for tc in tr.findall(W+'tc'):
                    span = tc.find(W+'tcPr/'+W+'gridSpan')
                    merge = tc.find(W+'tcPr/'+W+'vMerge')
                    cells.append({'visible_text':' '.join(n.text or '' for n in tc.iter(W+'t')),
                                  'span':int(span.get(W+'val','1')) if span is not None else 1,
                                  'vertical_merge':merge.get(W+'val','continue') if merge is not None else None})
                rows.append(cells)
            tables.append(rows)
        sizes = [dict(n.attrib) for n in document.iter(W+'pgSz')]
        margins = [dict(n.attrib) for n in document.iter(W+'pgMar')]
        images = [n for n in z.namelist() if n.startswith('word/media/')]
        # Include headers, footers, textboxes, and image dimensions, not just body paragraphs.
        furniture = {}
        for name in z.namelist():
            if re.match(r'word/(header|footer)\d+\.xml$', name):
                furniture[name]=' '.join(n.text or '' for n in etree.fromstring(z.read(name)).iter(W+'t'))
        return {'paragraphs':paragraphs,'tables':tables,'page_sizes':sizes,'margins':margins,
                'image_parts':images,'furniture':furniture,
                'text_boxes':len(list(document.iter(W+'txbxContent')))}


def pdf(path):
    result=[]
    with fitz.open(path) as doc:
        for page in doc:
            blocks=page.get_text('dict')['blocks']
            spans=[s for b in blocks if b['type']==0 for line in b['lines'] for s in line['spans']]
            result.append({'number':page.number+1,'size_points':list(page.rect)[2:],
                           'text':page.get_text(sort=True),
                           'spans':[{'text':s['text'],'bbox':s['bbox'],'font':s['font'],'size':s['size']} for s in spans],
                           'images':[{'bbox':b['bbox'],'width':b['width'],'height':b['height']} for b in blocks if b['type']==1],
                           'drawings':len(page.get_drawings())})
    return result


def contacts(folder):
    pages=sorted(folder.glob('page-*.png'),key=lambda p:int(p.stem.split('-')[-1]))
    for first in range(0,len(pages),4):
        canvas=Image.new('RGB',(1500,2200),'#dedede')
        draw=ImageDraw.Draw(canvas)
        for slot, path in enumerate(pages[first:first+4]):
            im=Image.open(path).convert('RGB'); im.thumbnail((730,1050))
            x=(slot%2)*750+(750-im.width)//2; y=(slot//2)*1100+35
            canvas.paste(im,(x,y));draw.text((x,y-24),f'{folder.name} page {first+slot+1}',fill='black')
        canvas.save(folder/f'contact-{first//4+1}.jpg',quality=90)


def render(item, out):
    folder=out/item['id'];folder.mkdir(parents=True,exist_ok=True)
    path=ROOT/item['file']
    if path.suffix.lower()=='.pdf':
        with fitz.open(path) as doc:
            for p in doc:
                p.get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save(folder/f'page-{p.number+1}.png')
    else:
        helper='/root/.codex/skills/builtins/documents/render_docx.py'
        env=dict(os.environ)
        env['LD_LIBRARY_PATH']='/opt/codex/runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/lib'
        result=subprocess.run([sys.executable,helper,str(path),'--output_dir',str(folder),'--emit_pdf'],env=env,capture_output=True,text=True)
        if result.returncode: return {'file':item['file'],'render_error':result.stderr[-1500:]}
    contacts(folder)
    return {'file':item['file'],'rendered_pages':len(list(folder.glob('page-*.png'))),'render_id':item['id']}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--render-root',type=Path)
    args=parser.parse_args();records=[];seen={}; jobs=[]
    for i,path in enumerate(sorted(p for p in ROOT.rglob('*') if p.suffix.lower() in {'.docx','.pdf'}),1):
        sha=hashlib.sha256(path.read_bytes()).hexdigest();name=str(path.relative_to(ROOT))
        kind='export-under-review' if path.parent.name=='out' or 'extracted' in path.name else 'non-question-document' if path.name.startswith('final PT_') else 'reference'
        item={'id':f'{i:02d}-'+re.sub(r'[^A-Za-z0-9]+','-',path.stem).strip('-')[:65],
              'file':name,'sha256':sha,'kind':kind,'bytes':path.stat().st_size,'visual_review':'pending'}
        if path.suffix.lower()=='.docx': item['word']=word(path)
        else:
            item['pages']=pdf(path)
            if not any(p['text'].strip() for p in item['pages']):item['kind']='scan-input'
        if sha in seen:item['duplicate_of']=seen[sha]
        else:seen[sha]=name;jobs.append(item)
        records.append(item)
    if args.render_root:
        args.render_root.mkdir(parents=True,exist_ok=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            for f in as_completed([pool.submit(render,item,args.render_root) for item in jobs]):
                result=f.result();next(r for r in records if r['file']==result['file']).update(result)
                print(json.dumps(result),flush=True)
        for r in records:
            if 'duplicate_of' in r:
                original=next(x for x in records if x['file']==r['duplicate_of'])
                for field in ['render_id','rendered_pages']:r[field]=original.get(field)
    target=ROOT/'corpus-review.json'
    target.write_text(json.dumps({'version':1,'scope':'Every Word and PDF recursively in training, with identical files rendered once. References and generated outputs are separate roles, not assumed OCR pairs.','records':records},ensure_ascii=False,indent=2)+'\n')
    print(f'Read {len(records)} files, {len(jobs)} unique documents. Wrote {target.name}',flush=True)


if __name__=='__main__':main()
