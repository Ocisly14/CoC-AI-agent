"""Keep the v1 mesh untouched; add building-scale UVs and unlit painting guides."""
import bpy, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent/'shell-v1/bluebird_shell_textured.blend'))
scene=bpy.context.scene
arch=[o for o in bpy.data.objects if o.get('architecture')]
def signature(o):
    return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world))).encode()).hexdigest()
baseline={o.name:signature(o) for o in arch}
rects={'ground':{'front':(.02,.64,.48,.98),'right':(.52,.64,.98,.98),'rear':(.02,.24,.48,.58),'left':(.52,.24,.98,.58),'corner':(.02,.02,.20,.18)},
       'upper':{'front':(.02,.52,.48,.98),'right':(.52,.52,.98,.98),'rear':(.02,.02,.48,.48),'left':(.52,.02,.98,.48)},
       'roof':{'low':(.02,.02,.58,.98),'upper':(.62,.52,.98,.98),'awning':(.62,.02,.98,.48)}}
def category(o,m):
    if m.name.startswith(('BB_OIL_01','BB_OIL_02')) and o.get('role')=='wall' and o.get('side') in ['front','right','rear','left','corner']:
        return 'upper' if o.get('floor')==1 else 'ground'
    if m.name.startswith(('BB_OIL_04','BB_OIL_05')):return 'roof'
def uv(o,co,cat):
    x,y,z=co
    if cat=='ground':
        side=o['side'];a,b={'front':(x/10.7,z/3.4),'right':((y-1.3)/8.7,z/3.4),'rear':((12-x)/12,z/3.4),'left':((10-y)/10,z/3.4),'corner':((x-10.7+y)/2.6,z/3.4)}[side]
    elif cat=='upper':
        side=o['side'];a,b={'front':(x/6,(z-3.2)/2.8),'right':((y-4)/6,(z-3.2)/2.8),'rear':((6-x)/6,(z-3.2)/2.8),'left':((10-y)/6,(z-3.2)/2.8)}[side]
    else:
        if o.get('role')=='canopy':
            side='awning';vs=o.data.vertices
            bounds=[(min(v.co[i] for v in vs),max(v.co[i] for v in vs)) for i in (0,1)]
            a=(x-bounds[0][0])/(bounds[0][1]-bounds[0][0]);b=(y-bounds[1][0])/(bounds[1][1]-bounds[1][0])
        elif o.get('floor')==1:side='upper';a=x/6;b=(y-4)/6
        else:side='low';a=x/12;b=y/10
    u0,v0,u1,v1=rects[cat][side]
    return (u0+max(0,min(1,a))*(u1-u0),v0+max(0,min(1,b))*(v1-v0))
modified={};members={c:[] for c in rects}
for o in arch:
    paint=o.data.uv_layers.new(name='PaintUV');bake=o.data.uv_layers.new(name='BakeUV')
    for i,slot in enumerate(o.material_slots):
        old=slot.material;cat=category(o,old)
        if not cat:continue
        key=(cat,old.name)
        if key not in modified:
            m=old.copy();m.name='PAINT_'+cat+'_'+old.name;m['paint_category']=cat;m['source_material']=old.name
            nt=m.node_tree;uvnode=nt.nodes.new('ShaderNodeUVMap');uvnode.uv_map='UVMap';uvnode.location=(-800,0)
            for n in list(nt.nodes):
                if n.type=='TEX_IMAGE':nt.links.new(uvnode.outputs['UV'],n.inputs['Vector'])
            modified[key]=m
        slot.material=modified[key]
        if o not in members[cat]:members[cat].append(o)
        for p in o.data.polygons:
            if p.material_index==i:
                for li in p.loop_indices:
                    coord=uv(o,o.data.vertices[o.data.loops[li].vertex_index].co,cat)
                    paint.data[li].uv=coord;bake.data[li].uv=coord
    # Non-painted polygons keep their existing sampling coordinates on every channel.
    for p in o.data.polygons:
        if not o.data.materials[p.material_index].get('paint_category'):
            for li in p.loop_indices:
                paint.data[li].uv=o.data.uv_layers['UVMap'].data[li].uv
                bake.data[li].uv=o.data.uv_layers['UVMap'].data[li].uv
    o.data.uv_layers.active=bake;bake.active_render=True
scene.render.engine='CYCLES';scene.cycles.samples=1
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
scene.render.bake.margin=8
# Bake only painted polygons on temporary copies: interior polygons share UVMap and must not overwrite charts.
for cat,objs in members.items():
    image=bpy.data.images.new('GUIDE_'+cat,width=1536,height=1536,alpha=False);image.colorspace_settings.name='sRGB'
    copies=[]
    import bmesh
    for original in objs:
        o=original.copy();o.data=original.data.copy();scene.collection.objects.link(o);copies.append(o)
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if o.data.materials[f.material_index].get('paint_category')!=cat],context='FACES')
        bm.to_mesh(o.data);bm.free()
        for m in o.data.materials:
            nt=m.node_tree;n=nt.nodes.new('ShaderNodeTexImage');n.name='BAKE_TARGET';n.image=image;nt.nodes.active=n
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.bake(type='DIFFUSE',use_clear=True)
    image.filepath_raw=str(ROOT/'atlases'/f'{cat}-unlit-guide.png');image.file_format='PNG';image.save()
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in list(m.node_tree.nodes):
                if n.name.startswith('BAKE_TARGET'):m.node_tree.nodes.remove(n)
    bpy.data.images.remove(image)
assert baseline=={o.name:signature(o) for o in arch}
(ROOT/'source/uv-layout.json').write_text(json.dumps({'rectangles_uv_bottom_left':rects,'geometry_sha256':baseline,'layer_order':['repaint','weather','brush'],'note':'UVMap original; PaintUV continuous facade color; BakeUV same charts for exported color. Thin board ledges deliberately sample adjoining paint row.'},indent=2))
scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source/uv-prepared.blend'))
print('UV_GUIDES_READY',flush=True)
