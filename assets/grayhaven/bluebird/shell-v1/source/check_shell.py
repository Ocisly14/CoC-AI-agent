"""Geometric acceptance checks on the saved shell, not the authoring constants alone."""
import bpy,json,math,struct,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_shell_textured.blend'))
checks=[]
def check(name,ok,detail):
    checks.append({'check':name,'passed':bool(ok),'detail':detail})
def hits(names,origin,direction,distance=100):
    result=[]
    for name in names:
        o=bpy.data.objects[name]
        hit,point,normal,index=o.ray_cast(Vector(origin),Vector(direction),distance=distance)
        if hit:result.append(tuple(point))
    return result

floor=bpy.data.objects['L0_FLOOR']
minv=[min(v.co[i] for v in floor.data.vertices) for i in range(3)]
maxv=[max(v.co[i] for v in floor.data.vertices) for i in range(3)]
check('ground_floor_envelope',all(abs(a-b)<1e-5 for a,b in zip(minv+maxv,[0,0,-.2,12,10,0])),{'min':minv,'max':maxv})
check('chamfer_cut_is_empty',not hits(['L0_FLOOR'],(11.8,.2,2),(0,0,-1)), 'Outside clipped corner: (11.8,0.2)')
check('entry_has_floor',bool(hits(['L0_FLOOR'],(11.25,.9,2),(0,0,-1))), 'Inside corner entry: (11.25,0.9)')
hole_points=[(5.35,6.05,4),(5.35,7.5,4),(5.35,9.25,4)]
check('upper_stair_opening',not any(hits(['L1_FLOOR'],p,(0,0,-1)) for p in hole_points),hole_points)
landings=[(5.35,5.5,4),(4.7,7.5,4),(5.95,7.5,4)]
check('slab_surrounds_opening',all(hits(['L1_FLOOR'],p,(0,0,-1)) for p in landings),landings)
stair=[]
for i in range(16):
    y=9.2-(i+.5)*.2
    h=hits(['L0_STAIR'],(5.35,y,6),(0,0,-1))
    stair.append({'tread':i+1,'y':y,'z':h[0][2] if h else None,'expected':(i+1)*.2})
check('sixteen_tread_heights',all(s['z'] is not None and abs(s['z']-s['expected'])<1e-4 for s in stair),stair)
def walls(prefix):return [o.name for o in bpy.data.objects if o.name.startswith(prefix) and o.get('role')=='wall']
check('front_window_open',not hits(walls('L0_FRONT'),(3.5,-1,1.8),(0,1,0),2),'Window ray at x=3.5, z=1.8')
check('front_pier_present',bool(hits(walls('L0_FRONT'),(.4,-1,1.8),(0,1,0),2)),'Solid wall ray at x=0.4, z=1.8')
check('corner_door_open',not hits(walls('L0_CORNER'),(12.057,-.057,1.4),(-.707,.707,0),2),'Chamfer center, no door leaf')
check('kitchen_door_open',not hits(walls('L0_KITCHEN_PARTITION'),(7.7,5,1),(0,1,0),2),'Kitchen doorway x=7.0..8.4')
check('bedroom_door_open',not hits(walls('L1_BEDROOM_RIGHT'),(4.15,6.9,4.1),(-1,0,0),2),'Bedroom doorway through east partition')
arch=[o for o in bpy.data.objects if o.get('architecture')]
check('no_prop_identities',all(not o.get('itemId') and not o.get('semanticId') for o in arch),len(arch))
check('uvs_present',all(o.data.uv_layers.get('UVMap') for o in arch),len(arch))
images=[i for i in bpy.data.images if i.source=='FILE']
check('seven_packed_srgb_textures',len(images)==7 and all(i.packed_file and i.colorspace_settings.name=='sRGB' for i in images),[i.name for i in images])
raw=(ROOT/'bluebird_shell_textured.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+length].decode().rstrip('\x00 '))
check('glb_self_contained',all('uri' not in b for b in gltf['buffers']) and all('bufferView' in i for i in gltf['images']),{'images':len(gltf['images']),'bytes':len(raw)})
report={'checks':checks,'passed':all(c['passed'] for c in checks),'blender':bpy.app.version_string,
        'scope':'architecture and UV acceptance; game runtime and final lighting not evaluated',
        'sha256':hashlib.sha256(raw).hexdigest()}
(ROOT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'checks':len(checks),'failed':[c for c in checks if not c['passed']]},ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Shell acceptance check failed')
