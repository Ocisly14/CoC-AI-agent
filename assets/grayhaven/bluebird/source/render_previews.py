"""Re-render delivered file without rebuilding geometry; fixes neutral backdrop if needed."""
import bpy,sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]
scene=bpy.context.scene
m=bpy.data.materials.get('mat_backdrop') or bpy.data.materials.new('mat_backdrop');m.use_nodes=True
rgb=[int('68716C'[i:i+2],16)/255 for i in (0,2,4)]
color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=.98
for o in bpy.data.objects:
    if o.name.startswith('gh_bluebird_ground_plane_'):o.data.materials.clear();o.data.materials.append(m)
exec(compile((R/'source/view_bluebird.py').read_text(),str(R/'source/view_bluebird.py'),'exec'))
views=['01_exterior','02_ground_cutaway','03_residence','04_kitchen','05_stew_pot','06_exterior_dusk']
if '--' in sys.argv:views=sys.argv[sys.argv.index('--')+1:] or views
for name in views:
    bpy.ops.bluebird.set_view(view=name)
    scene.render.resolution_x=1100 if name=='05_stew_pot' else 1500
    scene.render.resolution_y=950 if name=='05_stew_pot' else 1300
    scene.render.filepath=str(R/'previews'/f'{name}.png')
    print('RENDER',name,flush=True);bpy.ops.render.render(write_still=True)
bpy.ops.bluebird.set_view(view='01_exterior')
scene.render.resolution_x=1500;scene.render.resolution_y=1300
bpy.ops.wm.save_as_mainfile(filepath=str(R/'bluebird_diner.blend'))
