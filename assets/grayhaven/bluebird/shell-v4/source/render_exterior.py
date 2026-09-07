"""Comparable Cycles renders and inspectable cutaway states for the detailed exterior."""
import bpy,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_exterior_detailed.blend'))
scene=bpy.context.scene
arch=[o for o in scene.objects if o.get('architecture')]
def visible(o,mode):
    d=o
    if mode=='ground':return not(d['floor']==1 or d['role'] in ['roof','roof_edge'] or(d['side'] in ['front','right','corner'] and d['band']=='high'))
    if mode=='upper':return not((d['floor']==0 and d['role']!='stair') or d['role'] in ['roof','roof_edge'] or (d['side'] in ['front','right','corner'] and (d['role'] in ['wall','frame','glass'] or d.get('exteriorDetail'))))
    return True
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
shots=[('exterior','01-exterior'),('street','02-street'),('entry_detail','03-entry-detail'),('roof_detail','04-roof-detail'),('front','05-front'),('right','06-right'),('rear','07-rear'),('ground','08-ground-cutaway'),('upper','09-upper-cutaway')]
if args:shots=[s for s in shots if s[0] in args]
for mode,name in shots:
    for o in arch:o.hide_render=not visible(o,mode)
    scene.camera=bpy.data.objects['CAM_'+mode.upper()]
    scene.cycles.samples=24
    scene.render.filepath=str(ROOT/'previews'/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED',name,flush=True)
