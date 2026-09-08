"""Actual neutral clay renders, using the same cameras/light before and after."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
shots={
 'corner':((21,-19,16),(6,5,2.9),17),
 'front':((6,-25,3),(6,5,3),14),
 'right':((30,5,3),(6,5,3),12),
 'upper-joint':((13,-6,10),(5.9,4,5.65),2.6),
 'lower-joint':((20,22,8),(12,10,3.12),2.6),
}
for variant in ['after']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
 s=bpy.context.scene
 for o in list(s.objects):
  if not o.get('architecture'):bpy.data.objects.remove(o,do_unlink=True)
  else:o.hide_render=False;o.hide_set(False)
 mat=bpy.data.materials.new('White model · neutral clay');mat.diffuse_color=(.65,.65,.65,1);mat.use_nodes=True
 mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.65,.65,.65,1)
 mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
 for o in s.objects:
  if o.type=='MESH':
   for i in range(len(o.data.materials)):o.data.materials[i]=mat
 s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.device='CPU'
 s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.55,.55,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
 ld=bpy.data.lights.new('QA_key','AREA');lo=bpy.data.objects.new('QA_key',ld);s.collection.objects.link(lo);lo.location=(1,-8,16);ld.energy=2400;ld.size=9
 cam=bpy.data.objects.new('QA_camera',bpy.data.cameras.new('QA_camera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO'
 s.render.resolution_x=1280;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
 for shot,(position,target,scale) in shots.items():
  if variant=='before' and shot in ('front','right'):continue
  cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
  s.render.filepath=str(ROOT/'previews'/(variant+'-white-'+shot+'.png'));bpy.ops.render.render(write_still=True)
 if variant=='after':
  position,target,scale=shots['corner'];cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
  # Remove unreferenced painting datablocks from the dedicated lightweight white model.
  for m in list(bpy.data.materials):
   if m!=mat:m.use_fake_user=False
  bpy.data.orphans_purge(do_local_ids=True,do_linked_ids=False,do_recursive=True)
  for screen in bpy.data.screens:
   for area in screen.areas:
    if area.type=='VIEW_3D':
     area.spaces.active.region_3d.view_distance=17;area.spaces.active.region_3d.view_location=(6,5,3)
  bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_white.blend'))
