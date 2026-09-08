import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
for name in ['L0_FLOOR','L1_FLOOR','L0_FRONT_low','L1_FRONT_high']:
 o=bpy.data.objects[name]
 for index,m in enumerate(o.data.materials):
  ps=[p for p in o.data.polygons if p.material_index==index]
  if not ps:continue
  lis=[li for p in ps for li in p.loop_indices]
  area=sum(p.area for p in ps)
  print(name,index,m.name,area)
  for uvname in ['MaterialUVV8','BakeV8']:
   u=o.data.uv_layers[uvname];coords=[tuple(u.data[i].uv) for i in lis]
   print(uvname,tuple(min(c[j] for c in coords) for j in range(2)),tuple(max(c[j] for c in coords) for j in range(2)),len(set(coords)))
  for p in ps[:2]:print('poly',p.index,p.area,list(p.loop_indices),[tuple(o.data.uv_layers['BakeV8'].data[i].uv) for i in p.loop_indices])
