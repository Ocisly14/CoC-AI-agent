import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
variant=args[0] if args else 'layered';shots=args[1:] or ['exterior','sill','roof','ground','upper']
files={'base':'bluebird_base.blend','layered':'bluebird_painterly_layered.blend','baked':'bluebird_painterly.blend','before':'../shell-v7/bluebird_painterly.blend','mask':'bluebird_painterly_layered.blend'}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/files[variant]));scene=bpy.context.scene
for key,loc,target,scale in [('SILL',(7,-10,5.1),(3.3,0,1.55),6.8),('ROOF',(19,-7,24),(6,5,3.8),20.5)]:
 cam=bpy.data.cameras.new('V8_'+key);cam.type='ORTHO';cam.ortho_scale=scale
 ob=bpy.data.objects.new('V8_'+key,cam);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
if variant=='mask':
 for m in {m for o in scene.objects if o.get('architecture') for m in o.data.materials}:
  if not m.use_nodes:continue
  n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
  groups=[x for x in n if x.type=='GROUP' and x.node_tree.name.startswith(('PFX_','TONE_'))]
  if not groups:
   rgb=n.new('ShaderNodeRGB');rgb.outputs[0].default_value=(0,0,0,1);color=rgb.outputs[0]
  else:
   # Composite coverage: a + b - a*b, using effective depth/strength masks.
   mask=None
   for g in groups:
    sock=g.outputs.get('Mask') or g.outputs.get('Alpha')
    if sock is None:raise RuntimeError('No mask output '+g.node_tree.name)
    if mask is None:mask=sock
    else:
     add=n.new('ShaderNodeMath');add.operation='ADD';mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';sub=n.new('ShaderNodeMath');sub.operation='SUBTRACT'
     l.new(mask,add.inputs[0]);l.new(sock,add.inputs[1]);l.new(mask,mul.inputs[0]);l.new(sock,mul.inputs[1]);l.new(add.outputs[0],sub.inputs[0]);l.new(mul.outputs[0],sub.inputs[1]);mask=sub.outputs[0]
   color=mask
  emission=n.new('ShaderNodeEmission');l.new(color,emission.inputs['Color']);out=next(x for x in n if x.type=='OUTPUT_MATERIAL');l.new(emission.outputs[0],out.inputs['Surface'])
arch=[o for o in scene.objects if o.get('architecture')]
for shot in shots:
 for o in arch:
  hide=False
  if shot=='ground':hide=o.get('floor')==1 or o.get('role') in ['roof','roof_edge'] or (o.get('side') in ['front','right','corner'] and o.get('band')=='high')
  if shot=='upper':hide=(o.get('floor')==0 and o.get('role')!='stair') or o.get('role') in ['roof','roof_edge'] or (o.get('side') in ['front','right','corner'] and (o.get('role') in ['wall','frame','glass'] or o.get('exteriorDetail')))
  o.hide_render=hide
 scene.camera=bpy.data.objects['V8_'+shot.upper()] if shot in ['sill','roof'] else bpy.data.objects['CAM_'+shot.upper()]
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
 scene.render.filepath=str(ROOT/'previews'/f'{variant}-{shot}.png');bpy.ops.render.render(write_still=True)
 print('RENDERED',variant,shot,flush=True)
