"""Rebuild editable SVG design artifacts only; no application imports or network.
python3 docs/art-direction/build-ui.py
Rasterize with render-ui.mjs (sharp required).
"""
import base64
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
T = json.loads((ROOT / "ui-tokens.json").read_text())
P = T["palette"]
SERIF = "'Noto Serif CJK SC','Source Han Serif SC','Songti SC',serif"
SANS = "'Noto Sans CJK SC','Source Han Sans SC','PingFang SC',sans-serif"
def data(name):
    return "data:image/png;base64," + base64.b64encode((ROOT / "boards" / name).read_bytes()).decode()
MAP, OBJECTS = data("05-map.png"), data("04-objects.png")
def rect(x,y,w,h,fill,stroke="none",r=0,extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" {extra}/>'
def text(x,y,label,size=18,fill=None,font=SANS,extra=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill or P["ink"]}" font-family="{font}" {extra}>{html.escape(label)}</text>'
def rule(x,y,end):
    return f'<path d="M{x} {y}H{end}" stroke="#AFA591" fill="none"/>'
def lines(x,y,rows,size=18,fill=None,step=30):
    return "".join(text(x,y+i*step,t,size,fill) for i,t in enumerate(rows))
PATHS = {
"map":'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/>',
"place":'<path d="M12 21S5 14 5 9a7 7 0 0 1 14 0c0 5-7 12-7 12Z"/><circle cx="12" cy="9" r="2"/>',
"object":'<path d="m3 7 9-4 9 4v11l-9 4-9-4Z M3 7l9 4 9-4 M12 11v11"/>',
"book":'<path d="M12 5C7 2 3 3 3 3v16s4-1 9 2c5-3 9-2 9-2V3s-4-1-9 2Z M12 5v16"/>',
"clock":'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
"close":'<path d="m6 6 12 12 M18 6 6 18"/>',
"plus":'<path d="M5 12h14 M12 5v14"/>',
"minus":'<path d="M5 12h14"/>',
"home":'<path d="m3 10 9-7 9 7 M5 9v12h14V9 M10 21v-7h4v7"/>',
"arrow":'<path d="M5 12h14 m-5-5 5 5-5 5"/>',
"check":'<path d="m5 12 4 4 10-10"/>',
"warning":'<path d="m12 3 10 18H2Z M12 9v5 M12 17v1"/>',
"up":'<path d="m6 15 6-6 6 6"/>',
"chevron":'<path d="m9 5 7 7-7 7"/>'
}
def icon(name,x,y,c=None,size=22):
    return f'<g transform="translate({x} {y}) scale({size/24})" fill="none" stroke="{c or P["bone"]}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{PATHS[name]}</g>'
def button(x,y,w,label,dark=False,selected=False,focus=False,icon_name=None,disabled=False,hover=False):
    bg = P["ink"] if dark else ("#D9CFB9" if selected or hover else P["bone"])
    fg = P["bone"] if dark else ("#62605A" if disabled else P["ink"])
    s = f'<g data-control="true" aria-label="{html.escape(label)}">'
    if focus:
        s += rect(x-4,y-4,w+8,52,"none",P["amber"] if dark else P["teal"],5,'stroke-width="2"')
    s += rect(x,y,w,44,bg,"#8A7968" if dark else "#AFA591",3,'data-hit="true"')
    if selected:
        s += rect(x,y,3,44,P["ochre"])
    if icon_name:
        s += icon(icon_name,x+12,y+11,fg)
    return s + text(x+(42 if icon_name else 14),y+28,label,16,fg) + "</g>"
def ib(x,y,name,label):
    return f'<g data-control="true" aria-label="{html.escape(label)}">' + rect(x,y,44,44,P["ink"],"#8A7968",3,'data-hit="true"')+icon(name,x+11,y+11)+"</g>"
def image_region(src,x,y,w,h,vb):
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}" preserveAspectRatio="xMidYMid slice" overflow="hidden"><image href="{src}" width="1536" height="1024"/></svg>'
def world(w,h,y):
    s = '<g id="painted-world-reference">' + image_region(MAP,0,y,w,h,"16 56 1500 620")
    if h < 200:
        return s + "</g>"
    s += rect(24,y+24,254,88,P["ink"],r=3)
    s += text(42,y+50,"GRAYHAVEN / 1985",13,P["amber"]) + text(42,y+84,"灰港镇",28,P["bone"],SERIF)
    lx,ly = round(w*.54), round(y+h*.52)
    s += rect(lx,ly,128,44,P["ink"],P["amber"],3)+icon("place",lx+10,ly+11,P["amber"])+text(lx+40,ly+28,"蓝鸟餐馆",16,P["bone"])
    s += ib(24,y+h-168,"plus","放大")+ib(24,y+h-116,"minus","缩小")+ib(24,y+h-64,"home","回到全景")
    return s + "</g>"
