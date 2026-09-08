import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
report={}
for name in ['L0_FLOOR','L1_FLOOR','L0_FRONT_low','L1_FRONT_high']:
 o=bpy.data.objects[name];values=[]
 for p in o.data.polygons:
  m=o.data.materials[p.material_index]
  if not m.get('v8_family') or p.area<.03:continue
  tx=m.node_tree.nodes.get('V8_DELIVERY_COLOR')
  if tx is None:continue
  uv=[o.data.uv_layers['BakeV8'].data[li].uv for li in p.loop_indices]
  area=abs(sum(uv[i].x*uv[(i+1)%len(uv)].y-uv[(i+1)%len(uv)].x*uv[i].y for i in range(len(uv))))/2
  values.append(math.sqrt(area/p.area)*tx.image.size[0])
 report[name]={'minimumPixelsPerMeter':min(values),'maximumPixelsPerMeter':max(values),'faceCount':len(values)}
print(json.dumps(report),flush=True)
(ROOT/'source/texel-density.json').write_text(json.dumps(report,indent=2))
