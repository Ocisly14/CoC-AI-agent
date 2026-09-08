"""Validate actual GLB payloads and preserve the frozen pre-cleanup painting deliveries."""
import json,struct,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path):
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
 return json.loads(raw[20:20+size]),raw[28+size:]
def images(doc,binary):
 out={}
 for im in doc['images']:
  v=doc['bufferViews'][im['bufferView']];start=v.get('byteOffset',0)
  out[im['name']]=hashlib.sha256(binary[start:start+v['byteLength']]).hexdigest()
 return out
def positions(doc,binary,mesh):
 result=[]
 for prim in mesh['primitives']:
  a=doc['accessors'][prim['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']]
  assert a['componentType']==5126 and a['type']=='VEC3'
  start=v.get('byteOffset',0)+a.get('byteOffset',0)
  for i in range(a['count']):result.append(struct.unpack_from('<3f',binary,start+i*v.get('byteStride',12)))
 return result
report={}
for stem in ('bluebird_base_baked','bluebird_painterly'):
 reference=json.loads((ROOT/'source/delivery-reference.json').read_text())[stem];doc,binary=read(ROOT/(stem+'.glb'))
 assert reference['images']==images(doc,binary),'Embedded painting pixels changed'
 assert len(doc['meshes'])==75 and sum(len(m['primitives']) for m in doc['meshes'])==167
 assert len(doc['images'])==10
 assert not any('FASCIA' in n.get('name','') for n in doc['nodes'])
 for m in doc['materials']:
  if m.get('name','').startswith('OilLettering_'):assert m['alphaMode']=='MASK'
 meshes={n['name']:doc['meshes'][n['mesh']] for n in doc['nodes'] if 'mesh' in n};roofs={}
 for name,bounds in [('L0_LOW_ROOF',([-0.1,3.2,-10.1],[12.1,3.31,0.1])),('L1_ROOF',([-0.1,5.82,-10.1],[6.1,5.94,-3.9]))]:
  ps=positions(doc,binary,meshes[name]);actual=[[min(p[i] for p in ps) for i in range(3)],[max(p[i] for p in ps) for i in range(3)]]
  assert all(abs(actual[r][i]-bounds[r][i])<1e-4 for r in range(2) for i in range(3)),actual
  roofs[name]=actual
 report[stem]=dict(passed=True,meshes=75,surfaces=167,identical_embedded_images=10,roof_bounds_godot=roofs)
(ROOT/'source/export-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print('V13_EXPORT_PASS: both deliveries retain all 10 pre-cleanup paintings, 75 meshes and 167 surfaces; corrected roofs present in binary buffers')
