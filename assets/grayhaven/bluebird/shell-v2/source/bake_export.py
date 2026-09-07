"""Rebake saved artist edits from bluebird_shell_layered.blend; geometry stays fixed."""
import bpy,bmesh,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_shell_layered.blend'))
scene=bpy.context.scene
arch=[o for o in bpy.data.objects if o.get('architecture')]
scene.cycles.samples=1;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=16
bakes={}
for cat,size in [('ground',4096),('upper',4096),('roof',2048)]:
    target=bpy.data.images.new('BAKED_'+cat,width=size,height=size,alpha=False);target.colorspace_settings.name='sRGB';bakes[cat]=target
    copies=[]
    for original in arch:
        if not any(m and m.get('paint_category')==cat for m in original.data.materials):continue
        o=original.copy();o.data=original.data.copy();scene.collection.objects.link(o);copies.append(o)
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if o.data.materials[f.material_index].get('paint_category')!=cat],context='FACES');bm.to_mesh(o.data);bm.free()
        for m in o.data.materials:
            nt=m.node_tree;n=nt.nodes.new('ShaderNodeTexImage');n.name='BAKE_TARGET';n.image=target;nt.nodes.active=n
    bpy.ops.object.select_all(action='DESELECT')
    for o in copies:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.bake(type='DIFFUSE',use_clear=True)
    target.filepath_raw=str(ROOT/'atlases'/f'{cat}-basecolor.png');target.file_format='PNG';target.save();target.pack()
    for o in copies:bpy.data.objects.remove(o,do_unlink=True)
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in list(m.node_tree.nodes):
                if n.name.startswith('BAKE_TARGET'):m.node_tree.nodes.remove(n)
    print('BAKED',cat,size,flush=True)
# Standard materials only: no procedural or transparent overlay survives export.
for m in list(bpy.data.materials):
    cat=m.get('paint_category')
    if not cat:continue
    nt=m.node_tree;p=nt.nodes.get('Principled BSDF');output=nt.nodes.get('Material Output')
    for n in list(nt.nodes):
        if n not in [p,output]:nt.nodes.remove(n)
    u=nt.nodes.new('ShaderNodeUVMap');u.uv_map='BakeUV';u.location=(-600,100)
    tx=nt.nodes.new('ShaderNodeTexImage');tx.image=bakes[cat];tx.location=(-350,100);tx.extension='EXTEND'
    nt.links.new(u.outputs['UV'],tx.inputs['Vector']);nt.links.new(tx.outputs['Color'],p.inputs['Base Color']);p.location=(0,100);output.location=(350,100)
scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_shell_textured.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in arch:o.hide_set(False);o.hide_render=False;o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'bluebird_shell_textured.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
def view(mode):
    for o in arch:
        hide=False
        if mode=='ground':hide=o['floor']==1 or o['role'] in ['roof','roof_edge'] or (o['side'] in ['front','right','corner'] and o['band']=='high')
        if mode=='upper':hide=(o['floor']==0 and o['role']!='stair') or o['role'] in ['roof','roof_edge'] or (o['side'] in ['front','right','corner'] and o['role'] in ['wall','frame','glass'])
        o.hide_render=hide;o.hide_set(hide)
    scene.camera=bpy.data.objects['CAM_'+mode.upper()]
def render(name):
    scene.render.filepath=str(ROOT/'previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
for mode,name in [('exterior','01-textured-exterior'),('ground','02-ground-cutaway'),('upper','03-upper-cutaway'),('front','05-front'),('right','06-right')]:
    view(mode);render(name)
view('exterior');sun=bpy.data.lights['Soft daylight'];base=tuple(sun.color)
sun.color=(.65,.78,1);render('08-cool-light');sun.color=(1,.70,.43);render('09-warm-light');sun.color=base
scene.render.resolution_x=320;scene.render.resolution_y=245;scene.render.image_settings.color_mode='BW';render('10-grayscale-320')
print('PAINT_COMPLETE',flush=True)
