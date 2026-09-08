"""Bake active layered materials to shared color atlases, preserving original mesh and UVs."""
import bpy,bmesh,math,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
base_mode='--base' in sys.argv
audit_only='--uv-audit' in sys.argv
if __name__=='__main__':
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/('bluebird_base.blend' if base_mode else 'bluebird_painterly_layered.blend')))
scene=bpy.context.scene;arch=[o for o in scene.objects if o.get('architecture')]
materials={m for o in arch for m in o.data.materials}
def category(m):
 if m.get('v7_target'):return 'roof' if m['v7_target']=='roof' else 'details'
 if m.get('v6_target'):return m['v6_target']
 if m.get('paint_category') in ['ground','upper','roof']:return m['paint_category']
 if m.get('v8_family') in ['warm-plaster','dining-floor']:return 'interior'
 if m.get('v8_family'):return 'details'
 return None
cats={c:[m for m in materials if category(m)==c] for c in ['ground','upper','frames','roof','details','interior']}
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=4
outdir=ROOT/('atlases-base' if base_mode else 'atlases');outdir.mkdir(exist_ok=True)
for o in arch:
 if any(category(m) for m in o.data.materials) and 'BakeV8' not in o.data.uv_layers:o.data.uv_layers.new(name='BakeV8')
report=[]
for cat,mats in cats.items():
 if not mats:continue
 copies=[]
 for original in arch:
  if not any(m in mats for m in original.data.materials):continue
  dup=original.copy();dup.data=original.data.copy();scene.collection.objects.link(dup)
  bm=bmesh.new();bm.from_mesh(dup.data);bm.faces.ensure_lookup_table()
  track=bm.loops.layers.int.new('v8_source_loop')
  for face,poly in zip(bm.faces,original.data.polygons):
   lookup={original.data.loops[li].vertex_index:li for li in poly.loop_indices}
   for lp in face.loops:lp[track]=lookup[lp.vert.index]
  bmesh.ops.delete(bm,geom=[f for f in bm.faces if dup.data.materials[f.material_index] not in mats],context='FACES')
  # Weld only the temporary bake mesh, allowing planar surfaces to form useful UV islands.
  bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.000001)
  bm.to_mesh(dup.data);bm.free()
  used=sorted({p.material_index for p in dup.data.polygons});keep=[dup.data.materials[i] for i in used];indices=[used.index(p.material_index) for p in dup.data.polygons]
  dup.data.materials.clear()
  for m in keep:dup.data.materials.append(m)
  for p,i in zip(dup.data.polygons,indices):p.material_index=i
  dup.data.uv_layers.active=dup.data.uv_layers['BakeV8']
  for layer in dup.data.uv_layers:layer.active_render=layer.name=='BakeV8'
  copies.append((original,dup))
 bpy.ops.object.select_all(action='DESELECT')
 for original,dup in copies:dup.hide_set(False);dup.select_set(True)
 bpy.context.view_layer.objects.active=copies[0][1]
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.001,area_weight=.0,correct_aspect=True,scale_to_bounds=True)
 bpy.ops.object.mode_set(mode='OBJECT')
 for original,dup in copies:
  track=dup.data.attributes['v8_source_loop']
  mapped={track.data[li].value for li in range(len(dup.data.loops))}
  expected={li for p in original.data.polygons if original.data.materials[p.material_index] in mats for li in p.loop_indices}
  for li in range(len(dup.data.loops)):
   original.data.uv_layers['BakeV8'].data[track.data[li].value].uv=dup.data.uv_layers['BakeV8'].data[li].uv
  # Welding may discard coincident faces. Give their untouched source copies
  # the same packed UVs, matching material and local geometric coordinates.
  def position(mesh,li):return tuple(round(x,6) for x in mesh.vertices[mesh.loops[li].vertex_index].co)
  def face_key(mesh,p):return (mesh.materials[p.material_index].name,tuple(sorted({position(mesh,li) for li in p.loop_indices})))
  packed_faces={face_key(dup.data,p):{position(dup.data,li):tuple(dup.data.uv_layers['BakeV8'].data[li].uv) for li in p.loop_indices} for p in dup.data.polygons}
  for p in original.data.polygons:
   if original.data.materials[p.material_index] not in mats or all(li in mapped for li in p.loop_indices):continue
   if p.area<1e-12:
    # Original zero-area faces remain in the deliverable but need no atlas area.
    for li in p.loop_indices:original.data.uv_layers['BakeV8'].data[li].uv=(.5,.5);mapped.add(li)
    continue
   packed=packed_faces.get(face_key(original.data,p))
   if packed is None:raise RuntimeError('No surviving bake face for '+original.name+' polygon '+str(p.index))
   for li in p.loop_indices:
    original.data.uv_layers['BakeV8'].data[li].uv=packed[position(original.data,li)];mapped.add(li)
  if mapped!=expected:raise RuntimeError('Incomplete bake UV transfer for '+original.name)
 if audit_only:
  report.append({'category':cat,'objects':len(copies),'completeLoopTransfer':True})
  for original,dup in copies:bpy.data.objects.remove(dup,do_unlink=True)
  continue
 size=4096
 im=bpy.data.images.new(('V8_BASE_BAKED_' if base_mode else 'V8_BAKED_')+cat,width=size,height=size,alpha=False);im.colorspace_settings.name='sRGB'
 for m in mats:
  tx=m.node_tree.nodes.new('ShaderNodeTexImage');tx.image=im;tx.name='V8_BAKE_TARGET';m.node_tree.nodes.active=tx
 bpy.ops.object.bake(type='DIFFUSE',use_clear=True)
 im.filepath_raw=str(outdir/(cat+'-basecolor.png'));im.file_format='PNG';im.save();im.pack()
 for original,dup in copies:bpy.data.objects.remove(dup,do_unlink=True)
 for m in mats:
  n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');n.remove(n.get('V8_BAKE_TARGET'))
  uv=n.new('ShaderNodeUVMap');uv.uv_map='BakeV8';tx=n.new('ShaderNodeTexImage');tx.image=im;tx.extension='EXTEND';tx.name='V8_DELIVERY_COLOR'
  l.new(uv.outputs[0],tx.inputs['Vector']);l.new(tx.outputs['Color'],p.inputs['Base Color'])
 report.append({'category':cat,'size':size,'materials':len(mats),'objects':len(copies)})
 print('BAKED',cat,flush=True)
if audit_only:
 (ROOT/'source/uv-transfer-audit.json').write_text(json.dumps(report,indent=2))
 print('ALL BAKE UV LOOPS COVERED',flush=True)
 sys.exit(0)
scene.cycles.samples=24
for o in arch:
 if 'UVMap' in o.data.uv_layers:o.data.uv_layers.active=o.data.uv_layers['UVMap']
name='bluebird_base_baked' if base_mode else 'bluebird_painterly'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(name+'.blend')))
bpy.ops.object.select_all(action='DESELECT')
for o in arch:o.hide_set(False);o.hide_render=False;o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
(ROOT/'source'/('bake-base.json' if base_mode else 'bake-final.json')).write_text(json.dumps(report,indent=2))
print('DELIVERY COMPLETE',name,flush=True)
