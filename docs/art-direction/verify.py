"""Validate the design delivery. Requires Pillow; never changes application data."""
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
errors=[]
def need(ok,message):
    if not ok: errors.append(message)
def load(name):
    return json.loads((ROOT/name).read_text())
t=load("ui-tokens.json")
def color(k):
    v=t["semantic"][k]
    return t["palette"].get(v,v)
def luminance(c):
    rgb=[int(c[i:i+2],16)/255 for i in (1,3,5)]
    lin=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return sum(v*w for v,w in zip(lin,[.2126,.7152,.0722]))
contrasts=[]
for a,b,target in t["contrastPairs"]:
    lo,hi=sorted([luminance(color(a)),luminance(color(b))])
    value=(hi+.05)/(lo+.05)
    contrasts.append({"foreground":a,"background":b,"ratio":round(value,3),"minimum":target})
    need(value>=target,f"Contrast {a}/{b}: {value} < {target}")
assets=load("assets.json")["items"]
need(len(assets)==6,"Expected exactly six object author cards")
families={m["id"] for m in load("materials.json")["families"]}
for a in assets:
    src=(ROOT/a["source"]).resolve()
    need(src.is_file(),"Missing module source "+a["source"])
    scene=json.loads(src.read_text())
    ids={x["id"] for x in scene["references"]["items"]}
    need(a["entityId"] in ids,"Unresolved entity "+a["entityId"])
    need(a["sceneId"]==scene["id"],"Scene mismatch "+a["assetId"])
    need(all(0<x<100 for x in a["sizeMeters"]),"Bad dimension "+a["assetId"])
    need(set(a["materialFamilies"])<=families,"Unknown material "+a["assetId"])
    need(a["files"]["model"] is None,"Concept package must not claim model delivery")
need(len(load("lighting.json")["keyframes"])==6,"Expected six lighting keyframes")
boards=sorted((ROOT/"boards").glob("*.png"))
need(len(boards)==7,"Expected exactly seven final PNG boards")
images=[]
for p in boards:
    with Image.open(p) as im:
        im.load()
        need(im.width>=1536 and im.height>=1024,"Board too small "+p.name)
        images.append({"path":str(p.relative_to(ROOT)),"width":im.width,"height":im.height,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()})
# Review-only derivatives; the authored PNGs are not changed.
sheet=Image.new("RGB",(1152,768),"#E7DDC8")
for i,p in enumerate(boards):
    with Image.open(p) as im:
        thumb=ImageOps.contain(im.convert("RGB"),(384,256))
        sheet.paste(thumb,((i%3)*384,(i//3)*256))
sheet.save(ROOT/"qa"/"overview-contact.png")
with Image.open(ROOT/"boards"/"05-map.png") as im:
    region=im.crop((16,56,1520,675))
    gray=ImageOps.grayscale(region)
    gray.resize((320,round(gray.height*320/gray.width)),Image.Resampling.LANCZOS).save(ROOT/"qa"/"map-value-320.png")
svg_report=[]
for p in sorted((ROOT/"ui").glob("*.svg")):
    r=ET.parse(p).getroot()
    controls=[e for e in r.iter() if e.get("data-hit")=="true"]
    for e in controls:
        need(float(e.get("width"))>=44 and float(e.get("height"))>=44,"Too-small control in "+p.name)
    texts=[e for e in r.iter() if e.tag.endswith("}text")]
    need(len(texts)>10,"UI must contain editable live text: "+p.name)
    svg_report.append({"file":p.name,"width":r.get("width"),"height":r.get("height"),"editableTextNodes":len(texts),"controlTargets":len(controls)})
links=0
for p in ROOT.glob("*.md"):
    for dest in re.findall(r"\]\(([^)]+)\)",p.read_text()):
        if re.match(r"^[a-zA-Z][\w+.-]*:",dest) or dest.startswith("#"):continue
        target=dest.split("#")[0]
        resolved=(p.parent/target).resolve()
        # This report is written at the end of the same run, including a clean checkout.
        report_target=ROOT/"qa"/"delivery-report.json"
        need(resolved.exists() or resolved==report_target,f"Broken local link {p.name}: {dest}")
        links+=1
prov=load("provenance.json")
for item in prov["items"]:
    dst=ROOT/item["target"]
    need(dst.exists(),"Missing provenance target "+item["target"])
    # Default-generation absolute paths are useful locally, never required for portability.
    item["sha256"]=hashlib.sha256(dst.read_bytes()).hexdigest()
(ROOT/"provenance.json").write_text(json.dumps(prov,ensure_ascii=False,indent=2)+"\n")
report={"status":"pass" if not errors else "fail","contrastPairs":contrasts,"resolvedObjectCards":len(assets),"materialFamilies":len(families),"boards":images,"svg":svg_report,"localLinksChecked":links,"errors":errors,"limits":["Automated checks do not prove artistic quality or runtime performance.","SVG target checks use native viewBox units; browser report separately checks actual samples at 1:1."]}
(ROOT/"qa"/"delivery-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
