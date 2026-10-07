from pathlib import Path
import fitz, math, json, hashlib

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/wechat-assets/reviewed/2026-10-07-r10'
OUT.mkdir(parents=True,exist_ok=True)
FONT=ROOT/'r10-concept-font.ttf'
if not FONT.exists():FONT.write_bytes(fitz.Font('cjk').buffer)
INK='#152A43';MUTED='#53697E';BLUE='#225DB7';ORANGE='#B86121';TEAL='#28766C';LINE='#8294A7'

def col(h):return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
class Canvas:
    def __init__(self,h):
        self.doc=fitz.open();self.p=self.doc.new_page(width=1000,height=h);self.h=h
        self.p.insert_font(fontname='CJK',fontfile=str(FONT));self.font=fitz.Font(fontfile=str(FONT))
        symbolfont='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
        self.p.insert_font(fontname='DejaVuCharge',fontfile=symbolfont);self.symbolfont=fitz.Font(fontfile=symbolfont)
        self.p.draw_rect(fitz.Rect(0,0,1000,h),color=None,fill=col('#FFFFFF'))
    def text(self,x,y,t,size=34,ink=INK,center=False):
        runs=[]
        for char in t:
            name='CJK' if self.font.has_glyph(ord(char)) else 'DejaVuCharge'
            font=self.font if name=='CJK' else self.symbolfont
            assert font.has_glyph(ord(char)),('missing glyph',char)
            if runs and runs[-1][0]==name:runs[-1][2]+=char
            else:runs.append([name,font,char])
        width=sum(font.text_length(run,fontsize=size) for _,font,run in runs)
        if center:x-=width/2
        assert x>=10 and x+width<=990,(t,x,width)
        for name,font,run in runs:
            self.p.insert_text((x,y),run,fontname=name,fontsize=size,color=col(ink))
            x+=font.text_length(run,fontsize=size)
    def lines(self,x,y,ts,size=30,ink=INK,step=None,center=False):
        for i,t in enumerate(ts):self.text(x,y+i*(step or size*1.5),t,size,ink,center)
    def rect(self,x,y,w,h,fill,stroke=None,width=1):
        self.p.draw_rect(fitz.Rect(x,y,x+w,y+h),color=col(stroke) if stroke else None,fill=col(fill),width=width)
    def ellipse(self,x,y,w,h,fill=None,stroke=None,width=2,dashes=None,opacity=1):
        self.p.draw_oval(fitz.Rect(x,y,x+w,y+h),color=col(stroke) if stroke else None,fill=col(fill) if fill else None,width=width,dashes=dashes,fill_opacity=opacity)
    def line(self,x1,y1,x2,y2,ink=LINE,width=3,dashes=None):
        self.p.draw_line((x1,y1),(x2,y2),color=col(ink),width=width,dashes=dashes)
    def arrow(self,x1,y1,x2,y2,ink=LINE,width=4):
        self.line(x1,y1,x2,y2,ink,width)
        a=math.atan2(y2-y1,x2-x1);l=16
        pts=[fitz.Point(x2,y2),fitz.Point(x2-l*math.cos(a-.48),y2-l*math.sin(a-.48)),fitz.Point(x2-l*math.cos(a+.48),y2-l*math.sin(a+.48))]
        self.p.draw_polyline(pts,color=col(ink),fill=col(ink),closePath=True,width=1)
    def solvent(self,x,y):
        self.ellipse(x-21,y-21,42,42,'#F5F8FB','#CEDAE4',1)
        self.text(x,y+9,'S',25,MUTED,True)
    def save(self,name):
        png=OUT/(name+'.png');self.p.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).save(png)
        svg=OUT/(name+'.svg');svg.write_text(self.p.get_svg_image(text_as_path=True))
        self.doc.close();return png

def fig1():
    c=Canvas(1210)
    c.text(52,75,'两种淬灭循环',50)
    c.text(54,125,'先看激发态 PC* 在首次电子转移中的变化',30,MUTED)
    for y,title,fill,first,second,et1,et2 in [
        (160,'氧化淬灭：PC* 先失去电子','#F2F6FC','PC* + A  →  PC•⁺ + A•⁻','PC•⁺ + D  →  PC + D•⁺','电子方向：PC* → A','电子方向：D → PC•⁺'),
        (645,'还原淬灭：PC* 先得到电子','#FDF7EF','PC* + D  →  PC•⁻ + D•⁺','PC•⁻ + A  →  PC + A•⁻','电子方向：D → PC*','电子方向：PC•⁻ → A')]:
        c.rect(40,y,920,445,fill)
        c.text(70,y+60,title,38)
        c.text(90,y+130,'① 吸光',30,MUTED);c.text(430,y+130,'PC + hν → PC*',39,BLUE)
        c.text(90,y+218,'② 首次转移',30,MUTED);c.text(415,y+214,first,36)
        c.text(415,y+261,et1,29,ORANGE)
        c.text(90,y+343,'③ 催化剂再生',30,MUTED);c.text(415,y+339,second,36)
        c.text(415,y+386,et2,29,ORANGE)
    c.text(50,1145,'PC：光催化剂   D：电子给体   A：电子受体   *：激发态',27,MUTED)
    c.text(50,1190,'概念示意｜初始 PC、D、A 按电中性简化；非 phoenix1 完整反应网络。',23,MUTED)
    return c.save('ncx1-quenching-cycles')

