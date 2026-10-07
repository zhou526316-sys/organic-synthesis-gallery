import concurrent.futures, hashlib, json, urllib.request
from pathlib import Path
from PIL import Image
out=Path('r10-toc-source');out.mkdir(exist_ok=True)
api='https://api.gczhouwld.com/api/toc?doi=10.1002%2Fanie.3699223'
record=None
try:
    with urllib.request.urlopen(urllib.request.Request(api,headers={'User-Agent':'Mozilla/5.0'}),timeout=25) as r:
        raw=r.read(1000001)
    record=json.loads(raw)
    (out/'toc-record.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
except Exception as e:
    (out/'toc-record-error.txt').write_text(str(e))
known='https://onlinelibrary.wiley.com/cms/asset/d28b6dd6-79d8-444e-ad33-2df403792b42/anie75173-gra-0001-m.png'
candidates=[known.replace('-m.png','-l.png'),known]
def collect(obj):
    if isinstance(obj,dict):
        for k,v in obj.items():
            if k in ['sourceUrl','url','imageUrl','proxyUrl'] and isinstance(v,str) and v.startswith('https://'):candidates.append(v)
            elif isinstance(v,(dict,list)):collect(v)
    elif isinstance(obj,list):
        for v in obj:collect(v)
if record:collect(record)
candidates=list(dict.fromkeys(candidates))[:5]
def get(item):
    index,url=item
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://onlinelibrary.wiley.com/'})
        with urllib.request.urlopen(req,timeout=25) as response:
            data=response.read(12000001)
            actual=response.url
        if len(data)>12000000:raise ValueError('Image exceeds 12MB')
        path=out/('toc-'+str(index)+'.source');path.write_bytes(data)
        with Image.open(path) as im:
            im.load();fmt=im.format;size=im.size
        ext={'PNG':'.png','JPEG':'.jpg','WEBP':'.webp'}.get(fmt,'.image')
        dst=path.with_suffix(ext);path.rename(dst)
        return {'url':url,'finalUrl':actual,'path':str(dst),'format':fmt,'width':size[0],'height':size[1],'sha256':hashlib.sha256(data).hexdigest(),'status':'downloaded'}
    except Exception as e:return {'url':url,'status':'failed','error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:rows=list(pool.map(get,enumerate(candidates)))
(out/'result.json').write_text(json.dumps({'doi':'10.1002/anie.3699223','scope':'read-only source lookup','images':rows},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows,ensure_ascii=False))
if not any(x['status']=='downloaded' for x in rows):raise RuntimeError('No decodable TOC image')
