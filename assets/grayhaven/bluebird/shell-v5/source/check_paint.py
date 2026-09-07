"""Compare delivered geometry and UV sampling against v4; quantify sampled surface changes."""
import bpy,json,hashlib,struct,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def signature(o):
    return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world),[(u.name,[tuple(v.uv) for v in u.data]) for u in o.data.uv_layers],[m.name for m in o.data.materials])).encode()).hexdigest()
def packed():return {i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
def pixels(im):
    a=np.empty(len(im.pixels),np.float32);im.pixels.foreach_get(a);return a.reshape((im.size[1],im.size[0],4))
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent/'shell-v4/bluebird_exterior_detailed.blend'))
baseline={o.name:signature(o) for o in bpy.data.objects if o.get('architecture')};basefiles=packed()
old={cat:pixels(bpy.data.images['BAKED_'+cat]) for cat in ['ground','upper']}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
arch=[o for o in bpy.data.objects if o.get('architecture')];checks=[]
def check(name,ok,detail):checks.append(dict(check=name,passed=bool(ok),detail=detail))
check('all_v4_geometry_uv_material_slots_preserved',baseline=={o.name:signature(o) for o in arch},len(arch))
check('unmodified_roof_joinery_interior_images_preserved',all(packed().get(n)==h for n,h in basefiles.items() if n not in ['BAKED_ground','BAKED_upper']), 'Only the two edited wall atlases are replaced in delivery')
coverage={}
for cat in ['ground','upper']:
    im=bpy.data.images['V5_BAKED_'+cat];new=pixels(im);areas={}
    check(cat+'_4k_packed_atlas',list(im.size)==[4096,4096] and bool(im.packed_file),list(im.size))
    for o in arch:
        if not any(m and m.get('paint_category')==cat for m in o.data.materials):continue
        layer=o.data.uv_layers['BakeUV'];key=o.get('side');stats=areas.setdefault(key,[0,0,0])
        for p in o.data.polygons:
            if o.data.materials[p.material_index].get('paint_category')!=cat:continue
            uv=np.mean([tuple(layer.data[i].uv) for i in p.loop_indices],axis=0)
            x,y=np.clip((uv*4096).astype(int),0,4095);change=float(np.max(np.abs(new[y,x,:3]-old[cat][y,x,:3])))
            stats[0]+=p.area;stats[1]+=p.area*(change>.025);stats[2]+=p.area*change
    coverage[cat]={k:{'sampledChangedAreaPercent':round(100*v[1]/v[0],2),'meanLinearRGBChange':round(v[2]/v[0],4)} for k,v in areas.items()}
    check(cat+'_visible_local_change',any(v['sampledChangedAreaPercent']>8 for v in coverage[cat].values()),coverage[cat])
raw=(ROOT/'bluebird_painterly.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];gl=json.loads(raw[20:20+n])
triangles=sum(gl['accessors'][p['indices']]['count']//3 for m in gl['meshes'] for p in m['primitives'])
check('triangle_count_preserved',triangles==56034,triangles)
check('export_self_contained',all('uri' not in b for b in gl['buffers']) and all('bufferView' in i for i in gl['images']),len(raw))
check('no_runtime_overlay_geometry',not any(n.get('name','').startswith('V5') for n in gl['nodes']),len(gl['nodes']))
for new,oldfile in [('white-edge-brush.png','ground-brush.png'),('white-foot-weather.png','ground-weather.png')]:
    check(new+'_reuses_previous_white_mask',(ROOT/'layers'/new).read_bytes()==(ROOT.parent/'shell-v2/layers'/oldfile).read_bytes(),oldfile)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly_layered.blend'))
check('all_original_images_preserved_in_editable_source',all(packed().get(n)==h for n,h in basefiles.items()),len(basefiles))
check('editable_large_and_ivory_layers',all(any(x.label.startswith('PIGMENT') for x in m.node_tree.nodes) and any(x.label.startswith('IVORY EDGE') for x in m.node_tree.nodes) for m in bpy.data.materials if m.get('paint_category') in ['ground','upper']), 'Separate labelled image and mix nodes; original base input retained')
report={'passed':all(c['passed'] for c in checks),'checks':checks,'surfaceSampling':coverage,'samplingNote':'Polygon-center samples weighted by actual painted polygon area, threshold 0.025 max linear RGB channel; approximate visible change, not exact authored support coverage.'}
(ROOT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False),flush=True)
if not report['passed']:raise RuntimeError('Paint validation failed')
