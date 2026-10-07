#!/usr/bin/env python3
"""Compose an unchanged scientific TOC and a separate blue title band in SVG."""
from pathlib import Path
import base64
import hashlib
import fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/wechat-assets/reviewed/2026-10-07-r10/an-toc-original-500.png'
DEST = ROOT / 'public/wechat-assets/reviewed/2026-10-07-r12/an-cover-white-toc-blue-band-r12'
data = SOURCE.read_bytes()
assert hashlib.sha256(data).hexdigest() == 'fb4e71bc703621c00bd02dd8715dd6b1d47d6055e0b85f95bdcce3969aeea16e'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1880" height="800" viewBox="0 0 1880 800">
<title>Original white-background TOC with a separate blue title band</title>
<rect width="1880" height="800" fill="#ffffff"/>
<image x="690" y="18" width="500" height="247" xlink:href="data:image/png;base64,{base64.b64encode(data).decode()}"/>
<rect x="0" y="288" width="1880" height="512" fill="#17436c"/>
</svg>'''
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.with_suffix('.svg').write_text(svg, encoding='utf-8')
with fitz.open(stream=svg.encode(), filetype='svg') as doc:
    with fitz.open('pdf', doc.convert_to_pdf()) as pdf:
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(1,1), alpha=False)
        assert (pix.width, pix.height) == (1880,800)
        pix.save(DEST.with_suffix('.png'))
print(DEST.with_suffix('.png'))
