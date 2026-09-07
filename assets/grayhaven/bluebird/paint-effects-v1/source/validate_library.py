import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'irregular-pigment-library.blend'))
manifest=json.loads((ROOT/'manifest.json').read_text())
checks={}
checks['sixteen_callable_groups']=len(manifest['groups'])==16 and all(x['id'] in bpy.data.node_groups for x in manifest['groups'])
images=[i for i in bpy.data.images if i.source=='FILE']
checks['four_packed_source_atlases']=len(images)==4 and all(i.packed_file for i in images)
checks['original_resolution_preserved']=all(tuple(i.size)==(1254,1254) for i in images)
checks['preview_exists']=(ROOT/'material-preview.png').is_file()
checks['base_color_and_mask_outputs']=all({'Color','Mask'}.issubset({s.name for s in bpy.data.node_groups[x['id']].interface.items_tree if s.item_type=='SOCKET' and s.in_out=='OUTPUT'}) for x in manifest['groups'])
checks['only_material_demo_meshes']=len([o for o in bpy.context.scene.objects if o.type=='MESH'])==16 and all(o.name.endswith('_Swatch') for o in bpy.context.scene.objects if o.type=='MESH')
result={'checks':checks,'visualReview':'All 16 stamps readable in actual Cycles render; base visible in margins and internal gaps; no black atlas rectangles visible. Source images also inspected.','notTested':['application on restaurant','Three.js runtime']}
(ROOT/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
assert all(checks.values()),checks
print(json.dumps(result,ensure_ascii=False))
