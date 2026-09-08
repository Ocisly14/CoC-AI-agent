"""Update existing authored shadow volumes from current GLB; leave art maps intact."""
import json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path):
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
 return json.loads(raw[20:20+size]),raw[28+size:]

def positions(doc,binary,mesh):
 result=[]
 for prim in mesh['primitives']:
  a=doc['accessors'][prim['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']]
  assert a['componentType']==5126 and a['type']=='VEC3'
  start=v.get('byteOffset',0)+a.get('byteOffset',0)
  for i in range(a['count']):result.append(struct.unpack_from('<3f',binary,start+i*v.get('byteStride',12)))
 return result

doc,binary=read(ROOT/'bluebird_painterly.glb')
nodes={n['name']:n for n in doc['nodes'] if 'mesh' in n}
def bounds(name):
 node=nodes[name]
 assert not any(k in node for k in ['matrix','translation','rotation','scale']), 'Bake geometry transforms before updating authored caster boxes'
 ps=positions(doc,binary,doc['meshes'][node['mesh']])
 return [[min(p[i] for p in ps) for i in range(3)],[max(p[i] for p in ps) for i in range(3)]]
lower=round(bounds('L0_LOW_ROOF')[1][1],5);upper=round(bounds('L1_ROOF')[1][1],5)
path=ROOT/'control-maps/manifest.json';r=json.loads(path.read_text())
for c in r['brush_casters']:
 name=c['name']
 if name.startswith('lower_') or name.startswith('entry_chamfer_'):c['max'][1]=lower
 elif name=='upper_mass':c['min'][1]=lower;c['max'][1]=upper
 elif name in nodes:c['min'],c['max']=bounds(name)
r['geometry_revision']='Current v13 GLB geometry; independent idempotent height/bounds update, existing authored mass shapes retained'
path.write_text(json.dumps(r,indent=2)+'\n')
print('CONTROL_GEOMETRY_PASS',len(r['brush_casters']),'volumes; source is current v13 GLB')
