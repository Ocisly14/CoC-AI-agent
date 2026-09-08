"""Blender 5.x: build base first; --paint adds independent authored pigment nodes.
Run: Blender --background --python this_file.py [-- --paint]
"""
import bpy, math, json, sys, numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
PAINT = '--paint' in sys.argv
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'
scene.render.resolution_x = 900; scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.46,.51,.57,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
parts = []

def rgb(h):
    c = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)

def material(name, color, rough=.8, metallic=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=rgb(color)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metallic
    return m

iron=material('01 Cast iron • natural aged paint','525c54',.84)
glass=material('02 Wavy grey glass • unpainted','9caea0',.27)
glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.24
glass.surface_render_method='DITHERED'
bulb=material('03 Porcelain bulb • day unlit','d9cbb0',.38)
bolt=material('04 Oxidised bolt heads','55554c',.62,.55)
anchor=bpy.data.objects.new('Lamp local paint coordinates',None);scene.collection.objects.link(anchor)
n=iron.node_tree.nodes;l=iron.node_tree.links
coords=n.new('ShaderNodeTexCoord');coords.object=anchor;coords.label='Stable shared metre coordinates'
scale=n.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/.6
l.new(coords.outputs['Object'],scale.inputs[0])
base=n.new('ShaderNodeTexImage');base.name='Original basic texture';base.label='0.60 × 0.60 m • retained natural wear'
base.image=bpy.data.images.load(str(ROOT/'textures/cast-iron-base.png'));base.projection='BOX';base.projection_blend=.18
l.new(scale.outputs[0],base.inputs['Vector'])
color_output=base.outputs['Color']
stamps=[]
mask_outputs=[]
if PAINT:
    pigment=bpy.data.images.load(str(ROOT/'textures/quiet-pigment.png'))
    pixels=np.array(pigment.pixels[:],dtype=np.float32).reshape(-1,4)
    assert pigment.channels==4 and pixels[:,3].min()==0 and pixels[:,3].max()==1, 'Pigment requires genuine transparent background'
    assert np.mean(pixels[:,3]==0)>.35, 'Pigment needs empty surround, not baked checkerboard'
    # Shared local projections deliberately cross collars/ribs; glass is excluded.
    stamps=[
      dict(name='Lower pedestal cool scumble',center=[0,-.12,.42],size=[.25,.30],angle=-23,tint='697871',strength=.72,plane='XZ',depth=.20),
      dict(name='Upper shaft broken drag',center=[0,-.04,2.41],size=[.11,.31],angle=13,tint='657068',strength=.64,plane='XZ',depth=.11),
      dict(name='Lantern collar violet grey',center=[.10,-.22,2.92],size=[.21,.095],angle=-14,tint='6a6d70',strength=.66,plane='XZ',depth=.16),
      dict(name='Roof muted green scumble',center=[-.09,-.10,3.64],size=[.29,.23],angle=27,tint='747b6d',strength=.72,plane='XY',depth=.30),
    ]
    for st in stamps:
        frame=n.new('NodeFrame');frame.label=st['name']+' • local metres';frame.name=st['name']
        sub=n.new('ShaderNodeVectorMath');sub.operation='SUBTRACT';sub.inputs[1].default_value=st['center'];l.new(coords.outputs['Object'],sub.inputs[0])
        angle=math.radians(st['angle']);u=Vector((math.cos(angle),0,math.sin(angle)));v=Vector((-math.sin(angle),0,math.cos(angle)))
        if st['plane']=='XY':u=Vector((math.cos(angle),math.sin(angle),0));v=Vector((-math.sin(angle),math.cos(angle),0))
        combine=n.new('ShaderNodeCombineXYZ')
        for index,axis in enumerate([u/st['size'][0],v/st['size'][1]]):
            dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=axis;l.new(sub.outputs[0],dot.inputs[0])
            add=n.new('ShaderNodeMath');add.operation='ADD';add.inputs[1].default_value=.5;l.new(dot.outputs['Value'],add.inputs[0]);l.new(add.outputs[0],combine.inputs[index]);dot.parent=frame;add.parent=frame
        tex=n.new('ShaderNodeTexImage');tex.image=pigment;tex.extension='CLIP';l.new(combine.outputs[0],tex.inputs[0])
        sep=n.new('ShaderNodeSeparateXYZ');l.new(sub.outputs[0],sep.inputs[0])
        absolute=n.new('ShaderNodeMath');absolute.operation='ABSOLUTE';l.new(sep.outputs['Z' if st['plane']=='XY' else 'Y'],absolute.inputs[0])
        depth=n.new('ShaderNodeMath');depth.operation='LESS_THAN';depth.inputs[1].default_value=st['depth'];l.new(absolute.outputs[0],depth.inputs[0])
        mask=n.new('ShaderNodeMath');mask.operation='MULTIPLY';l.new(tex.outputs['Alpha'],mask.inputs[0]);l.new(depth.outputs[0],mask.inputs[1])
        strength=n.new('ShaderNodeMath');strength.operation='MULTIPLY';strength.inputs[1].default_value=st['strength'];strength.name=st['name']+' strength';l.new(mask.outputs[0],strength.inputs[0])
        mask_outputs.append(strength.outputs[0])
        mix=n.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.inputs[2].default_value=rgb(st['tint']);l.new(color_output,mix.inputs[1]);l.new(strength.outputs[0],mix.inputs[0]);color_output=mix.outputs[0]
        for node in [sub,combine,tex,sep,absolute,depth,mask,strength,mix]:node.parent=frame
    control=n.new('ShaderNodeValue');control.name='Oil overlay enabled';control.label='0 = complete original base / 1 = four authored marks';control.outputs[0].default_value=1
    total=n.new('ShaderNodeMixRGB');l.new(control.outputs[0],total.inputs[0]);l.new(base.outputs['Color'],total.inputs[1]);l.new(color_output,total.inputs[2]);color_output=total.outputs[0]
l.new(color_output,n['Principled BSDF'].inputs['Base Color'])

def finish(o,name,mat=iron,bevel=0):
    o.name=name;o.data.materials.clear();o.data.materials.append(mat);parts.append(o)
    if bevel:
        mod=o.modifiers.new('Real edge radii','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def box(name,loc,size,mat=iron,bevel=.006):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel)

def revolve(name,profile,segments=48,flutes=0):
    verts=[];faces=[]
    for r,z in profile:
        for i in range(segments):
            a=i*math.tau/segments;rr=r+(flutes*(.5+.5*math.cos(12*a)) if r>.03 else 0)
            verts.append((rr*math.cos(a),rr*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
    faces += [tuple(reversed(range(segments))),tuple((len(profile)-1)*segments+i for i in range(segments))]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
    for p in mesh.polygons:p.use_smooth=True
    return finish(o,name)

def bar(name,a,b,r=.012,mat=iron):
    a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return finish(o,name,mat,.002)

def pane(name,verts,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);finish(o,name,mat)
    mod=o.modifiers.new('Glass thickness 3mm','SOLIDIFY');mod.thickness=.003;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

box('Anchor flange',(0,0,.045),(.48,.48,.09),bevel=.025)
revolve('Cast pedestal',[(.19,.08),(.20,.12),(.18,.16),(.145,.20),(.13,.55),(.11,.64),(.08,.72)])
revolve('Twelve fluted shaft',[(.078,.66),(.076,.74),(.065,1.4),(.052,2.55),(.054,2.70)],72,.004)
for z,r in [(.20,.154),(.59,.135),(.70,.091),(2.57,.070),(2.68,.073)]:
    revolve('Cast collar %.2f'%z,[(r-.007,z-.027),(r,z-.016),(r,z+.016),(r-.007,z+.027)])
box('Inspection cover',(0,-.132,.37),(.092,.025,.19),bevel=.015)
for z in [.30,.44]:bar('Cover screw',(0,-.15,z),(0,-.16,z),.008,bolt)
for x in [-.175,.175]:
    for y in [-.175,.175]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=.022,depth=.026,location=(x,y,.103));finish(bpy.context.object,'Anchor hex bolt',bolt,.002)
# Restrained raised leaf casting on the pedestal, connected to its surface.
for i in range(8):
    a=i*math.tau/8
    if i==6:continue  # inspection-cover face stays legible
    vs=[]
    for t,width in [(0,.004),(.22,.040),(.55,.032),(.8,.020),(1,0.002)]:
        z=.22+t*.30;r=.145-t*.019
        for offset in [-width,0,width]:
            aa=a+offset/r;rr=r+(.012*math.sin(math.pi*t) if offset==0 else .003)
            vs.append((rr*math.cos(aa),rr*math.sin(aa),z))
    fs=[]
    for j in range(4):
        for k in range(2):q=j*3+k;fs.append((q,q+1,q+4,q+3))
    me=bpy.data.meshes.new('Leaf');me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new('Cast leaf relief %d'%i,me);scene.collection.objects.link(ob);finish(ob,ob.name)
revolve('Lantern support cup',[(.06,2.68),(.065,2.75),(.11,2.82),(.21,2.88),(.22,2.90)])
box('Lower lantern rim',(0,0,2.91),(.46,.46,.055),bevel=.012)
box('Upper lantern rim',(0,0,3.55),(.61,.61,.060),bevel=.012)
for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]:
    bar('Lantern corner stile',(x*.205,y*.205,2.94),(x*.276,y*.276,3.52),.015)
for i in range(4):
    a=i*math.pi/2
    def turn(x,y,z):return (x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),z)
    pane('Glass pane %d'%i,[turn(-.19,-.206,2.947),turn(.19,-.206,2.947),turn(.263,-.277,3.519),turn(-.263,-.277,3.519)],glass)
    bar('Pane lower rail',turn(-.215,-.225,3.08),turn(.215,-.225,3.08),.008)
    bar('Pane center mullion',turn(0,-.211,2.95),turn(0,-.275,3.52),.008)
    # Hip roof facets and raised folding seams.
    pane('Hipped hood facet %d'%i,[turn(-.335,-.335,3.57),turn(.335,-.335,3.57),turn(.063,-.063,3.75),turn(-.063,-.063,3.75)],iron)
    bar('Hood folded ridge',turn(-.332,-.332,3.575),turn(-.063,-.063,3.754),.006)
revolve('Finial',[(.045,3.74),(.05,3.77),(.025,3.79),(.031,3.83),(.022,3.87),(.003,3.92)],32)
bar('Bulb socket',(0,0,3.47),(0,0,3.52),.036,bolt)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=(0,0,3.34));o=bpy.context.object;o.scale=(.052,.052,.105);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,'Lamp bulb',bulb)

