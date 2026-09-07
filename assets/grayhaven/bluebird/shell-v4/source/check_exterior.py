"""Check saved/exported assets against the prior approved building."""
import bpy,json,hashlib,math,struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
def signature(o):
    return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world),[(u.name,[tuple(e.uv) for e in u.data]) for u in o.data.uv_layers],[m.name for m in o.data.materials])).encode()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent/'shell-v3/bluebird_shell_textured.blend'))
base={o.name:signature(o) for o in bpy.data.objects if o.get('architecture')}
images={i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_exterior_detailed.blend'))
checks=[]
def check(name,ok,detail):checks.append(dict(check=name,passed=bool(ok),detail=detail))
arch=[o for o in bpy.data.objects if o.get('architecture')]
new=[o for o in arch if o.get('exteriorDetail')]
check('approved_shell_geometry_uv_and_material_assignments_unchanged',all(n in bpy.data.objects and signature(bpy.data.objects[n])==s for n,s in base.items()),len(base))
check('approved_base_texture_bytes_unchanged',all(hashlib.sha256(bpy.data.images[n].packed_file.data).hexdigest()==s for n,s in images.items()),list(images))
check('only_fixed_architectural_details',all(not o.get('itemId') and not o.get('semanticId') and o.get('assetScope')=='architecture_only' for o in new),len(new))
check('no_invalid_vertices',all(math.isfinite(c) for o in new for v in o.data.vertices for c in v.co),len(new))
check('joinery_has_uvs',all(o.data.uv_layers for o in new if not o.get('lettering')),len(new))
check('front_detail_cutaway',all(o.get('band')=='high' for o in new if o.get('side') in ['front','right','corner']), 'Same front/right wall removal boundary as base shell')
check('typography_exact',sorted(o.get('lettering') for o in new if o.get('lettering'))==sorted(['BLUEBIRD','DINER']+list('EATS')*2), 'Separate planar painted letter meshes')
check('editable_type_source_hidden',all(o.hide_render and not o.get('architecture') for o in bpy.data.collections['SOURCE · Editable sign typography'].objects),10)
# Test actual world-space meshes across the center of retained window apertures.
blockers=[o for o in new if o.get('role')!='glass']
def hits(p,d,distance):
    result=[]
    for o in blockers:
        inv=o.matrix_world.inverted();v=inv.to_3x3()@Vector(d)
        hit,_,_,_=o.ray_cast(inv@Vector(p),v.normalized(),distance=distance*v.length)
        if hit:result.append(o.name)
    return result
rays=[((3.5,-.5,1.8),(0,1,0),.7),((8,-.5,1.8),(0,1,0),.7),((12.7,3.1,1.8),(-1,0,0),.9),((12.7,6.05,1.9),(-1,0,0),.9),((1.3,3.5,4.7),(0,1,0),.7)]
obstructions=[{'at':p,'objects':hits(p,d,l)} for p,d,l in rays]
check('window_centers_unobstructed',all(not r['objects'] for r in obstructions),obstructions)
for filename,expected in [('bluebird_exterior_details.glb',new),('bluebird_exterior_detailed.glb',arch)]:
    raw=(ROOT/filename).read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n])
    triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
    check(filename+'_self_contained',all('uri' not in b for b in g['buffers']) and all('bufferView' in i for i in g['images']),len(raw))
    check(filename+'_triangle_count',triangles==sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in expected),triangles)
    check(filename+'_no_source_objects',not any(n.get('name','').startswith('SOURCE_') for n in g['nodes']),len(g['nodes']))
report={'passed':all(c['passed'] for c in checks),'checks':checks,'scope':'Saved geometry, UV preservation, texture preservation, window rays and export structure. Artistic appearance evaluated from rendered images.'}
(ROOT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Exterior validation failed')
