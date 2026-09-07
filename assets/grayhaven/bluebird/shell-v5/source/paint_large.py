"""Artist-placed, metre-scale pigment and reused ivory edge masks on the v4 building."""
import bpy,bmesh,json,math,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent
bpy.ops.wm.open_mainfile(filepath=str(BASE/'shell-v4/bluebird_exterior_detailed.blend'))
scene=bpy.context.scene;arch=[o for o in scene.objects if o.get('architecture')]
rects=json.loads((BASE/'shell-v3/source/uv-layout.json').read_text())['rectangles_uv_bottom_left']
def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
# Each patch: facade, horizontal metres, height metres, width, height, swatch, opacity, angle.
patches={
'ground':[
 ('front',1.95,.60,2.70,.85,0,.70,-8),('front',4.8,.46,1.9,.80,3,.52,5),('front',8.05,.62,2.75,.83,4,.72,3),
 ('front',6.33,2.03,.66,1.7,2,.66,9),('front',.34,2.44,.90,1.10,0,.78,-5),
 ('right',1.6,.63,3.2,.95,2,.53,4),('right',6.91,2.16,2.65,1.94,0,.74,-8),('right',7.25,1.1,2.9,1.05,3,.53,12),('right',3.6,2.2,.68,1.35,4,.65,6),
 ('rear',2.0,.82,2.8,1.12,4,.63,-6),('rear',6.6,.66,2.9,.83,0,.69,8),('rear',9.1,2.0,1.05,1.66,2,.63,-10),
 ('left',1.9,1.90,2.8,1.9,2,.54,-7),('left',4.6,1.02,3.2,1.55,0,.63,8),('left',7.3,2.3,2.8,1.7,5,.6,-5),('left',8.8,.62,2.2,1.0,3,.60,4),
 ('corner',.20,1.74,.49,1.33,0,.52,3)],
'upper':[
 ('front',2.87,4.72,1.55,1.77,0,.84,-8),('front',1.23,3.60,2.42,.76,4,.60,4),('front',5.74,4.7,.9,1.78,2,.65,-5),
 ('right',1.58,4.34,2.98,2.12,2,.57,5),('right',2.19,5.15,1.94,1.07,0,.80,-11),('right',3.51,3.61,3.12,.73,3,.49,-5),('right',5.60,4.91,1.02,1.84,0,.72,7),
 ('rear',3.67,4.65,2.68,1.82,0,.73,-9),('rear',1.78,3.62,2.61,.78,2,.53,4),
 ('left',3.98,4.53,2.98,1.82,2,.55,-5),('left',4.80,5.18,1.93,.9,0,.75,7),('left',1.31,3.58,2.48,.74,3,.5,5)]}
# Separate broad bone-white scumbles. A white mask now controls an ivory COLOR layer.
edges={
'ground':[
 ('front',.22,1.68,.62,2.15,'brush',.84,0),('front',10.52,2.00,.62,1.90,'brush',.80,0),
 ('front',6.38,1.06,.59,1.35,'brush',.75,0),('front',3.2,.18,2.22,.53,'weather',.76,0),
 ('right',.15,1.10,.70,1.85,'brush',.82,0),('right',8.49,1.76,.77,2.18,'brush',.82,0),('right',5.85,.21,2.4,.61,'weather',.69,0),
 ('rear',.22,1.17,.67,2.18,'brush',.74,0),('rear',10.7,.2,2.31,.58,'weather',.67,0),
 ('left',.15,1.45,.65,2.22,'brush',.77,0),('left',6.19,.28,2.14,.73,'weather',.65,0),('corner',1.70,1.53,.60,1.96,'brush',.78,0)],
'upper':[
 ('front',.14,4.46,.59,2.08,'brush',.82,0),('front',5.85,3.76,.64,1.13,'brush',.74,0),('front',2.71,5.58,1.65,.55,'brush',.56,0),
 ('right',.17,4.52,.77,2.26,'brush',.86,0),('right',5.87,4.32,.65,2.23,'brush',.78,0),('right',2.58,3.41,2.46,.60,'weather',.75,0),
 ('rear',.18,4.37,.70,2.15,'brush',.75,0),('left',5.84,4.54,.75,2.20,'brush',.81,0)]}
