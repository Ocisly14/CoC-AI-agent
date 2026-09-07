"""Editable painterly layers -> light-independent diffuse bake -> standard GLB."""
import bpy,bmesh,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'source/uv-prepared.blend'))
scene=bpy.context.scene
arch=[o for o in bpy.data.objects if o.get('architecture')]
def linear(hex):
    a=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a)+(1,)
controls=bpy.data.node_groups.new('BLUEBIRD · PAINT CONTROLS','ShaderNodeTree')
out=controls.nodes.new('NodeGroupOutput');out.location=(220,0)
for j,(name,value) in enumerate([('Repaint',.88),('Weather',.32),('Brush',.38)]):
    controls.interface.new_socket(name=name,in_out='OUTPUT',socket_type='NodeSocketFloat')
    n=controls.nodes.new('ShaderNodeValue');n.name=name;n.label=name+' strength · 0–1';n.outputs[0].default_value=value;n.location=(-100,-j*100)
    controls.links.new(n.outputs[0],out.inputs[name])
images={}
for cat in ['ground','upper','roof']:
    for layer in ['repaint','weather','brush']:
        im=bpy.data.images.load(str(ROOT/'layers'/f'{cat}-{layer}.png'));im.name=cat+'_'+layer
        im.colorspace_settings.name='sRGB' if layer=='repaint' else 'Non-Color';im.pack()
        images[cat,layer]=im
for m in list(bpy.data.materials):
    cat=m.get('paint_category')
    if not cat:continue
    nt=m.node_tree;nodes=nt.nodes;links=nt.links;p=nodes.get('Principled BSDF');p.location=(1000,100)
    original=p.inputs['Base Color'].links[0].from_socket
    u=nodes.new('ShaderNodeUVMap');u.uv_map='PaintUV';u.location=(-1000,500);u.label='Continuous facade UV — never screen-space'
    c=nodes.new('ShaderNodeGroup');c.node_tree=controls;c.location=(-1000,850)
    tx={}
    for i,layer in enumerate(['repaint','weather','brush']):
        n=nodes.new('ShaderNodeTexImage');n.image=images[cat,layer];n.extension='EXTEND';n.location=(-730,650-i*330);n.label=layer
        links.new(u.outputs['UV'],n.inputs['Vector']);tx[layer]=n
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.label='1 · Large repaint masses';mix.location=(-300,500)
    coverage=nodes.new('ShaderNodeMapRange');coverage.location=(-470,800);coverage.clamp=True
    coverage.inputs['From Min'].default_value=.005;coverage.inputs['From Max'].default_value=.03
    links.new(tx['repaint'].outputs['Color'],coverage.inputs['Value'])
    strength=nodes.new('ShaderNodeMath');strength.operation='MULTIPLY';strength.location=(-250,800)
    links.new(coverage.outputs[0],strength.inputs[0]);links.new(c.outputs['Repaint'],strength.inputs[1])
    links.new(strength.outputs[0],mix.inputs[0]);links.new(original,mix.inputs[1]);links.new(tx['repaint'].outputs['Color'],mix.inputs[2])
    weather=nodes.new('ShaderNodeMixRGB');weather.blend_type='MIX';weather.label='2 · Climate pigment';weather.location=(50,400)
    mask=nodes.new('ShaderNodeMath');mask.operation='MULTIPLY';mask.location=(-270,150)
    links.new(tx['weather'].outputs['Color'],mask.inputs[0]);links.new(c.outputs['Weather'],mask.inputs[1]);links.new(mask.outputs[0],weather.inputs[0]);links.new(mix.outputs[0],weather.inputs[1])
    weather.inputs[2].default_value=linear({'ground':'555A48','upper':'80715F','roof':'4F5044'}[cat])
    pigment=nodes.new('ShaderNodeMixRGB');pigment.label='Dry pigment color';pigment.inputs[0].default_value=.30;pigment.location=(30,-130)
    links.new(tx['repaint'].outputs['Color'],pigment.inputs[1]);pigment.inputs[2].default_value=linear('A2AAB2' if cat=='roof' else 'D9CDB6')
    brush=nodes.new('ShaderNodeMixRGB');brush.label='3 · Broken bristle scumble';brush.location=(530,380)
    bm=nodes.new('ShaderNodeMath');bm.operation='MULTIPLY';bm.location=(260,-180)
    links.new(tx['brush'].outputs['Color'],bm.inputs[0]);links.new(c.outputs['Brush'],bm.inputs[1]);links.new(bm.outputs[0],brush.inputs[0]);links.new(weather.outputs[0],brush.inputs[1]);links.new(pigment.outputs[0],brush.inputs[2]);links.new(brush.outputs[0],p.inputs['Base Color'])
    nodes.get('Material Output').location=(1320,100)
helper=bpy.data.texts.new('PAINT_LAYER_README.py');helper.write('''# Editable source: three shared layer controls, clamped by convention to 0..1.
# UVMap: original material. PaintUV: whole facade. BakeUV: delivery atlas.
# No layer changes geometry, illumination, opacity or interior materials.
import bpy
g=bpy.data.node_groups['BLUEBIRD · PAINT CONTROLS']
# Change these, save this layered file, then run source/bake_export.py to regenerate delivery.
g.nodes['Repaint'].outputs[0].default_value=.88
g.nodes['Weather'].outputs[0].default_value=.32
g.nodes['Brush'].outputs[0].default_value=.38
''')
scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_shell_layered.blend'))
exec(compile((ROOT/'source/bake_export.py').read_text(),str(ROOT/'source/bake_export.py'),'exec'))
