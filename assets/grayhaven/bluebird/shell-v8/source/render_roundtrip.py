import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
scene=bpy.context.scene
for o in list(scene.objects):
 if o.get('architecture'):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'bluebird_painterly.glb'))
scene.camera=bpy.data.objects['CAM_EXTERIOR'];scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.filepath=str(ROOT/'previews/glb-roundtrip-exterior.png');bpy.ops.render.render(write_still=True)
print('Rendered imported standalone GLB',flush=True)