colors=['A5B5A3','DED7BD','888395','B9936F','78999A','A79B86']
images={}
for name,file,space in [('pigment','broad-pigment-black.png','sRGB'),('brush','white-edge-brush.png','Non-Color'),('weather','white-foot-weather.png','Non-Color')]:
    im=bpy.data.images.load(str(ROOT/'layers'/file));im.name='V5_'+name;im.colorspace_settings.name=space;im.pack();images[name]=im
for m in list(bpy.data.materials):
    cat=m.get('paint_category')
    if cat not in patches:continue
    nt=m.node_tree;n=nt.nodes;l=nt.links;p=n.get('Principled BSDF');current=p.inputs['Base Color'].links[0].from_socket
    uv=n.new('ShaderNodeUVMap');uv.uv_map='PaintUV';uv.label='World-attached facade charts'
    def nodeval(node,index,v):
        if isinstance(v,(int,float,tuple)):node.inputs[index].default_value=v
        else:l.new(v,node.inputs[index])
    def mathn(op,a,b):
        x=n.new('ShaderNodeMath');x.operation=op;nodeval(x,0,a);nodeval(x,1,b);return x.outputs[0]
    def vec(op,a,b):
        x=n.new('ShaderNodeVectorMath');x.operation=op;nodeval(x,0,a);nodeval(x,1,b);return x.outputs[0]
    def stamp(side,s,z,w,h,source,crop,strength,angle,label,tint=None):
        u0,v0,u1,v1=rects[cat][side]
        length=6 if cat=='upper' else {'front':10.7,'right':8.7,'rear':12,'left':10,'corner':math.sqrt(2)*1.3}[side]
        height=2.8 if cat=='upper' else 3.4;z0=3.2 if cat=='upper' else 0
        cx=u0+s/length*(u1-u0);cy=v0+(z-z0)/height*(v1-v0)
        delta=vec('SUBTRACT',uv.outputs[0],(cx,cy,0));local=vec('DIVIDE',delta,(w/length*(u1-u0),h/height*(v1-v0),1))
        rotate=n.new('ShaderNodeVectorRotate');rotate.rotation_type='AXIS_ANGLE';rotate.inputs['Axis'].default_value=(0,0,1);rotate.inputs['Angle'].default_value=math.radians(angle);l.new(local,rotate.inputs['Vector'])
        local=vec('ADD',rotate.outputs[0],(.5,.5,0))
        sep=n.new('ShaderNodeSeparateXYZ');l.new(local,sep.inputs[0])
        gate=mathn('MULTIPLY',mathn('GREATER_THAN',sep.outputs[0],.001),mathn('LESS_THAN',sep.outputs[0],.999))
        gate=mathn('MULTIPLY',gate,mathn('MULTIPLY',mathn('GREATER_THAN',sep.outputs[1],.001),mathn('LESS_THAN',sep.outputs[1],.999)))
        # Explicit chart gate also prevents a rotated patch spilling onto a neighbouring facade chart.
        su=n.new('ShaderNodeSeparateXYZ');l.new(uv.outputs[0],su.inputs[0])
        for v,lo,hi in [(su.outputs[0],u0,u1),(su.outputs[1],v0,v1)]:
            gate=mathn('MULTIPLY',gate,mathn('MULTIPLY',mathn('GREATER_THAN',v,lo-.000001),mathn('LESS_THAN',v,hi+.000001)))
        a,b,c,d=crop;sample=vec('ADD',vec('MULTIPLY',local,(c-a,d-b,1)),(a,b,0))
        tx=n.new('ShaderNodeTexImage');tx.image=images[source];tx.extension='CLIP';tx.label=label;l.new(sample,tx.inputs['Vector'])
        mask=n.new('ShaderNodeMapRange');mask.clamp=True
        mask.inputs['From Min'].default_value=.012 if source=='pigment' else .045
        mask.inputs['From Max'].default_value=.13 if source=='pigment' else .34
        l.new(tx.outputs['Color'],mask.inputs['Value'])
        fac=mathn('MULTIPLY',mathn('MULTIPLY',mask.outputs[0],gate),strength)
        if tint:
            col=n.new('ShaderNodeMixRGB');col.inputs[0].default_value=.58;l.new(tx.outputs['Color'],col.inputs[1]);col.inputs[2].default_value=linear(tint);color=col.outputs[0]
        else:color=linear('EAE3CE')
        mix=n.new('ShaderNodeMixRGB');mix.label=label;l.new(fac,mix.inputs[0]);l.new(stamp.current,mix.inputs[1]);nodeval(mix,2,color);stamp.current=mix.outputs[0]
    stamp.current=current
    for i,(side,s,z,w,h,swatch,strength,angle) in enumerate(patches[cat]):
        col,row=swatch%2,swatch//2;crop=(col*.5+.008,1-(row+1)/3+.008,(col+1)*.5-.008,1-row/3-.008)
        stamp(side,s,z,w,h,'pigment',crop,strength,angle,f'PIGMENT {side} {i+1} · {w}m × {h}m',colors[swatch])
    for i,(side,s,z,w,h,source,strength,angle) in enumerate(edges[cat]):
        crop=(.51,.67,.975,.975) if source=='brush' else (.025,.645,.475,.775)
        # Edge footprints are narrow and tall; angle remains an editable normalized stamp rotation.
        stamp(side,s,z,w*1.22,h,source,crop,min(.96,strength*1.12),angle,f'IVORY EDGE {side} {i+1} · {w*1.22:.2f}m × {h}m')
    l.new(stamp.current,p.inputs['Base Color']);m['macro_paint']='v5 large pigment + explicit ivory edge layer; no change outside bounded stamp support'
