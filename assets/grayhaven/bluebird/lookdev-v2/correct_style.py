"""Exterior look development, native Blender rendering; no paintover of final image.
Run against ../bluebird_diner.blend. Does not overwrite the structural source or GLB.
"""
import bpy, random, math, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent
random.seed(1985)
scene=bpy.context.scene
atlas=bpy.data.images.load(str(R/'exterior_painted_atlas.png'),check_existing=True)
atlas.colorspace_settings.name='sRGB';atlas.pack()

def srgb(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)

def paint(name,rough):
    m=bpy.data.materials.new(name);m.use_nodes=True
    n=m.node_tree.nodes;p=n.get('Principled BSDF')
    t=n.new('ShaderNodeTexImage');t.image=atlas;t.extension='EXTEND'
    m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    p.inputs['Roughness'].default_value=rough;p.inputs['Specular IOR Level'].default_value=.21
    return m
materials={'siding':paint('painted_warm_grey_v2',.91),'blue':paint('painted_faded_blue_v2',.89),
           'roof':paint('scumbled_asphalt_v2',.96),'trim':paint('weathered_grey_ivory_v2',.91)}
tiles={'siding':(0,.5),'blue':(.5,.5),'roof':(0,0),'trim':(.5,0)}
count=0
for o in list(bpy.data.objects):
    if o.type!='MESH' or not o.data.materials or o.get('role')=='shadow_proxy':continue
    col=o.users_collection[0].name
    if col not in ('01_STRUCTURE','05_ROOF','06_SITE'):continue
    key=o.data.materials[0].name.removeprefix('mat_')
    if key not in materials:continue
    # Facade is faded petrol blue; side and kitchen mass stay warm grey.
    if key=='siding' and o.get('side')=='front':key='blue'
    o.data=o.data.copy();o.data.materials.clear();o.data.materials.append(materials[key])
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    corner=tiles[key]
    coords=[v.co for v in o.data.vertices]
    dims=[max(v[k] for v in coords)-min(v[k] for v in coords) for k in range(3)]
    # Physical-density UV strips, no stretching the wood grain to individual face bounds.
    long=max(range(3),key=lambda k:dims[k]); short=sorted(range(3),key=lambda k:dims[k])[-2]
    span=max(dims[long],.01);density=8 if key!='roof' else 8
    u0=random.uniform(.03,max(.031,.94-min(span/density,.88)))
    v0=random.uniform(.04,.82)
    if key=='roof':u0=.025;v0=.025
    lows=[min(v[k] for v in coords) for k in range(3)]
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co
            if 'weatherboard_' in o.name:
                worldco=o.matrix_world @ v
                horizontal=worldco.x if o.get('side') in ('front','back') else worldco.y
                extent=7 if o.get('side') in ('front','back') else 11
                uu=.035+(horizontal/extent+.5)*.93
                vv=.035+worldco.z/6*.93
                uu=max(.025,min(.975,uu));vv=max(.025,min(.975,vv))
            else:
                axis=max(range(3),key=lambda k:abs(poly.normal[k]))
                faceaxes=[k for k in range(3) if k!=axis]
                fa=max(faceaxes,key=lambda k:dims[k]);fb=next(k for k in faceaxes if k!=fa)
                uu=min(.975,u0+(v[fa]-lows[fa])/density)
                vv=min(.975,v0+(v[fb]-lows[fb])/density)
            uv.data[li].uv=(corner[0]+uu*.5,corner[1]+vv*.5)
    for mod in o.modifiers:
        if mod.type=='BEVEL':mod.width=min(mod.width,.0035)
    # Subtle construction variation; a maintained building, not crumbling ruin.
    if 'weatherboard_' in o.name and key in ('siding','blue'):
        o.rotation_euler.z+=random.uniform(-.0006,.0006)
    count+=1
# Remove over-articulated seam battens. Roof courses use shingle edges, not raised rails.
for o in bpy.data.objects:
    if 'roof_course_' in o.name or 'kitchen_roof_seam_' in o.name:
        o.hide_render=True;o.hide_set(True)
