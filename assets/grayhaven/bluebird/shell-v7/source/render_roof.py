import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
before='--before' in sys.argv
path=ROOT.parent/'shell-v6/bluebird_painterly.blend' if before else ROOT/'bluebird_painterly.blend'
bpy.ops.wm.open_mainfile(filepath=str(path));scene=bpy.context.scene
for o in scene.objects:
    if o.get('architecture'):o.hide_render=False
data=bpy.data.cameras.new('CAM_ROOF_FIELD');data.type='ORTHO';data.ortho_scale=20.5
cam=bpy.data.objects.new('CAM_ROOF_FIELD',data);scene.collection.objects.link(cam);cam.location=(19,-7,24)
cam.rotation_euler=(Vector((6,5,3.8))-cam.location).to_track_quat('-Z','Y').to_euler()
for mode,filename in [('ROOF_FIELD','12-roof-field'),('EXTERIOR','01-exterior'),('ROOF_DETAIL','04-roof-detail')]:
    if before and mode!='ROOF_FIELD':continue
    if '--field-only' in sys.argv and mode!='ROOF_FIELD':continue
    scene.camera=bpy.data.objects['CAM_'+mode];scene.cycles.samples=24
    scene.render.filepath=str(ROOT/'previews'/f'{"before-" if before else ""}{filename}.png')
    bpy.ops.render.render(write_still=True)