scene['macro_paint_revision']='v5';scene.camera=bpy.data.objects['CAM_EXTERIOR']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_painterly_layered.blend'))
(ROOT/'source/placements.json').write_text(json.dumps({'units':'metres on facade, absolute Blender Z','pigment':patches,'ivoryEdges':edges,'ivoryWidthMultiplier':1.22,'ivoryOpacityGain':1.12,'ivoryOpacityCap':.96,'ivoryColor':'EAE3CE','colors':colors,'base':'v4 geometry and v3 local paint','boundary':'strict local footprint and facade chart gates; no global coating'},ensure_ascii=False,indent=2))

# Bake to the existing BakeUV charts, preserving the original maps in the editable source.
scene.cycles.samples=1;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=16
for cat in ['ground','upper']:
    target=bpy.data.images.new('V5_BAKED_'+cat,width=4096,height=4096,alpha=False);target.colorspace_settings.name='sRGB';copies=[]
    for original in arch:
        if not any(m and m.get('paint_category')==cat for m in original.data.materials):continue
        o=original.copy();o.data=original.data.copy();scene.collection.objects.link(o);copies.append(o)
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if o.data.materials[f.material_index].get('paint_category')!=cat],context='FACES');bm.to_mesh(o.data);bm.free()
        for m in o.data.materials:
            x=m.node_tree.nodes.new('ShaderNodeTexImage');x.name='BAKE_TARGET';x.image=target;m.node_tree.nodes.active=x
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.bake(type='DIFFUSE',use_clear=True)
    target.filepath_raw=str(ROOT/'atlases'/f'{cat}-basecolor.png');target.file_format='PNG';target.save();target.pack()
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        for x in list(m.node_tree.nodes):
            if x.name.startswith('BAKE_TARGET'):m.node_tree.nodes.remove(x)
    for m in bpy.data.materials:
        if m.get('paint_category')!=cat:continue
        nt=m.node_tree;p=nt.nodes.get('Principled BSDF');out=nt.nodes.get('Material Output')
        for x in list(nt.nodes):
            if x not in [p,out]:nt.nodes.remove(x)
        uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='BakeUV';tx=nt.nodes.new('ShaderNodeTexImage');tx.image=target;tx.extension='EXTEND'
        nt.links.new(uv.outputs[0],tx.inputs['Vector']);nt.links.new(tx.outputs['Color'],p.inputs['Base Color'])
    print('V5_BAKED',cat,flush=True)
scene.cycles.samples=24
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in arch:o.hide_set(False);o.hide_render=False;o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'bluebird_painterly.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
print('V5_COMPLETE',flush=True)