def fig2():
    c=Canvas(1050)
    c.text(50,72,'淬灭之后，离子对有两种竞争去向',42)
    c.text(52,121,'以还原淬灭形成的自由基离子对为例',30,MUTED)
    c.ellipse(215,165,570,305,'#F7FAFC','#9DB0C1',3,'[10 8]')
    for x,y in [(260,205),(399,185),(578,190),(739,217),(250,395),(732,399),(397,440),(595,440)]:c.solvent(x,y)
    c.ellipse(312,257,155,96,'#DCEBFB',BLUE,2)
    c.ellipse(537,257,145,96,'#FFF0DD',ORANGE,2)
    c.text(388,318,'PC•⁻',39,BLUE,True);c.text(609,318,'D•⁺',39,ORANGE,True)
    c.line(478,306,526,306,LINE,3,'[4 6]')
    c.text(500,407,'同一溶剂笼内，暂时相邻',29,MUTED,True)
    c.arrow(401,468,261,560,ORANGE);c.arrow(599,468,745,560,TEAL)
    c.rect(40,580,440,288,'#FEF7EE');c.rect(520,580,440,288,'#F0F8F5')
    c.text(260,635,'反向电子转移',36,ORANGE,True)
    c.text(260,682,'电子：PC•⁻ → D•⁺',27,ORANGE,True)
    c.text(260,752,'PC + D',44,INK,True)
    c.text(260,825,'这对电荷分离物种被消耗',27,MUTED,True)
    c.text(740,635,'笼逃逸',36,TEAL,True)
    c.text(740,682,'反应伙伴彼此分离',27,TEAL,True)
    c.text(631,762,'PC•⁻',39,BLUE,True);c.text(853,762,'D•⁺',39,ORANGE,True)
    c.arrow(718,748,677,748,TEAL,2);c.arrow(768,748,805,748,TEAL,2)
    for x,y in [(555,714),(796,712),(919,785)]:c.solvent(x,y)
    c.text(740,825,'有机会参与后续反应',27,MUTED,True)
    c.text(500,933,'分开的是反应伙伴，电子仍处于 PC 的分子电子态。',30,INK,True)
    c.text(500,984,'“笼”是瞬时溶剂环境的示意，不是真实硬壁容器。',27,MUTED,True)
    c.text(50,1030,'概念示意｜S：溶剂。背景：Wang 等，Nature Chemistry 2024，Fig. 1a。',22,MUTED)
    return c.save('ncx2-cage-competition')

def fig3():
    c=Canvas(1160)
    c.text(50,75,'电子在哪一种电子态中？',47)
    c.text(52,127,'两者都受溶剂环境影响；这里对照电子态的性质',29,MUTED)
    c.rect(40,168,920,370,'#F6F9FC')
    c.text(72,225,'分子自由基负离子 PC•⁻',39)
    for x,y in [(94,318),(233,295),(330,365),(270,482),(116,456)]:c.solvent(x,y)
    c.ellipse(139,335,151,101,'#DCEBFB',BLUE,3)
    c.ellipse(151,345,127,81,'#9CC8F0',None,1,opacity=.65)
    c.text(215,397,'PC•⁻',40,BLUE,True)
    c.lines(415,335,['电子占据 PC 的分子电子态','周围同样存在溶剂','分子带负电 ≠ 溶剂化电子'],30,step=62)
    c.rect(40,570,920,370,'#F0F7F7')
    c.text(72,628,'溶剂化电子 e⁻（solv）',39)
    for x,y in [(112,710),(243,700),(340,774),(283,874),(118,870),(74,780)]:c.solvent(x,y)
    for i in range(10):
        w=166-i*11;h=132-i*8
        c.ellipse(214-w/2,790-h/2,w,h,'#3E94CD',None,1,opacity=.04+i*.006)
    c.text(214,804,'e⁻',39,BLUE,True)
    c.lines(415,724,['多余电子由周围溶剂环境稳定','仍可与正电荷伙伴复合','也可被电子受体截获'],29,step=62)
    c.text(500,1001,'溶剂笼：空间关联     溶剂化电子：电子态',32,INK,True)
    c.text(500,1050,'两幅之间不表示自动转化关系。',29,MUTED,True)
    c.lines(50,1102,['概念示意｜S：溶剂；蓝色区域非实测电子密度，不指定固定空腔。','背景：Villa 等，Chemical Science 2024，DOI 10.1039/D4SC04518A。'],23,MUTED,step=33)
    return c.save('ncx3-electronic-states')

files=[fig1(),fig2(),fig3()]
rows=[]
for p in files:
    b=p.read_bytes();rows.append({'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
(ROOT/'concept-assets.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows,ensure_ascii=False))
