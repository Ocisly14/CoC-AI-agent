"""Comparable Cycles renders and inspectable cutaway states for the detailed exterior."""
import bpy,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
scene=bpy.context.scene
from mathutils import Vector
cam=bpy.data.cameras.new('CAM_PAINT');cam.type='ORTHO';cam.ortho_scale=8.3
ob=bpy.data.objects.new('CAM_PAINT',cam);scene.collection.objects.link(ob);ob.location=(16,-1,8.5)
ob.rotation_euler=(Vector((5.5,6,4.45))-ob.location).to_track_quat('-Z','Y').to_euler()
c=bpy.data.cameras.new('CAM_SILL');c.type='ORTHO';c.ortho_scale=6.8
co=bpy.data.objects.new('CAM_SILL',c);scene.collection.objects.link(co);co.location=(7,-10,5.1)
co.rotation_euler=(Vector((3.3,0,1.55))-co.location).to_track_quat('-Z','Y').to_euler()
arch=[o for o in scene.objects if o.get('architecture')]
def visible(o,mode):
    d=o
    if mode=='ground':return not(d['floor']==1 or d['role'] in ['roof','roof_edge'] or(d['side'] in ['front','right','corner'] and d['band']=='high'))
    if mode=='upper':return not((d['floor']==0 and d['role']!='stair') or d['role'] in ['roof','roof_edge'] or (d['side'] in ['front','right','corner'] and (d['role'] in ['wall','frame','glass'] or d.get('exteriorDetail'))))
    return True
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
shots=[('sill','11-sill-continuity'),('paint','10-paint-detail'),('exterior','01-exterior'),('street','02-street'),('entry_detail','03-entry-detail'),('roof_detail','04-roof-detail'),('front','05-front'),('right','06-right'),('rear','07-rear'),('ground','08-ground-cutaway'),('upper','09-upper-cutaway')]
if args:shots=[s for s in shots if s[0] in args]
for mode,name in shots:
    for o in arch:o.hide_render=not visible(o,mode)
    scene.camera=bpy.data.objects['CAM_'+mode.upper()]
    scene.cycles.samples=24
    scene.render.filepath=str(ROOT/'previews'/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED',name,flush=True)