# Keep each construction component editable in a hidden source collection.
construction=bpy.data.collections.new('Construction • individual cast parts');scene.collection.children.link(construction)
for o in list(parts):
    d=o.copy();d.data=o.data.copy();construction.objects.link(d)
construction.hide_render=True;construction.hide_viewport=True
metal=[o for o in parts if o.data.materials[0]==iron]
bpy.ops.object.select_all(action='DESELECT')
for o in metal:o.select_set(True)
bpy.context.view_layer.objects.active=metal[0];bpy.ops.object.join();metal=bpy.context.object;metal.name='CastIron'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
metal.data.materials.clear();metal.data.materials.append(iron)
for p in metal.data.polygons:p.material_index=0
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.016,area_weight=1.0);bpy.ops.object.mode_set(mode='OBJECT')
metal.data.uv_layers.active.name='DeliveryUV'
# References to joined objects can be invalid: use visible scene meshes instead.
parts=[o for o in scene.objects if o.type=='MESH' and o.name not in construction.objects]

cam=bpy.data.objects.new('Preview camera',bpy.data.cameras.new('Preview camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO'
ld=bpy.data.lights.new('Neutral studio key','AREA');lo=bpy.data.objects.new('Neutral studio key',ld);scene.collection.objects.link(lo);lo.location=(3,-4,6);ld.energy=700;ld.size=4;lo.rotation_euler=(Vector((0,0,2))-lo.location).to_track_quat('-Z','Y').to_euler()
floor=box('Preview floor',(0,0,-.075),(200,200,.10),material('Preview warm grey','aaa99a'),0);parts.remove(floor)

def render(name,pos,target,scale):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
    scene.render.filepath=str(ROOT/'previews'/name);bpy.ops.render.render(write_still=True)

def bake_color(name,output,is_data=False):
    im=bpy.data.images.new(name,width=2048,height=2048,alpha=False)
    im.colorspace_settings.name='Non-Color' if is_data else 'sRGB'
    target=n.new('ShaderNodeTexImage');target.image=im;n.active=target
    emission=n.new('ShaderNodeEmission');l.new(output,emission.inputs[0]);l.new(emission.outputs[0],n['Material Output'].inputs['Surface'])
    bpy.ops.object.select_all(action='DESELECT');metal.select_set(True);bpy.context.view_layer.objects.active=metal
    scene.render.bake.margin=12;scene.cycles.samples=1;bpy.ops.object.bake(type='EMIT')
    im.filepath_raw=str(ROOT/'textures'/name);im.file_format='PNG';im.save()
    l.new(n['Principled BSDF'].outputs[0],n['Material Output'].inputs['Surface']);n.remove(emission);n.remove(target);scene.cycles.samples=24
    return im

if not PAINT:
    original=[(o,list(o.data.materials)) for o in parts]
    clay=material('Neutral clay','a4a59d')
    for o,_ in original:
        o.data.materials.clear();o.data.materials.append(clay)
    for name,pos,tar,sc in [('01-white-front.png',(0,-9,1.96),(0,0,1.96),4.45),('02-white-side.png',(9,0,1.96),(0,0,1.96),4.45),('03-white-top.png',(0,-.001,9),(0,0,0),.9)]:render(name,pos,tar,sc)
    for o,mats in original:
        o.data.materials.clear()
        for m in mats:o.data.materials.append(m)
    baked=bake_color('iron-base-atlas.png',base.outputs['Color'])
    render('04-base-full.png',(5,-8,4.0),(0,0,1.96),4.45)
    render('05-base-lantern.png',(3,-5,4.1),(0,0,3.29),1.45)
else:
    baked=bake_color('iron-painted-atlas.png',color_output)
    accumulated=mask_outputs[0]
    for mask_out in mask_outputs[1:]:
        maximum=n.new('ShaderNodeMath');maximum.operation='MAXIMUM';l.new(accumulated,maximum.inputs[0]);l.new(mask_out,maximum.inputs[1]);accumulated=maximum.outputs[0]
    bake_color('oil-overlay-mask.png',accumulated,True)
    render('06-painted-full.png',(5,-8,4.0),(0,0,1.96),4.45)
    render('07-painted-lantern.png',(3,-5,4.1),(0,0,3.29),1.45)
    render('08-painted-base.png',(3,-5,1.65),(0,0,.48),1.1)
    n['Oil overlay enabled'].outputs[0].default_value=0
    render('09-base-detail.png',(3,-5,1.65),(0,0,.48),1.1)
    n['Oil overlay enabled'].outputs[0].default_value=1

cam.location=(5,-8,4);cam.rotation_euler=(Vector((0,0,1.96))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=4.45
for im in bpy.data.images:
    if im.source=='FILE':im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/('streetlamp-layered.blend' if PAINT else 'streetlamp-base.blend')))

# Standard glTF carries baked colour, never the arbitrary authoring nodes.
runtime=material('CastIron painted' if PAINT else 'CastIron base','ffffff',.84)
tx=runtime.node_tree.nodes.new('ShaderNodeTexImage');tx.image=baked
runtime.node_tree.links.new(tx.outputs['Color'],runtime.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
metal.data.materials[0]=runtime
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=metal
bpy.ops.export_scene.gltf(filepath=str(ROOT/('streetlamp-painted.glb' if PAINT else 'streetlamp-base.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
report={'heightMeters':3.92,'baseMeters':[.48,.48],'hoodWidthMeters':.67,'baseTextureCoverageMeters':[.6,.6],'painted':PAINT,'stamps':stamps,'objects':len(parts),'triangles':sum(sum(len(f.vertices)-2 for f in o.data.polygons) for o in parts),'source':'ROAD_main_street / item.main_street.street_lamp; dimensions and form are authoring assumptions','projection':'shared lamp-local coordinates, baked to DeliveryUV for runtime'}
(ROOT/'source'/('paint-manifest.json' if PAINT else 'base-manifest.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('STREETLAMP_DONE',json.dumps(report))
