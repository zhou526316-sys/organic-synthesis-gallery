#!/usr/bin/env python3
"""Deterministic cover tone adaptation; preserve every original glyph and bond.

No generative image model, OCR replacement, vector tracing, or structure redraw.
The unmodified original TOC remains separately pinned in the repository.
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'public/wechat-assets/reviewed/2026-10-07-r10/an-toc-original-500.png'
TARGET=ROOT/'public/wechat-assets/reviewed/2026-10-07-r11/an-cover-dark-toc-r11.png'
BACKGROUND=(16,36,56)
source=Image.open(SOURCE).convert('RGB')
adapted=Image.new('RGB',source.size,BACKGROUND)
pixels=[]
for red,green,blue in source.getdata():
    coverage=(255-min(red,green,blue))/255
    if red-blue>35 and red-green>25:
        ink=(255,156,128)
    elif blue-red>35 or blue-green>35:
        ink=(120,195,255)
    else:
        ink=(235,243,250)
    pixels.append(tuple(round(BACKGROUND[i]*(1-coverage)+ink[i]*coverage) for i in range(3)))
adapted.putdata(pixels)
art=ImageOps.contain(adapted,(1816,730),Image.Resampling.LANCZOS)
cover=Image.new('RGB',(1880,800),BACKGROUND)
cover.paste(art,((1880-art.width)//2,10))
for y in range(180,800):
    opacity=min(.80,(y-180)/(288-180)*.80)
    for x in range(1880):
        pixel=cover.getpixel((x,y))
        cover.putpixel((x,y),tuple(round(pixel[i]*(1-opacity)+BACKGROUND[i]*opacity) for i in range(3)))
TARGET.parent.mkdir(parents=True,exist_ok=True)
cover.save(TARGET,optimize=True)
print(TARGET)
