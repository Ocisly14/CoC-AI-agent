"""Validate real Blender dependencies without relying on old release folders."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
results={}
for stem in ['bluebird_painterly_layered','bluebird_base','bluebird_painterly','bluebird_base_baked','bluebird_white']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/(stem+'.blend')))
 assert not bpy.data.libraries
 images=[]
 for im in bpy.data.images:
  if im.source=='VIEWER':continue
  assert im.filepath.startswith('//') and im.packed_file,(stem,im.name,im.filepath)
  p=Path(bpy.path.abspath(im.filepath)).resolve();assert p.is_relative_to(ROOT.resolve()) and p.is_file(),p
  assert bytes(im.packed_file.data)==p.read_bytes(),im.name
  for packed in im.packed_files:
   pp=Path(bpy.path.abspath(packed.filepath)).resolve();assert pp.is_relative_to(ROOT.resolve()) and pp.is_file(),(im.name,packed.filepath)
  images.append(str(p.relative_to(ROOT)))
 for f in bpy.data.fonts:assert f.filepath=='<builtin>' or f.packed_file
 arch=[o for o in bpy.context.scene.objects if o.get('architecture')];assert len(arch)==75
 results[stem]={'architecture_objects':75,'packed_relative_images':len(images),'missing_external_dependencies':[]}
(ROOT/'source/standalone-source-audit.json').write_text(json.dumps({'passed':True,'documents':results},indent=2)+'\n')
print('STANDALONE_SOURCE_PASS',json.dumps(results),flush=True)
