"""Facade-space irregular paint continuous across walls, frames, sills and rain leaders."""
import bpy,bmesh,json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent

scene=bpy.context.scene;arch=[o for o in scene.objects if o.get('architecture')]
with bpy.data.libraries.load(str(BASE/'paint-effects-v1/irregular-pigment-library.blend'),link=False) as (src,dst):
    dst.node_groups=[n for n in src.node_groups if n.startswith('PFX_')]
# side, horizontal WORLD coordinate (corner uses distance from (10.7,0)), Z, W,H, group, opacity, degrees.
patches={0:[
 ('front',2.20,.98,3.15,2.15,'03_01',.82,-24),
 ('front',4.78,1.04,2.65,2.15,'01_01',.70,27),
 ('front',8.04,1.17,3.18,2.50,'02_04',.75,-29),
 ('front',6.34,2.12,.90,1.60,'03_02',.59,19),
 ('front',.20,1.62,.92,2.40,'04_01',.72,-17),
 ('front',4.23,.27,1.65,.89,'04_03',.55,23),
 ('right',2.60,1.08,2.68,2.40,'01_02',.78,24),
 ('right',5.45,1.12,2.80,2.34,'03_02',.69,-25),
 ('right',8.44,1.92,2.92,2.52,'03_01',.70,-23),
 ('right',7.70,.46,2.30,1.23,'01_03',.56,28),
 ('right',1.47,1.73,.85,2.50,'04_01',.72,21),
 ('right',6.72,.39,1.32,1.05,'04_02',.53,-28),
 ('rear',2.46,1.35,3.1,2.48,'02_01',.65,-23),
 ('rear',8.35,1.65,3.20,2.40,'03_02',.64,31),
 ('rear',10.9,.39,1.61,1.1,'04_03',.51,-24),
 ('left',2.0,1.64,3.28,2.66,'01_01',.64,28),
 ('left',5.0,1.19,3.12,2.40,'03_01',.66,-26),
 ('left',8.25,1.72,2.60,2.30,'02_03',.52,24),
 ('corner',.45,.64,1.53,1.86,'03_04',.58,-25)],
1:[
 ('front',1.05,4.38,2.54,2.50,'01_02',.72,-27),
 ('front',3.0,4.45,2.21,2.38,'03_02',.61,23),
 ('front',4.55,4.47,2.05,2.55,'02_01',.70,-22),
 ('front',5.77,4.45,.87,2.36,'04_01',.64,-19),
 ('right',5.68,4.48,3.26,2.65,'03_02',.59,26),
 ('right',8.18,4.52,2.55,2.43,'01_02',.78,-31),
 ('right',6.55,3.63,2.78,1.17,'02_03',.50,-24),
 ('right',4.12,4.49,.86,2.29,'04_01',.66,22),
 ('right',9.72,4.32,.73,2.16,'04_04',.64,-29),
 ('rear',4.13,4.55,2.71,2.43,'03_01',.70,24),
 ('rear',1.51,4.04,2.44,1.54,'01_01',.56,-28),
 ('left',8.16,4.48,2.89,2.60,'02_01',.68,-22),
 ('left',5.1,4.61,2.34,2.2,'03_02',.56,25)]}
(ROOT/'source/facade-placements.json').write_text(json.dumps({'base':'v4, before v5 broad strips','coordinateSystem':'world metres, X/Z for front & rear, Y/Z for right & left, diagonal tangent/Z for entry corner','patches':patches,'frames':'same projection, same mask, same pigment as adjacent wall; depth-limited per facade','glass':'preserved'},ensure_ascii=False,indent=2))
cache={};modified=[];frame_objects=[]
for o in arch:
    side=o.get('side');floor=o.get('floor');role=o.get('role')
    if floor not in patches or side not in ['front','right','rear','left','corner']:continue
    eligible=role in ['frame','drain'] or o.name=='D0_ENTRY_DOOR'
    if role!='wall' and not eligible:continue
    if eligible:frame_objects.append(o)
    for idx,original in enumerate(list(o.data.materials)):
        if role=='wall' and original.get('paint_category') not in ['ground','upper']:continue
        sides=['front','right','rear','left','corner'] if 'CORNER_BOARDS' in o.name else [side]
        key=(floor,tuple(sides),original.name)
        if key in cache:o.data.materials[idx]=cache[key];continue
        m=original.copy();m.name=f'V6_{floor}_{"-".join(sides)}_{original.name}';m['v6_target']='frames' if eligible else ('upper' if floor else 'ground')
        m['originalMaterial']=original.name;cache[key]=m;modified.append(m);o.data.materials[idx]=m
        n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
        if p is None:raise RuntimeError(m.name)
        # Freeze original implicit image UVs before adding a bake-only channel.
        olduv=n.new('ShaderNodeUVMap');olduv.uv_map='UVMap'
        for tx in list(n):
            if tx.type=='TEX_IMAGE' and not tx.inputs['Vector'].is_linked:l.new(olduv.outputs[0],tx.inputs['Vector'])
        if p.inputs['Base Color'].is_linked:current=p.inputs['Base Color'].links[0].from_socket
        else:
            rgb=n.new('ShaderNodeRGB');rgb.outputs[0].default_value=p.inputs['Base Color'].default_value;current=rgb.outputs[0]
        geom=n.new('ShaderNodeNewGeometry');xyz=n.new('ShaderNodeSeparateXYZ');l.new(geom.outputs['Position'],xyz.inputs[0])
        def mn(op,a,b):
            nd=n.new('ShaderNodeMath');nd.operation=op
            for i,v in enumerate([a,b]):
                if isinstance(v,(float,int)):nd.inputs[i].default_value=v
                else:l.new(v,nd.inputs[i])
            return nd.outputs[0]
        for si in sides:
            relevant=[pa for pa in patches[floor] if pa[0]==si]
            if not relevant:continue
            horizontal=xyz.outputs['X'] if si in ['front','rear'] else xyz.outputs['Y']
            if si=='corner':
                horizontal=mn('DIVIDE',mn('SUBTRACT',mn('ADD',xyz.outputs['X'],xyz.outputs['Y']),10.7),math.sqrt(2))
                distance=mn('DIVIDE',mn('SUBTRACT',mn('SUBTRACT',xyz.outputs['X'],xyz.outputs['Y']),10.7),math.sqrt(2))
            else:
                axis=xyz.outputs['Y'] if si in ['front','rear'] else xyz.outputs['X']
                plane={'front':4 if floor else 0,'rear':10,'left':0,'right':6 if floor else 12}[si]
                distance=mn('SUBTRACT',axis,plane)
            depth=mn('LESS_THAN',mn('ABSOLUTE',distance,0),.52)
            uv=n.new('ShaderNodeCombineXYZ');l.new(horizontal,uv.inputs['X']);l.new(xyz.outputs['Z'],uv.inputs['Y'])
            for _,s,z,w,h,group,strength,angle in relevant:
                g=n.new('ShaderNodeGroup');g.node_tree=bpy.data.node_groups['PFX_'+group]
                g.label=f'{si} {group} {angle:+}deg | continuous facade'
                l.new(uv.outputs[0],g.inputs['Surface UV']);l.new(current,g.inputs['Base Color'])
                g.inputs['Center'].default_value=(s,z,0);g.inputs['Size'].default_value=(w,h,1)
                g.inputs['Angle'].default_value=math.radians(angle);l.new(mn('MULTIPLY',depth,strength),g.inputs['Strength'])
                current=g.outputs['Color']
        l.new(current,p.inputs['Base Color'])