def shell(w,h,body,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{title}"><title>{title}</title><desc>文学档案式界面静态设计。控件和文字为原生矢量，嵌入场景为绘画概念参考，非游戏运行画面。</desc>'+rect(0,0,w,h,P["ink"])+body+"</svg>"
def desktop(w,h,item=False):
    pw = 400 if w==1440 else 360
    wx,x,cw = w-pw,w-pw+32,pw-64
    b = world(wx,h-136,80)
    b += '<g id="header">'+rect(0,0,w,80,P["ink"])+text(28,48,"灰港手记",28,P["bone"],SERIF)+text(178,46,"GRAYHAVEN",13,P["amber"])
    b += button(350,18,100,"地图",dark=True,selected=True,icon_name="map")+button(466,18,112,"见闻录",dark=True,icon_name="book")
    b += icon("clock",wx-178,29)+text(wx-145,48,"15:00",18,P["bone"])
    b += text(wx+32,47,"物品 / OBJECT" if item else "地点 / PLACE",14,P["amber"])+ib(w-64,18,"close","关闭阅读栏")+"</g>"
    b += '<g id="reading-panel">'+rect(wx,80,pw,h-80,P["bone"])+text(x,120,"物件档案 · 02" if item else "地方档案 · 014",13,"#58564F")
    if not item:
        b += text(x,166,"蓝鸟餐馆",32,font=SERIF)+text(x,194,"BLUEBIRD · MAIN STREET",13,"#58564F")+rule(x,216,w-32)
        b += button(x,232,96,"地点",selected=True)+button(x+108,232,96,"物品")+button(x+216,232,96,"记录")
        b += lines(x,316,["堂座还留着繁荣年代的底子。","临窗一排绿皮卡座，","人造革磨得发亮。","长条柜台前是一溜转凳。"])
        b += rect(x,432,3,86,P["ochre"])+lines(x+16,457,["物件的使用痕迹，","让空间有了时间。"])
        b += text(x+16,508,"— 美术说明，非事件文本",13,"#58564F")+text(x,563,"可查看的物品",20,font=SERIF)
        for i,label in enumerate(["绿皮卡座","长条柜台","柜台收音机"]):
            yy=586+i*64
            b += f'<g data-control="true" aria-label="{label}">'+rect(x,yy,cw,56,P["bone"],"#AFA591",3,'data-hit="true"')+icon("object",x+12,yy+16,P["teal"])+text(x+48,yy+35,label,17)+icon("chevron",w-64,yy+17,P["teal"])+"</g>"
        b += button(x,h-78,cw,"返回地图",icon_name="map")
    else:
        b += text(x,164,"铸铁汤锅",30,font=SERIF)+text(x,192,"CAST-IRON STEW POT",13,"#58564F")
        b += image_region(OBJECTS,x+(cw-188)/2,210,188,188,"520 120 355 355")+rule(x,416,w-32)
        b += lines(x,450,["灶上最大的一口铸铁锅。","锅沿结着一圈陈年的","琥珀色汤垢。"])
        b += text(x,558,"所在位置",14,"#58564F")+text(x,588,"蓝鸟餐馆 · 后厨",18,font=SERIF)
        b += button(x,h-82,cw,"返回地点",icon_name="place")
    b += "</g>"+rect(0,h-56,wx,56,P["ink"])+text(26,h-23,"平移观察  /  滚轮缩放",14,P["bone"])+text(wx-274,h-23,"静态界面样板 · 概念场景",13,P["mist"])
    return shell(w,h,b,"物品阅读界面 1280×720" if item else "地点阅读界面 1440×900")
def mobile(expanded=False):
    w,h,py=390,844,168 if expanded else 544
    b = world(w,py-64,64)
    b += rect(0,0,w,64,P["ink"])+text(20,42,"灰港手记",24,P["bone"],SERIF)+ib(270,10,"book","见闻录")+ib(326,10,"map","地图")
    b += '<g id="bottom-reading-panel">'+rect(0,py,w,h-py,P["bone"])+rect(169,py+10,52,4,"#8A7968",r=2)
    b += text(24,py+43,"物品 / 蓝鸟餐馆 · 后厨",13,"#58564F")+ib(326,py+22,"close" if expanded else "up","收起阅读" if expanded else "展开阅读")+text(24,py+84,"铸铁汤锅",28,font=SERIF)
    if expanded:
        b += text(24,py+110,"CAST-IRON STEW POT",13,"#58564F")+image_region(OBJECTS,80,py+128,230,230,"520 120 355 355")
        b += lines(24,py+393,["灶上最大的一口铸铁锅，","炖鱼汤从早上文火煨到打烊。","锅沿结着一圈陈年的琥珀色汤垢。"])
        b += text(24,py+508,"所在位置",14,"#58564F")+text(24,py+540,"蓝鸟餐馆 · 后厨",18,font=SERIF)
    else:
        b += lines(24,py+123,["灶上最大的一口铸铁锅。","锅沿结着陈年的琥珀色汤垢。"])+text(24,py+186,"向上展开，阅读完整物品说明",14,"#58564F")
    b += button(24,h-84,342,"返回地点",icon_name="place")+text(24,h-15,"静态样板 · 文字与控件均可编辑",13,"#58564F")+"</g>"
    return shell(w,h,b,"手机阅读展开状态 390×844" if expanded else "手机阅读折叠状态 390×844")
def components():
    b=rect(0,0,1440,680,P["bone"])+text(32,55,"界面组件 / STATES & SEMANTICS",30,font=SERIF)
    states=[("默认",{}),("悬停",{"hover":True}),("选中",{"selected":True,"icon_name":"check"}),("键盘焦点",{"focus":True}),("不可用",{"disabled":True})]
    for i,(label,opts) in enumerate(states):
        x=40+i*270
        b+=text(x,110,label,18)+button(x,132,224,"查看地点",**opts)
    b+=text(40,225,"图标 / 24 单位网格 · 44 px 命中区域",18)
    for i,n in enumerate(PATHS):
        b+=rect(40+i*94,248,44,44,"none","#AFA591")+icon(n,51+i*94,259,P["teal"])
    b+=rect(40,344,420,126,P["ink"],r=3)+icon("book",60,367,P["amber"])+text(94,385,"正在读取地点信息",18,P["bone"])+text(60,437,"保留稳定区域，不生成占位剧情",14,P["bone"])
    b+=rect(500,344,420,126,P["bone"],"#AFA591",3)+icon("warning",520,367,P["rust"])+text(554,385,"暂时无法读取",18,T["semantic"]["danger"])+button(520,405,146,"重新读取")
    b+=rect(960,344,420,126,P["bone"],"#AFA591",3)+text(982,385,"未获知",20,font=SERIF)+text(982,437,"未知内容不显示原始名称或 ID",14,"#58564F")
    b+=text(40,530,"正文 / Body 18 px · 1.65",20,font=SERIF)+text(40,566,"物件的使用痕迹，让空间有了时间。")+text(40,600,"The room remembers the hands that used it.")
    b+=text(810,530,"辅助文字与数字",20,font=SERIF)+text(810,566,"正文 16–18 px / 控件文字至少 14 px",16,"#58564F")+text(810,600,"07:00   15:00   23:00",extra='style="font-variant-numeric:tabular-nums"')
    b+=text(40,650,"交互规范：焦点环、可读原因、减少动态效果。此图是组件设计，不含运行交互。",14,"#58564F")
    return shell(1440,680,b,"组件、图标与状态规范")
SVGS={"desktop-1440x900":desktop(1440,900),"item-1280x720":desktop(1280,720,True),"mobile-390x844":mobile(),"mobile-expanded-390x844":mobile(True),"components":components()}
(ROOT/"ui").mkdir(exist_ok=True)
(ROOT/"qa").mkdir(exist_ok=True)
for name,svg in SVGS.items():
    (ROOT/"ui"/(name+".svg")).write_text(svg)
def nest(svg,x,y,w,h):
    import re
    return re.sub(r'<svg xmlns="[^"]+" width="\d+" height="\d+"',f'<svg x="{x}" y="{y}" width="{w}" height="{h}"',svg,count=1)
b=rect(0,0,1920,1280,P["bone"])+text(40,58,"02 / 文学档案 · THE LITERARY ARCHIVE",34,font=SERIF)
b+=text(40,94,"桌面：地点阅读 / 1440×900",16,"#58564F")+text(1370,94,"手机：物品阅读 / 390×844",16,"#58564F")
b+=nest(SVGS["desktop-1440x900"],40,112,1267.2,792)+nest(SVGS["mobile-390x844"],1370,112,343.2,742.72)
b+=text(40,946,"组件语言",24,font=SERIF)
b+=button(40,976,212,"地点",selected=True,icon_name="place")+button(278,976,212,"查看物品",focus=True,icon_name="object")+button(516,976,212,"正在读取",disabled=True)+button(754,976,212,"重新读取",icon_name="warning")
b+=text(40,1073,"骨白纸面 · 炭墨文字 · 原生矢量控件 · 中英文独立排版",20,font=SERIF)
b+=text(40,1112,"正文 16–18 px / 行高 1.65 / 命中区域 ≥44 px / 120–220 ms 过渡",18,"#58564F")
b+=text(40,1150,"物品详情、展开阅读与完整状态板见同目录 SVG。绘画背景只作概念参考。",18,"#58564F")
b+=text(40,1234,"DESIGN STUDY / NOT AN ENGINE CAPTURE · UI 可编辑，场景为嵌入式绘画参考",14,"#58564F")
(ROOT/"ui"/"02-ui-board.svg").write_text(shell(1920,1280,b,"文学档案式 UI 总览板"))
print("Built 5 editable screens and UI board SVG.")
