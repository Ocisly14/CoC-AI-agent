import bpy,json,hashlib,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def geom(o):return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world))).encode()).hexdigest()
def uv(o):return {u.name:hashlib.sha256(repr([tuple(d.uv) for d in u.data]).encode()).hexdigest() for u in o.data.uv_layers}
def packed():return {i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent/'shell-v6/bluebird_painterly.blend'))
old={o.name:(geom(o),uv(o),[m.name for m in o.data.materials]) for o in bpy.data.objects if o.get('architecture')};oldimages=packed()
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly_layered.blend'))
arch=[o for o in bpy.data.objects if o.get('architecture')];checks={}
checks['83_objects_geometry_preserved']=len(arch)==83 and all(geom(o)==old[o.name][0] for o in arch)
checks['existing_uv_preserved']=all(all(uv(o).get(n)==h for n,h in old[o.name][1].items()) for o in arch)
changed={'L0_LOW_ROOF','L1_ROOF','D0_KITCHEN_EXHAUST','D0_ROOF_AIR_VENT','D1_STOVE_FLUE'}
checks['non_roof_material_assignments_preserved']=all([m.name for m in o.data.materials]==old[o.name][2] for o in arch if o.name not in changed)
checks['original_packed_textures_preserved']=all(packed().get(n)==h for n,h in oldimages.items())
with bpy.data.libraries.load(str(ROOT.parent/'paint-effects-v2/tonal-pigment-library.blend'),link=False) as (src,dst):
    library_groups=[n for n in src.node_groups if n.startswith('TONE_')]
checks['12_new_tonal_groups_in_library']=len(library_groups)==12
checks['roof_retains_used_tonal_groups']=all(n in bpy.data.node_groups for n in ['TONE_01_01','TONE_01_02','TONE_01_03','TONE_01_04','TONE_02_01','TONE_02_02','TONE_02_03'])
def stamps(name):
    m=bpy.data.objects[name].data.materials[0]
    return [(n.node_tree.name,tuple(n.inputs['Center'].default_value),tuple(n.inputs['Size'].default_value),n.inputs['Angle'].default_value) for n in m.node_tree.nodes if n.type=='GROUP' and n.node_tree.name.startswith('TONE_')]
checks['roof_and_flashing_share_projection']=stamps('L0_LOW_ROOF')==stamps('D0_KITCHEN_EXHAUST') and bool(stamps('L0_LOW_ROOF'))
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
checks['new_packed_maps']=all(tuple(bpy.data.images['V7_BAKED_'+c].size)==(sz,sz) and bpy.data.images['V7_BAKED_'+c].packed_file for c,sz in [('roof',4096),('flashing',2048)])
raw=(ROOT/'bluebird_painterly.glb').read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
checks['self_contained_glb']=all('uri' not in b for b in g['buffers']) and all('bufferView' in i for i in g['images'])
checks['56034_triangles']=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])==56034
bindings=[]
for m in g['meshes']:
    for p in m['primitives']:
        t=g['materials'][p['material']].get('pbrMetallicRoughness',{}).get('baseColorTexture')
        if t:
            c=t.get('extensions',{}).get('KHR_texture_transform',{}).get('texCoord',t.get('texCoord',0));bindings.append(f'TEXCOORD_{c}' in p['attributes'])
checks['uv_bindings_valid']=all(bindings)
checks={k:bool(v) for k,v in checks.items()};report={'passed':all(checks.values()),'checks':checks,'glbBytes':len(raw),'scope':'roof and low flashing only; v6 facade retained; rendering performance not measured'}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
assert report['passed']
