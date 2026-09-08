"""Make all five current Blender documents self-contained, without re-painting.
Extract packed bytes once by SHA-256, use relative paths, embed all assets again.
Copy current delivery bake UVs into editable sources for future colour rebaking.
"""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LIBRARY=ROOT/'textures/library';LIBRARY.mkdir(parents=True,exist_ok=True)
STEMS=['bluebird_painterly','bluebird_base_baked','bluebird_painterly_layered','bluebird_base','bluebird_white']
bpy.context.preferences.filepaths.save_version=0
# Current delivered geometry is the authoritative correspondence for the bake UVs.
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
bake={o.name:{'vertices':[tuple(v.co) for v in o.data.vertices],'polygons':[tuple(p.vertices) for p in o.data.polygons],'uv':[tuple(d.uv) for d in o.data.uv_layers['BakeV11'].data]} for o in bpy.context.scene.objects if o.get('architecture') and 'BakeV11' in o.data.uv_layers}
manifest=json.loads((ROOT/'source/texture-manifest.json').read_text()).get('textures',{}) if (ROOT/'source/texture-manifest.json').exists() else {};documents={}
for stem in STEMS:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/(stem+'.blend')))
 assert not bpy.data.libraries,'Linked libraries require explicit consolidation'
 added=[]
 if stem in ['bluebird_painterly_layered','bluebird_base']:
  for o in bpy.context.scene.objects:
   if o.name not in bake:continue
   d=bake[o.name]
   assert [tuple(v.co) for v in o.data.vertices]==d['vertices'] and [tuple(p.vertices) for p in o.data.polygons]==d['polygons'],o.name
   uv=o.data.uv_layers.get('BakeV11')
   if uv is None:
    active=o.data.uv_layers.active.name;uv=o.data.uv_layers.new(name='BakeV11')
    for point,value in zip(uv.data,d['uv']):point.uv=value
    o.data.uv_layers.active=o.data.uv_layers[active];added.append(o.name)
   else:assert [tuple(p.uv) for p in uv.data]==d['uv']
 local=[]
 for im in bpy.data.images:
  if im.source=='VIEWER':continue
  assert im.source=='FILE', (im.name,im.source)
  old_path=Path(bpy.path.abspath(im.filepath))
  raw=bytes(im.packed_file.data) if im.packed_file else old_path.read_bytes()
  h=hashlib.sha256(raw).hexdigest();suffix=old_path.suffix.lower() or '.png';dest=LIBRARY/(h[:20]+suffix)
  if dest.exists():assert dest.read_bytes()==raw
  else:dest.write_bytes(raw)
  rel=dest.relative_to(ROOT).as_posix()
  # Refresh the packed-file record too; its old filename can otherwise be
  # used by Blender's automatic repack even when Image.filepath is local.
  if im.packed_file:im.unpack(method='REMOVE')
  im.filepath='//'+rel;im.pack()
  record=manifest.setdefault(h,{'file':rel,'bytes':len(raw),'names':[],'original_paths':[]})
  if im.name not in record['names']:record['names'].append(im.name)
  if str(old_path) not in record['original_paths']:record['original_paths'].append(str(old_path))
  local.append(rel)
 for font in bpy.data.fonts:
  if font.filepath and font.filepath!='<builtin>':
   raw=bytes(font.packed_file.data) if font.packed_file else Path(bpy.path.abspath(font.filepath)).read_bytes()
   dest=ROOT/'fonts'/Path(font.filepath).name;dest.parent.mkdir(exist_ok=True);dest.write_bytes(raw)
   font.filepath='//'+dest.relative_to(ROOT).as_posix()
   if not font.packed_file:font.pack()
 # Embedded viewing/painting notes may reference historic releases: preserve
 # their script bodies, add the current location and independent rebuild entry.
 for block in bpy.data.texts:
  code=block.as_string()
  note='# Current asset: this file in shell-v13. Rebuild: source/rebuild_delivery.py. Historical release names below describe provenance only.\n'
  if not code.startswith(note):block.clear();block.write(note+code)
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(stem+'.blend')))
 documents[stem]={'images':len(local),'all_packed':True,'all_relative_local_paths':True,'bake_uv_added_to':added}
(ROOT/'source/texture-manifest.json').write_text(json.dumps({'textures':manifest,'documents':documents},indent=2)+'\n')
print('CONSOLIDATION_PASS',len(manifest),'unique images,',sum(v['bytes'] for v in manifest.values()),'bytes',flush=True)
