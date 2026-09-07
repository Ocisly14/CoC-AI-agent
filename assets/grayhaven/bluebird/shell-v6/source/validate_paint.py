import bpy,json,hashlib,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def geom(o):
    return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world))).encode()).hexdigest()
def uvs(o):return {u.name:hashlib.sha256(repr([tuple(v.uv) for v in u.data]).encode()).hexdigest() for u in o.data.uv_layers}
def images():return {i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent/'shell-v4/bluebird_exterior_detailed.blend'))
old={o.name:(geom(o),uvs(o)) for o in bpy.data.objects if o.get('architecture')};oldimages=images()
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly_layered.blend'))
arch=[o for o in bpy.data.objects if o.get('architecture')]
checks={}
checks['83_original_objects_geometry_transforms_preserved']=len(arch)==83 and {o.name:geom(o) for o in arch}=={n:g for n,(g,u) in old.items()}
checks['all_original_uv_channels_preserved']=all(all(uvs(o).get(n)==v for n,v in old[o.name][1].items()) for o in arch)
checks['all_original_packed_images_preserved']=all(images().get(n)==h for n,h in oldimages.items())
affected=[o.name for o in arch if o.get('role')=='frame' and any(m.get('v6_target')=='frames' for m in o.data.materials)]
checks['front_and_upper_frames_and_sills_painted']=all(n in affected for n in ['L0_FRONT_frames','D0_FRONT_WINDOW_JOINERY','L1_RIGHT_frames','D1_RIGHT_WINDOW_JOINERY'])
checks['glass_unmodified']=all(not any(m.get('v6_target') for m in o.data.materials) for o in arch if o.get('role')=='glass')
wall=bpy.data.objects['L0_FRONT_low'].data.materials[0]
trim=bpy.data.objects['D0_FRONT_WINDOW_JOINERY'].data.materials[0]
def projections(m):
    return [(n.node_tree.name,tuple(n.inputs['Center'].default_value),tuple(n.inputs['Size'].default_value),n.inputs['Angle'].default_value) for n in m.node_tree.nodes if n.type=='GROUP' and n.node_tree.name.startswith('PFX_')]
checks['front_wall_and_sill_identical_projection_parameters']=projections(wall)==projections(trim) and len(projections(wall))>0
checks['all_authored_marks_angled']=all(abs(p[-1])>=17 for v in json.loads((ROOT/'source/placements.json').read_text())['patches'].values() for p in v)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
checks['three_4k_packed_delivery_maps']=all('V6_BAKED_'+c in bpy.data.images and tuple(bpy.data.images['V6_BAKED_'+c].size)==(4096,4096) and bpy.data.images['V6_BAKED_'+c].packed_file for c in ['ground','upper','frames'])
raw=(ROOT/'bluebird_painterly.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];gl=json.loads(raw[20:20+length])
triangles=sum(gl['accessors'][p['indices']]['count']//3 for m in gl['meshes'] for p in m['primitives'])
checks['56034_triangles_preserved']=triangles==56034
checks['glb_self_contained']=all('uri' not in b for b in gl['buffers']) and all('bufferView' in i for i in gl['images'])
bindings=[]
for mesh in gl['meshes']:
    for primitive in mesh['primitives']:
        tex=gl['materials'][primitive['material']].get('pbrMetallicRoughness',{}).get('baseColorTexture')
        if tex:
            channel=tex.get('extensions',{}).get('KHR_texture_transform',{}).get('texCoord',tex.get('texCoord',0))
            bindings.append(f'TEXCOORD_{channel}' in primitive['attributes'])
checks['glb_basecolor_uv_bindings_present']=bool(bindings) and all(bindings)
checks={k:bool(v) for k,v in checks.items()}
report={'passed':all(checks.values()),'checks':checks,'paintedFrameObjects':affected,'triangles':triangles,'notes':'Additional bake-only UV on trim; shared facade Position projection. Browser runtime performance not tested.'}
(ROOT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False),flush=True)
assert report['passed']
