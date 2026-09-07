"""Build reusable pigment nodes and a real material swatch render; no building edits."""
import bpy, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
def linear(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
def socket(g,name,kind,io,default=None):
    s=g.interface.new_socket(name=name,in_out=io,socket_type=kind)
    if default is not None:s.default_value=default
    return s
def text(body,x,y,size=.16):
    c=bpy.data.curves.new(body,'FONT');c.body=body;c.size=size
    o=bpy.data.objects.new(body,c);scene.collection.objects.link(o);o.location=(x,y,.025)
    m=bpy.data.materials.get('Type')
    if not m:
        m=bpy.data.materials.new('Type');m.diffuse_color=linear('D6CBB8')
    c.materials.append(m)
manifest=[]
families=['eccentric-bursts','broken-radials','torn-scrapes','ivory-fractures']
tints=[['A59BA7','A0B3A7','B59661','DAD9C5'],['A0B3A7','A59BA7','AA956D','DAD9C5'],['A0B3A7','A59BA7','B59661','8FAAA7'],['EAE3CE']*4]
for row,family in enumerate(families):
    atlas=ROOT/'atlases'/f'{row+1:02}-{family}.png'
    im=bpy.data.images.load(str(atlas));im.colorspace_settings.name='sRGB';im.pack()
    text(f'{row+1:02} / {family.upper()}',0,9-row*2.9,.20)
    for col in range(4):
        ident=f'PFX_{row+1:02}_{col+1:02}'
        g=bpy.data.node_groups.new(ident,'ShaderNodeTree');g.use_fake_user=True
        socket(g,'Surface UV','NodeSocketVector','INPUT',(0,0,0))
        socket(g,'Base Color','NodeSocketColor','INPUT',linear('81796D'))
        socket(g,'Center','NodeSocketVector','INPUT',(.5,.5,0))
        socket(g,'Size','NodeSocketVector','INPUT',(1,1,1))
        socket(g,'Angle','NodeSocketFloat','INPUT',0.)
        s=socket(g,'Strength','NodeSocketFloat','INPUT',.78);s.min_value=0;s.max_value=1
        socket(g,'Tint','NodeSocketColor','INPUT',linear(tints[row][col]))
        s=socket(g,'Tint Mix','NodeSocketFloat','INPUT',.45);s.min_value=0;s.max_value=1
        socket(g,'Color','NodeSocketColor','OUTPUT');socket(g,'Mask','NodeSocketFloat','OUTPUT')
        n=g.nodes;l=g.links;inp=n.new('NodeGroupInput');out=n.new('NodeGroupOutput')
        def arg(nd,i,v):
            if isinstance(v,(float,int,tuple)):nd.inputs[i].default_value=v
            else:l.new(v,nd.inputs[i])
        def vec(op,a,b):
            nd=n.new('ShaderNodeVectorMath');nd.operation=op;arg(nd,0,a);arg(nd,1,b);return nd.outputs[0]
        def mathn(op,a,b):
            nd=n.new('ShaderNodeMath');nd.operation=op;arg(nd,0,a);arg(nd,1,b);return nd.outputs[0]
        local=vec('DIVIDE',vec('SUBTRACT',inp.outputs['Surface UV'],inp.outputs['Center']),inp.outputs['Size'])
        rot=n.new('ShaderNodeVectorRotate');rot.rotation_type='AXIS_ANGLE';rot.inputs['Axis'].default_value=(0,0,1)
        l.new(local,rot.inputs['Vector']);l.new(inp.outputs['Angle'],rot.inputs['Angle'])
        local=vec('ADD',rot.outputs[0],(.5,.5,0));sep=n.new('ShaderNodeSeparateXYZ');l.new(local,sep.inputs[0])
        gate=mathn('MULTIPLY',mathn('GREATER_THAN',sep.outputs[0],0.),mathn('LESS_THAN',sep.outputs[0],1.))
        gate=mathn('MULTIPLY',gate,mathn('MULTIPLY',mathn('GREATER_THAN',sep.outputs[1],0.),mathn('LESS_THAN',sep.outputs[1],1.)))
        u0=(col%2)*.5;v0=.5 if col<2 else 0.
        sample=vec('ADD',vec('MULTIPLY',local,(.5,.5,1)),(u0,v0,0))
        tx=n.new('ShaderNodeTexImage');tx.image=im;tx.extension='CLIP';l.new(sample,tx.inputs['Vector'])
        mask=n.new('ShaderNodeMapRange');mask.clamp=True;mask.inputs['From Min'].default_value=.015;mask.inputs['From Max'].default_value=.09
        l.new(tx.outputs['Color'],mask.inputs['Value'])
        fac=mathn('MULTIPLY',mathn('MULTIPLY',mask.outputs[0],gate),inp.outputs['Strength'])
        # Restrained palette tint reduces tiny baked impasto cues; shape remains generated.
        color=n.new('ShaderNodeMixRGB');l.new(inp.outputs['Tint Mix'],color.inputs[0]);l.new(tx.outputs['Color'],color.inputs[1]);l.new(inp.outputs['Tint'],color.inputs[2])
        mix=n.new('ShaderNodeMixRGB');l.new(fac,mix.inputs[0]);l.new(inp.outputs['Base Color'],mix.inputs[1]);l.new(color.outputs[0],mix.inputs[2])
        l.new(mix.outputs[0],out.inputs['Color']);l.new(fac,out.inputs['Mask'])
        for i,nd in enumerate(n):nd.location=((i%7)*210,-(i//7)*190)
        g['purpose']='Selective pigment over existing Base Color; local UV footprint; linear mask thresholds.'
        bpy.ops.mesh.primitive_plane_add(size=2,location=(1.15+col*2.65,7.6-row*2.9,0))
        plane=bpy.context.object;plane.name=ident+'_Swatch'
        m=bpy.data.materials.new(ident+'_Demo');m.use_nodes=True;plane.data.materials.append(m)
        nt=m.node_tree;nd=nt.nodes;lk=nt.links;p=nd.get('Principled BSDF');p.inputs['Roughness'].default_value=.92
        uv=nd.new('ShaderNodeTexCoord');noise=nd.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=16;lk.new(uv.outputs['UV'],noise.inputs['Vector'])
        ramp=nd.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=linear('706D64');ramp.color_ramp.elements[1].color=linear('999084');lk.new(noise.outputs['Fac'],ramp.inputs[0])
        group=nd.new('ShaderNodeGroup');group.node_tree=g;lk.new(uv.outputs['UV'],group.inputs['Surface UV']);lk.new(ramp.outputs['Color'],group.inputs['Base Color']);lk.new(group.outputs['Color'],p.inputs['Base Color'])
        # Each demo shows an undisturbed base strip as a local comparison.
        group.inputs['Size'].default_value=(.90,.90,1)
        text(ident,.2+col*2.65,6.36-row*2.9,.14)
        manifest.append({'id':ident,'family':family,'atlas':str(atlas.relative_to(ROOT)),'uvBottomLeft':[u0,v0,u0+.5,v0+.5],'suggestedWidthMetres':[.6,2.8],'sourcePixelsPerCell':[627,627]})
bpy.ops.object.camera_add(location=(5,3.35,20));cam=bpy.context.object;cam.rotation_euler=(0,0,0);cam.data.type='ORTHO';cam.data.ortho_scale=12.6;scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(3,4,10));bpy.context.object.data.energy=1100;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=10
world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.08,.08,.08,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.render.resolution_x=1600;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'material-preview.png')
(ROOT/'manifest.json').write_text(json.dumps({'version':1,'encoding':'sRGB source atlases; intentional black background; coverage derived in linear shader, .015 to .09','groups':manifest},ensure_ascii=False,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'irregular-pigment-library.blend'))
bpy.ops.render.render(write_still=True)
