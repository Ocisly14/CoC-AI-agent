"""Tonal irregular roof paint over the completed v6 facade model."""
import bpy,bmesh,json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent

scene=bpy.context.scene;arch=[o for o in scene.objects if o.get('architecture')]
with bpy.data.libraries.load(str(BASE/'paint-effects-v2/tonal-pigment-library.blend'),link=False) as (src,dst):
    dst.node_groups=[n for n in src.node_groups if n.startswith('TONE_')]
def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
# X,Y,width,height,group,opacity,angle,tint. These are spatially authored, not tiled.
patches={0:[
 (2.65,1.70,4.50,2.65,'01_03',.72,24,'52585A'),
 (5.95,2.35,3.55,2.60,'02_01',.67,-29,'535348'),
 (9.1,1.70,3.70,2.75,'01_01',.70,-22,'4A5059'),
 (10.05,4.75,3.50,3.20,'01_02',.76,31,'565961'),
 (7.10,5.45,2.45,3.55,'02_03',.68,-24,'555449'),
 (9.25,8.45,4.10,2.80,'02_02',.70,23,'4D5048'),
 (6.85,8.45,2.35,2.40,'01_04',.63,-27,'5A565F')],
1:[
 (1.70,5.55,3.25,2.65,'01_01',.73,23,'525862'),
 (4.43,5.75,2.55,2.95,'02_03',.69,-26,'545347'),
 (2.83,7.13,3.22,2.7,'01_02',.76,-32,'595962'),
 (1.53,8.92,3.45,2.10,'02_02',.69,22,'4D5148'),
 (4.58,8.67,2.30,2.65,'01_03',.68,27,'50575B')]}
modified=[];parts=[]
names=['L0_LOW_ROOF','L1_ROOF','D0_KITCHEN_EXHAUST','D0_ROOF_AIR_VENT','D1_STOVE_FLUE']
for name in names:
    o=bpy.data.objects[name];floor=o['floor'];ispart=name.startswith('D');height=6.0 if floor else 3.4
    if ispart:parts.append(o)
    for i,original in enumerate(list(o.data.materials)):
        if not ispart and original.get('paint_category')!='roof':continue
        m=original.copy();m.name='V7_'+name+'_'+original.name;m['v7_target']='flashing' if ispart else 'roof';m['originalMaterial']=original.name
        o.data.materials[i]=m;modified.append(m);n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
        uv0=n.new('ShaderNodeUVMap');uv0.uv_map='UVMap'
        for tx in list(n):
            if tx.type=='TEX_IMAGE' and not tx.inputs['Vector'].is_linked:l.new(uv0.outputs[0],tx.inputs['Vector'])
        if p.inputs['Base Color'].is_linked:current=p.inputs['Base Color'].links[0].from_socket
        else:
            rgb=n.new('ShaderNodeRGB');rgb.outputs[0].default_value=p.inputs['Base Color'].default_value;current=rgb.outputs[0]
        def mn(op,a,b):
            nd=n.new('ShaderNodeMath');nd.operation=op
            for k,v in enumerate([a,b]):
                if isinstance(v,(int,float)):nd.inputs[k].default_value=v
                else:l.new(v,nd.inputs[k])
            return nd.outputs[0]
        geom=n.new('ShaderNodeNewGeometry');pos=n.new('ShaderNodeSeparateXYZ');normal=n.new('ShaderNodeSeparateXYZ')
        l.new(geom.outputs['Position'],pos.inputs[0]);l.new(geom.outputs['Normal'],normal.inputs[0])
        xy=n.new('ShaderNodeCombineXYZ');l.new(pos.outputs['X'],xy.inputs['X']);l.new(pos.outputs['Y'],xy.inputs['Y'])
        gate=mn('MULTIPLY',mn('GREATER_THAN',normal.outputs['Z'],.6),mn('LESS_THAN',mn('ABSOLUTE',mn('SUBTRACT',pos.outputs['Z'],height),0),.24))
        for x,y,w,h,gid,strength,angle,tint in patches[floor]:
            g=n.new('ShaderNodeGroup');g.node_tree=bpy.data.node_groups['TONE_'+gid];g.label=f'ROOF {x},{y} {angle:+}deg'
            l.new(xy.outputs[0],g.inputs['Surface UV']);l.new(current,g.inputs['Base Color']);g.inputs['Center'].default_value=(x,y,0);g.inputs['Size'].default_value=(w,h,1)
            g.inputs['Angle'].default_value=math.radians(angle);g.inputs['Tint'].default_value=linear(tint);g.inputs['Tint Mix'].default_value=.82
            l.new(mn('MULTIPLY',gate,strength),g.inputs['Strength']);current=g.outputs['Color']
        l.new(current,p.inputs['Base Color'])

(ROOT/'source/roof-placements.json').write_text(json.dumps({'patches':patches,'base':'v8 calibrated charcoal roofing'},indent=2))
