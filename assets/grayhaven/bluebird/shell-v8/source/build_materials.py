"""Replace legacy baked base colors, retain architecture and reapply authored v6/v7 paint."""
import bpy,bmesh,math,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent
TEX=BASE/'textures-weathered-v3/basecolor'
bpy.ops.wm.open_mainfile(filepath=str(BASE/'shell-v4/bluebird_exterior_detailed.blend'))
scene=bpy.context.scene;arch=[o for o in scene.objects if o.get('architecture')]
scene.render.engine='CYCLES';scene.cycles.device='CPU'
# Each texture is a calibrated physical swatch; no legacy painted atlas is sampled.
families={
 'ivory-clapboard':('01-ivory-clapboard.png',2.4,1.8,.84),
 'teal-wainscot':('02-teal-wainscot.png',1.2,2.4,.82),
 'ivory-trim':('03-ivory-trim.png',1.,1.,.68),
 'weathered-metal':('04-weathered-metal.png',2.,2.,.78),
 'charcoal-roof':('05-charcoal-roof.png',1.,2.,.92),
 'dining-floor':('07-dining-floor.png',1.6,2.4,.76),
 'warm-plaster':('08-warm-plaster.png',2.,2.,.91)}
windows={'ivory-clapboard':(0,99/1254,1,1065/1254),'teal-wainscot':(130/1254,0,960/1254,1),'dining-floor':(121/1254,0,1006/1254,1),'charcoal-roof':(294/1254,0,663/1254,1)}
def family(m):
 s=m.get('source_material',m.name)
 for word in ['ivory-clapboard','teal-wainscot','ivory-trim','charcoal-roof','dining-floor','warm-plaster']:
  if word in s:return word
 if 'rusted-awning' in s or 'Weathered_sheet' in s:return 'weathered-metal'
 if 'DETAIL_OIL_Ivory' in s:return 'ivory-trim'
 if 'DETAIL_OIL_Teal' in s:return 'teal-wainscot'
 return None
images={};replacements={}
for old in {m for o in arch for m in o.data.materials}:
 f=family(old)
 if not f:continue
 filename,w,h,rough=families[f]
 if f not in images:
  im=bpy.data.images.load(str(TEX/filename),check_existing=True);im.name='V8_SOURCE_'+f;im.colorspace_settings.name='sRGB';im.pack();images[f]=im
 m=old.copy();m.name='V8_BASE_'+old.name;m['v8_family']=f;m['v8_original']=old.name;m['coverageMeters']=[w,h]
 n=m.node_tree.nodes;n.clear();l=m.node_tree.links
 out=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');p.name='Principled BSDF'
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=0;p.inputs['Specular IOR Level'].default_value=.25
 uv=n.new('ShaderNodeUVMap');uv.uv_map='MaterialUVV8';tx=n.new('ShaderNodeTexImage');tx.name='V8_REALIST_BASE';tx.label=f'{w}m x {h}m | realist painterly material';tx.image=images[f];tx.extension='REPEAT'
 if f in windows:
  ox,oy,sx,sy=windows[f]
  fract=n.new('ShaderNodeVectorMath');fract.operation='FRACTION';scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';offset=n.new('ShaderNodeVectorMath');offset.operation='ADD'
  scale.inputs[1].default_value=(sx,sy,1);offset.inputs[1].default_value=(ox,oy,0)
  l.new(uv.outputs[0],fract.inputs[0]);l.new(fract.outputs[0],scale.inputs[0]);l.new(scale.outputs[0],offset.inputs[0]);l.new(offset.outputs[0],tx.inputs['Vector'])
  tx.extension='EXTEND';m['sourceWindowUV']=[ox,oy,sx,sy]
 else:l.new(uv.outputs[0],tx.inputs['Vector'])
 l.new(tx.outputs['Color'],p.inputs['Base Color']);l.new(p.outputs['BSDF'],out.inputs['Surface'])
 # Store an independently editable base output for overlay toggling and QA.
 m['v8_base_node']=tx.name
 replacements[old]=m
for o in arch:
 for i,m in enumerate(list(o.data.materials)):
  if m in replacements:o.data.materials[i]=replacements[m]
 if not any(m.get('v8_family') for m in o.data.materials):continue
 uv=o.data.uv_layers.new(name='MaterialUVV8')
 for poly in o.data.polygons:
  m=o.data.materials[poly.material_index];f=m.get('v8_family')
  if not f:continue
  w,h=families[f][1:3];pts=[o.matrix_world@o.data.vertices[o.data.loops[i].vertex_index].co for i in poly.loop_indices]
  norm=(o.matrix_world.to_3x3()@poly.normal).normalized();side=o.get('side')
  if o.get('role')=='wall' and f in ['ivory-clapboard','teal-wainscot'] and abs(norm.z)<.5:
   for li,q in zip(poly.loop_indices,pts):
    u=(q.x+q.y)/math.sqrt(2) if side=='corner' else (q.y if side in ['right','left'] else q.x)
    uv.data[li].uv=(u/w,q.z/h)
  elif f in ['charcoal-roof','dining-floor'] and abs(norm.z)>.5:
   for li,q in zip(poly.loop_indices,pts):uv.data[li].uv=(q.x/w,q.y/h)
  else:
   # Grain follows the longest edge of each built member, in physical metres.
   edges=[pts[(i+1)%len(pts)]-q for i,q in enumerate(pts)]
   length=max(edges,key=lambda v:v.length).normalized();cross=length.cross(norm).normalized()
   if cross.length<.01:cross=Vector((1,0,0))
   for li,q in zip(poly.loop_indices,pts):uv.data[li].uv=(q.dot(cross)/w,q.dot(length)/h)
 for layer in o.data.uv_layers:layer.active_render=layer.name=='UVMap'
 o.data.uv_layers.active=o.data.uv_layers['UVMap']
scene['paintRevision']='v8 weathered realist oil-painted bases with inherent damage; no decorative small color blocks'
scene['baseTexturePolicy']='observed seam windows: 9 siding courses/1.8m; 6 wainscot boards/1.2m; 8 floor planks/1.6m; roof lane/1m'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_base.blend'))
if '--base-only' in sys.argv:sys.exit(0)
# Reuse existing art-directed marks without rebaking any old base color into them.
exec(compile((ROOT/'source/reapply_facade.py').read_text(),str(ROOT/'source/reapply_facade.py'),'exec'))
exec(compile((ROOT/'source/reapply_roof.py').read_text(),str(ROOT/'source/reapply_roof.py'),'exec'))
scene['paintRevision']='v8 weathered realist base + retained v6 facade and v7 roof marks, both editable'
# Capture the final/base socket pairs for non-destructive overlay switches.
for m in {m for o in arch for m in o.data.materials}:
 p=m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
 if p and p.inputs['Base Color'].is_linked:
  link=p.inputs['Base Color'].links[0];m['v8_final_node']=link.from_node.name;m['v8_final_socket']=link.from_socket.name
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_painterly_layered.blend'))
if '--layered-only' in sys.argv:sys.exit(0)
exec(compile((ROOT/'source/bake_delivery.py').read_text(),str(ROOT/'source/bake_delivery.py'),'exec'))
