"""Area-weighted sampling of bounded paint support on actual exterior triangles."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_shell_layered.blend'))
rects=json.loads((ROOT/'source/uv-layout.json').read_text())['rectangles_uv_bottom_left']
regions=json.loads((ROOT/'source/local-regions.json').read_text())['regions']
ellipses={c:[] for c in regions}
for c,sides in regions.items():
    for side,patches in sides.items():
        u0,v0,u1,v1=rects[c][side]
        for x,y,rx,ry in patches:ellipses[c].append((u0+x*(u1-u0),v0+y*(v1-v0),rx*(u1-u0),ry*(v1-v0)))
totals={c:{'area':0,'selectedArea':0,'supportIntegral':0} for c in regions}
for o in bpy.data.objects:
    if not o.get('architecture'):continue
    o.data.calc_loop_triangles();uv=o.data.uv_layers['PaintUV']
    for t in o.data.loop_triangles:
        mat=o.data.materials[t.material_index];cat=mat.get('paint_category')
        if not cat or t.area<1e-8:continue
        coords=[uv.data[i].uv.copy() for i in t.loops]
        values=[]
        for i in range(8):
            for j in range(8-i):
                a=(i+1/3)/8;b=(j+1/3)/8
                p=coords[0]*a+coords[1]*b+coords[2]*(1-a-b)
                support=0
                for x,y,rx,ry in ellipses[cat]:
                    d=math.hypot((p.x-x)/rx,(p.y-y)/ry)
                    f=max(0,min(1,(d-.5)/.5));support=max(support,1-f*f*(3-2*f))
                values.append(support)
        r=totals[cat];r['area']+=t.area;r['selectedArea']+=t.area*sum(v>1e-7 for v in values)/len(values);r['supportIntegral']+=t.area*sum(values)/len(values)
report={}
for c,r in totals.items():
    report[c]={'sampledSelectedPercent':round(100*r['selectedArea']/r['area'],2),'sampledUnselectedPercent':round(100*(1-r['selectedArea']/r['area']),2),'meanPlacementWeight':round(r['supportIntegral']/r['area'],4)}
checks={}
for m in bpy.data.materials:
    if m.get('paint_category'):
        checks[m.name]=all(m.node_tree.nodes.get(x) for x in ['LOCAL_REPAINT_FACTOR','LOCAL_WEATHER_FACTOR','LOCAL_BRUSH_FACTOR','PLACEMENT_SUPPORT'])
out={'areaWeightedSamples':report,'allLayersBounded':all(checks.values()),'note':'Conservative placement support, before finer brush masks. Zero outside all selected regions. Percentage is a sampled estimate, not image-pixel area.'}
(ROOT/'selective-coverage.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out,ensure_ascii=False),flush=True)
assert all(checks.values()) and all(v['sampledSelectedPercent']<40 for v in report.values())
