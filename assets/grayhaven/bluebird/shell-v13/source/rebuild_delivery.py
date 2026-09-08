"""Re-export current deliveries, or rebake both from the independent layered source.
Blender --background --python this_file.py [-- --rebake [--base-only] [--output-dir DIR]]
Default preserves all current painting pixels. --rebake evaluates editable colour
layers into atlases; it is intended after edits and may differ from frozen delivery.
"""
import bpy,bmesh,json,struct,sys,os,hashlib
from pathlib import Path
SOURCE_ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
ROOT=Path(args[args.index('--output-dir')+1]).resolve() if '--output-dir' in args else SOURCE_ROOT
ROOT.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
def category(m):
 if m.get('v11_direct'):return None
 if m.get('v7_target'):return 'roof' if m['v7_target']=='roof' else 'details'
 if m.get('v6_target'):return m['v6_target']
 if m.get('paint_category') in ['ground','upper','roof']:return m['paint_category']
 if m.get('v8_family') in ['warm-plaster','dining-floor']:return 'interior'
 if m.get('v8_family'):return 'details'
 return None

def export(stem):
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if o.get('architecture'):o.hide_set(False);o.hide_render=False;o.select_set(True)
 path=ROOT/(stem+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);rest=raw[20+size:]
 reference=json.loads((SOURCE_ROOT/'source/delivery-reference.json').read_text())[stem]['images']
 names={h:name for name,h in reference.items()}
 binary=rest[8:]
 for im in doc['images']:
  v=doc['bufferViews'][im['bufferView']];offset=v.get('byteOffset',0)
  h=hashlib.sha256(binary[offset:offset+v['byteLength']]).hexdigest()
  if h in names:im['name']=names[h]
 for m in doc['materials']:
  if m.get('name','').startswith('OilLettering_'):m.update(alphaMode='MASK',alphaCutoff=.35,doubleSided=True)
 j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(j)+len(rest))+struct.pack('<II',len(j),0x4e4f534a)+j+rest)
 return dict(meshes=len(doc['meshes']),surfaces=sum(len(m['primitives']) for m in doc['meshes']),images=len(doc['images']))

results=[]
if '--rebake' not in args:
 for stem in ['bluebird_base_baked','bluebird_painterly']:
  bpy.ops.wm.open_mainfile(filepath=str(SOURCE_ROOT/(stem+'.blend')))
  results.append({'variant':stem,'mode':'export existing painting','result':export(stem)})
else:
 for layered_mode in ([False] if '--base-only' in args else [False,True]):
  bpy.ops.wm.open_mainfile(filepath=str(SOURCE_ROOT/'bluebird_painterly_layered.blend'))
  scene=bpy.context.scene;arch=[o for o in scene.objects if o.get('architecture')]
  for im in bpy.data.images:
   if im.filepath:im.filepath='//'+os.path.relpath(bpy.path.abspath(im.filepath),ROOT)
  for m in ([] if layered_mode else {m for o in arch for m in o.data.materials}):
   if not m.use_nodes:continue
   n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
   if not p:continue
   base=n.get(m.get('v11_base_node',m.get('v8_base_node','')))
   if base:l.new(base.outputs['Color'],p.inputs['Base Color'])
   elif m.get('v6_target'):
    # Teal bars and flat trim had a literal colour before the overlay chain.
    literal=next((v for v in n if v.type=='RGB'),None)
    if literal:l.new(literal.outputs[0],p.inputs['Base Color'])
  if not layered_mode:bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_base.blend'))
  scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
  scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=4
  outdir=ROOT/('atlases-layered' if layered_mode else 'atlases-base');outdir.mkdir(exist_ok=True)
  materials={m for o in arch for m in o.data.materials};bakes=[]
  for cat in ['ground','upper','frames','roof','details','interior']:
   mats=[m for m in materials if category(m)==cat]
   copies=[]
   for o in arch:
    if not any(m in mats for m in o.data.materials):continue
    dup=o.copy();dup.data=o.data.copy();scene.collection.objects.link(dup)
    bm=bmesh.new();bm.from_mesh(dup.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if dup.data.materials[f.material_index] not in mats],context='FACES')
    bm.to_mesh(dup.data);bm.free()
    if not dup.data.polygons:bpy.data.objects.remove(dup,do_unlink=True);continue
    used=sorted({p.material_index for p in dup.data.polygons});kept=[dup.data.materials[i] for i in used];indices=[used.index(p.material_index) for p in dup.data.polygons]
    dup.data.materials.clear()
    for m in kept:dup.data.materials.append(m)
    for p,i in zip(dup.data.polygons,indices):p.material_index=i
    assert 'BakeV11' in dup.data.uv_layers,dup.name
    dup.data.uv_layers.active=dup.data.uv_layers['BakeV11']
    for u in dup.data.uv_layers:u.active_render=u.name=='BakeV11'
    copies.append(dup)
   im=bpy.data.images.new('V11_BAKED_'+cat,width=4096,height=4096,alpha=False);im.colorspace_settings.name='sRGB'
   for m in mats:
    node=m.node_tree.nodes.new('ShaderNodeTexImage');node.name='V11_BAKE_TARGET';node.image=im;m.node_tree.nodes.active=node
   bpy.ops.object.select_all(action='DESELECT')
   for o in copies:o.hide_set(False);o.hide_render=False;o.select_set(True)
   bpy.context.view_layer.objects.active=copies[0]
   bpy.ops.object.bake(type='DIFFUSE',use_clear=True)
   im.filepath_raw=str(outdir/(cat+'-basecolor.png'));im.file_format='PNG';im.save()
   if ROOT==SOURCE_ROOT:im.filepath=bpy.path.relpath(im.filepath)
   im.pack()
   for o in copies:bpy.data.objects.remove(o,do_unlink=True)
   for m in mats:
    n=m.node_tree.nodes;l=m.node_tree.links;n.remove(n.get('V11_BAKE_TARGET'));p=n.get('Principled BSDF')
    uv=n.new('ShaderNodeUVMap');uv.uv_map='BakeV11';tx=n.new('ShaderNodeTexImage');tx.image=im;tx.name='V11_DELIVERY_COLOR';tx.extension='EXTEND'
    l.new(uv.outputs[0],tx.inputs['Vector']);l.new(tx.outputs['Color'],p.inputs['Base Color'])
   bakes.append({'category':cat,'materials':len(mats),'pixels':[4096,4096]});print('BAKED_V11',cat,flush=True)
  for o in arch:
   if 'UVMap' in o.data.uv_layers:o.data.uv_layers.active=o.data.uv_layers['UVMap']
  stem='bluebird_painterly' if layered_mode else 'bluebird_base_baked'
  bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(stem+'.blend')))
  results.append({'variant':stem,'mode':'rebake editable layers','result':export(stem)})
(ROOT/'rebuild-report.json').write_text(json.dumps(results,indent=2)+'\n')
print('INDEPENDENT_REBUILD_PASS',json.dumps(results),flush=True)
