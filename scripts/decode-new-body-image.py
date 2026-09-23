"""Decode bytes already fetched from R2. Never fetch a URL or alter an image."""
import base64, io, json, re, sys, warnings
from pathlib import Path
from PIL import Image
from defusedxml import ElementTree
import cairosvg
Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
ALLOWED = {'svg','g','defs','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','textPath','title','desc','clipPath','mask','pattern','linearGradient','radialGradient','stop','use','image','style','metadata','symbol','marker'}
def raster(raw):
    with Image.open(io.BytesIO(raw)) as im:
        assert im.format in ('PNG','JPEG','WEBP'), 'unsupported_embedded_raster'
        assert 0 < im.width * im.height <= 20_000_000, 'raster_too_large'
        dimensions = im.size
        im.verify()
    with Image.open(io.BytesIO(raw)) as im: im.load()
    return dimensions

def decode(filename, kind):
    raw=Path(filename).read_bytes()
    assert 100 <= len(raw) <= 4_000_000, 'invalid_size'
    if kind == 'image/png':
        width,height=raster(raw)
        return {'decoded':True,'kind':'raster','width':width,'height':height}
    assert kind == 'image/svg+xml', 'unsupported_type'
    text=raw.decode('utf-8')
    assert not re.search(r'<!DOCTYPE|<!ENTITY|<\?xml-stylesheet', text, re.I), 'unsafe_xml'
    root=ElementTree.fromstring(raw)
    assert root.tag in ('svg','{http://www.w3.org/2000/svg}svg'), 'not_svg'
    paths=0; images=0; nodes=list(root.iter());assert len(nodes)<=100000, 'too_many_svg_nodes'
    for node in nodes:
        tag=node.tag.split('}')[-1]
        assert tag in ALLOWED, 'unsupported_svg_element'
        if tag in ('path','line','polyline','polygon','rect','circle','text'): paths+=1
        for key,value in node.attrib.items():
            name=key.split('}')[-1].lower()
            assert not name.startswith('on') and name not in ('base',), 'active_svg_attribute'
            assert not re.search(r'@import|\\|expression\s*\(',value,re.I), 'unsafe_svg_css'
            for match in re.finditer(r'url\(\s*[\"\']?([^\)\"\']+)',value,re.I):
                assert match[1].strip().startswith('#'), 'external_css_resource'
            if name == 'href':
                if value.startswith('#'): continue
                assert tag=='image', 'external_svg_reference'
                match=re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)',value)
                assert match, 'unsupported_embedded_image'
                raster(base64.b64decode(match[1],validate=False)); images+=1
        if tag == 'style':
            css=node.text or ''
            assert not re.search(r'@|\\|https?:|//|expression\s*\(',css,re.I), 'unsafe_style_sheet'
            for match in re.finditer(r'url\(\s*[\"\']?([^\)\"\']+)',css,re.I):
                assert match[1].strip().startswith('#'), 'external_style_resource'
    assert paths>=3, 'raster_only_svg_requires_separate_review'
    # Strict tree checks above prohibit external resources; unsafe mode is never enabled.
    png=cairosvg.svg2png(bytestring=raw,output_width=640,output_height=640,unsafe=False)
    raster(png)
    return {'decoded':True,'kind':'mixed_svg' if images else 'vector_svg','renderedWidth':640,'renderedHeight':640,'embeddedImages':images}

if __name__=='__main__':
    try: print(json.dumps(decode(sys.argv[1],sys.argv[2])))
    except Exception as error:
        print(json.dumps({'decoded':False,'errorType':type(error).__name__,'reason':str(error)[:120]}))
        sys.exit(1)