# Small tapered roof shingle strips physically follow both slopes.
roofcol=bpy.data.collections['05_ROOF']
root=bpy.data.objects['gh_bluebird_diner_a_lod0']
for roof in [o for o in list(bpy.data.objects) if o.name.startswith('gh_bluebird_main_roof_')]:
    vs=[];faces=[];uvs=[]
    for row in range(15):
        y=-3.48+row*.46
        for col in range(7):
            x=-1.91+col*.55+(row%2)*.24
            if x>1.92:continue
            w=min(.545,1.925-x)
            if w<.05:continue
            j=len(vs);z=.071+random.uniform(0,.002)
            vs.extend([(x,y,z),(x+w,y,z+.001),(x+w,y+.455,z+.003),(x,y+.455,z+.002)])
            faces.append((j,j+1,j+2,j+3))
            u=random.uniform(.03,.87);v=random.uniform(.03,.87)
            uvs.extend([(u*.5,v*.5),((u+.08)*.5,v*.5),((u+.08)*.5,(v+.07)*.5),(u*.5,(v+.07)*.5)])
    mesh=bpy.data.meshes.new('asphalt_shingle_sheet');mesh.from_pydata(vs,[],faces);mesh.update()
    ob=bpy.data.objects.new('asphalt_shingle_sheet',mesh);roofcol.objects.link(ob);ob.matrix_world=roof.matrix_world.copy();ob.parent=root
    ob['role']='roof';ob['floor']=1;mesh.materials.append(materials['roof'])
    uv=mesh.uv_layers.new(name='UVMap')
    for i,v in enumerate(uvs):uv.data[i].uv=v
# Less mirror-like glazing. Existing openings and working interior lamps remain real geometry/light.
glass=bpy.data.materials['mat_glass'].node_tree.nodes.get('Principled BSDF')
glass.inputs['Roughness'].default_value=.28;glass.inputs['Base Color'].default_value=srgb('CCD0BD')
glass.inputs['Transmission Weight'].default_value=.96
# A single coastal afternoon sun. Front is warm; side wall falls into colored, quiet shadow.
for name in ['overcast_warm_key','cool_sky_fill']:bpy.data.objects[name].hide_render=True
ld=bpy.data.lights.new('coastal_afternoon_sun','SUN');ld.energy=2.3;ld.angle=.12;ld.color=(1,.85,.66)
lo=bpy.data.objects.new('coastal_afternoon_sun',ld);bpy.data.collections['07_RENDER_RIG'].objects.link(lo)
lo.rotation_euler=(Vector((0,0,0))-Vector((7,-10,11))).to_track_quat('-Z','Y').to_euler()
world=scene.world.node_tree.nodes['Background'];world.inputs['Color'].default_value=(.36,.45,.53,1);world.inputs['Strength'].default_value=.48
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
# Recessive background rather than a display-platform gradient.
back=bpy.data.materials['mat_backdrop'].node_tree.nodes['Principled BSDF'];back.inputs['Base Color'].default_value=srgb('666C66')
scene.camera=bpy.data.objects['01_exterior']
scene.render.resolution_x=1500;scene.render.resolution_y=1300;scene.cycles.samples=32
scene.render.filepath=str(R/'exterior-v2.png')
scene['artStatus']='Exterior look-development correction only. Original style rejected; this revision is not final art approval.'
scene['textureProvenance']='Built-in image_gen; prompt in texture-prompt.txt. Atlas is flat source, no claim of hand-painted layers.'
bpy.ops.wm.save_as_mainfile(filepath=str(R/'bluebird_exterior_v2.blend'))
print('V2_MATERIALS',count,flush=True)
bpy.ops.render.render(write_still=True)
(R/'provenance.json').write_text(json.dumps({'tool':'built-in image_gen','texture':'exterior_painted_atlas.png',
    'prompt':'texture-prompt.txt','render':'Blender Cycles; actual geometry with atlas UVs; no generated paintover',
    'scope':'Exterior material, lighting and edge calibration; not complete interior restyling or runtime integration',
    'atlasStatus':'Flat AI-generated texture source; repeat seams and mip filtering need production validation',
    'source':'../bluebird_diner.blend','revision':'bluebird_exterior_v2.blend','texturedMeshes':count},indent=2)+'\n')
