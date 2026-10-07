#!/usr/bin/env python3
"""Proportionally lay out the original TOC above a band fitted to this title."""
from pathlib import Path
import base64, hashlib, fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/wechat-assets/reviewed/2026-10-07-r10/an-toc-original-500.png'
DEST = ROOT / 'public/wechat-assets/reviewed/2026-10-07-r14/an-cover-white-toc-fitted-band-r14'
data = SOURCE.read_bytes()
assert hashlib.sha256(data).hexdigest() == 'fb4e71bc703621c00bd02dd8715dd6b1d47d6055e0b85f95bdcce3969aeea16e'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1880" height="800" viewBox="0 0 1880 800">
<title>Original-color TOC above a slim bottom blue title band</title>
<rect width="1880" height="800" fill="#ffffff"/>
<image x="360" y="12" width="1160" height="573.04" xlink:href="data:image/png;base64,{base64.b64encode(data).decode()}"/>
<rect x="0" y="600" width="1880" height="200" fill="#17436c"/>
</svg>'''
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.with_suffix('.svg').write_text(svg, encoding='utf-8')
with fitz.open(stream=svg.encode(), filetype='svg') as doc:
    with fitz.open('pdf', doc.convert_to_pdf()) as pdf:
        pix=pdf[0].get_pixmap(alpha=False)
        assert (pix.width,pix.height)==(1880,800)
        pix.save(DEST.with_suffix('.png'))
print(DEST.with_suffix('.png'))
