"""Retain the original fine texture, adding pigment only through bounded local masks."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parent/'shell-v2/bluebird_shell_layered.blend'))
scene=bpy.context.scene
rects=json.loads((ROOT/'source/uv-layout.json').read_text())['rectangles_uv_bottom_left']
# Artist placements in each facade's normalized coordinates; radius is the hard support boundary.
regions={
 'ground':{'front':[(.45,.90,.22,.13),(.28,.12,.19,.15)],'right':[(.75,.59,.21,.26),(.63,.10,.18,.13)],'rear':[(.48,.30,.23,.23)],'left':[(.28,.65,.24,.25)],'corner':[]},
 'upper':{'front':[(.49,.49,.14,.29)],'right':[(.28,.59,.26,.29)],'rear':[(.72,.25,.24,.19)],'left':[(.33,.40,.24,.29)]},
 'roof':{'low':[(.74,.41,.17,.23),(.25,.18,.19,.11)],'upper':[(.72,.58,.24,.20)],'awning':[(.47,.46,.25,.37)]}}
g=bpy.data.node_groups['BLUEBIRD · PAINT CONTROLS']
for key,value in [('Repaint',.66),('Weather',.18),('Brush',.24)]:g.nodes[key].outputs[0].default_value=value
for m in bpy.data.materials:
    cat=m.get('paint_category')
    if not cat:continue
    nt=m.node_tree;n=nt.nodes;l=nt.links
    def mathnode(op,a,b=None,name=None):
        x=n.new('ShaderNodeMath');x.operation=op
        if name:x.name=name;x.label=name
        if isinstance(a,(int,float)):x.inputs[0].default_value=a
        else:l.new(a,x.inputs[0])
        if b is not None:
            if isinstance(b,(int,float)):x.inputs[1].default_value=b
            else:l.new(b,x.inputs[1])
        return x.outputs[0]
    uv=next(x for x in n if x.type=='UVMAP' and x.uv_map=='PaintUV')
    control=next(x for x in n if x.type=='GROUP' and x.node_tree==g)
    tex={x.label:x for x in n if x.type=='TEX_IMAGE' and x.label in ['repaint','weather','brush']}
    tx={k:tex[k].outputs['Color'] for k in tex}
    combined=None
    for side,patches in regions[cat].items():
        u0,v0,u1,v1=rects[cat][side]
        for i,(x,y,rx,ry) in enumerate(patches):
            sub=n.new('ShaderNodeVectorMath');sub.operation='SUBTRACT';l.new(uv.outputs['UV'],sub.inputs[0]);sub.inputs[1].default_value=(u0+x*(u1-u0),v0+y*(v1-v0),0)
            div=n.new('ShaderNodeVectorMath');div.operation='DIVIDE';l.new(sub.outputs[0],div.inputs[0]);div.inputs[1].default_value=(rx*(u1-u0),ry*(v1-v0),1)
            length=n.new('ShaderNodeVectorMath');length.operation='LENGTH';l.new(div.outputs[0],length.inputs[0])
            fade=n.new('ShaderNodeMapRange');fade.clamp=True;fade.interpolation_type='SMOOTHSTEP';fade.label=f'{side} · patch {i+1}'
            fade.inputs['From Min'].default_value=.50;fade.inputs['From Max'].default_value=1;fade.inputs['To Min'].default_value=1;fade.inputs['To Max'].default_value=0;l.new(length.outputs['Value'],fade.inputs['Value'])
            combined=fade.outputs[0] if combined is None else mathnode('MAXIMUM',combined,fade.outputs[0])
    frame=n.new('NodeFrame');frame.label='LOCAL PLACEMENT · outside these regions: original texture 100%'
    # The existing hand-painted mask supplies the broken brush edge, bounded by the placements above.
    tooth=n.new('ShaderNodeMapRange');tooth.name='BRISTLE_MASK';tooth.clamp=True
    tooth.inputs['From Min'].default_value=.035;tooth.inputs['From Max'].default_value=.46;l.new(tx['brush'],tooth.inputs['Value'])
    # Sparse bristle gaps plus restrained pigment body, all strictly zero outside selected regions.
    tooth_body=mathnode('MULTIPLY_ADD',tooth.outputs[0],.75)
    tooth_body.node.inputs[2].default_value=.25
    local=mathnode('MULTIPLY',combined,tooth_body,'LOCAL_MASK')
    pigment=next(x for x in n if x.label=='1 · Large repaint masses')
    pigment.label='1 · SELECTIVE repaint — base texture retained'
    # Preserve the old non-black-chart validity guard, but make coverage truly selective.
    oldfactor=pigment.inputs[0].links[0].from_socket
    l.new(mathnode('MULTIPLY',oldfactor,local,'LOCAL_REPAINT_FACTOR'),pigment.inputs[0])
    weather=next(x for x in n if x.label=='2 · Climate pigment')
    oldweather=weather.inputs[0].links[0].from_socket
    l.new(mathnode('MULTIPLY',oldweather,combined,'LOCAL_WEATHER_FACTOR'),weather.inputs[0])
    brush=next(x for x in n if x.label=='3 · Broken bristle scumble')
    oldbrush=brush.inputs[0].links[0].from_socket
    l.new(mathnode('MULTIPLY',oldbrush,local,'LOCAL_BRUSH_FACTOR'),brush.inputs[0])
    combined.node.name='PLACEMENT_SUPPORT'
    m['paint_policy']='Selective bounded patches; outside support all three layers are zero.'
    # Bundle placement construction into a named group for a readable shader graph.
    for node in list(n):
        if node.type in ['VECT_MATH','MAP_RANGE','MATH'] and node not in [oldfactor.node,oldweather.node,oldbrush.node]:node.parent=frame
    frame.location=(-1400,-1000)
for im in bpy.data.images:
    if im.name in [c+'_'+x for c in regions for x in ['repaint','weather','brush']]:
        cat,layer=im.name.split('_');im.filepath='//layers/'+cat+'-'+layer+'.png'
helper=bpy.data.texts['PAINT_LAYER_README.py'];helper.clear();helper.write('''# LOCAL PAINT v3
# Original fine texture remains at full strength outside selected patches.
# Change strength in BLUEBIRD · PAINT CONTROLS; placement nodes are under LOCAL PLACEMENT.
# Save this layered file, then run source/bake_export.py to export again.
# Placement authoring recipe is source/local_paint.py; this recipe resets saved node edits.
''')
(ROOT/'source/local-regions.json').write_text(json.dumps({'coordinates':'normalized per UV chart, bottom-left origin','regions':regions,'strengths':{'Repaint':.66,'Weather':.18,'Brush':.24},'mask':'hard support ellipse, smooth inner falloff times authored bristle texture; no effect beyond support'},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_shell_layered.blend'))
exec(compile((ROOT/'source/bake_export.py').read_text(),str(ROOT/'source/bake_export.py'),'exec'))
