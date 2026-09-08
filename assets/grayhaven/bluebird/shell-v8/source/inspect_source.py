import bpy,json
from pathlib import Path
base=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(base/'shell-v4/bluebird_exterior_detailed.blend'))
arch=[o for o in bpy.context.scene.objects if o.get('architecture')]
result={'objects':[],'materials':[]}
for o in arch:
    result['objects'].append({'name':o.name,'dims':list(o.dimensions),'location':list(o.location),'props':dict(o.items()),'uv':[u.name for u in o.data.uv_layers],'materials':[m.name for m in o.data.materials]})
for m in {m for o in arch for m in o.data.materials}:
    result['materials'].append({'name':m.name,'props':dict(m.items()),'nodes':[{'name':n.name,'type':n.type,'image':n.image.name if n.type=='TEX_IMAGE' and n.image else None,'filepath':n.image.filepath if n.type=='TEX_IMAGE' and n.image else None,'uv':n.uv_map if n.type=='UVMAP' else None} for n in m.node_tree.nodes] if m.use_nodes else []})
(base/'shell-v8/source/source-inventory.json').write_text(json.dumps(result,indent=2,default=str))
print('INVENTORY',len(arch),len(result['materials']))
