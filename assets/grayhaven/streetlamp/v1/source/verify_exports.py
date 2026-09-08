"""Compare every exported vertex attribute and oriented triangle, plus image embedding."""
from pathlib import Path
import json, struct, hashlib

root = Path(__file__).resolve().parents[1]
def read(name):
    raw = (root/name).read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+length]), raw[28+length:]

def array(document, payload, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    components = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
    fmt = {5123:'H',5125:'I',5126:'f'}[accessor['componentType']]
    return struct.unpack_from('<'+fmt*accessor['count']*components, payload, offset)

def triangles(indices):
    result=[]
    for i in range(0,len(indices),3):
        t=indices[i:i+3]
        result.append(min(t,t[1:]+t[:1],t[2:]+t[:2]))
    return sorted(result)

a, ab = read('streetlamp-base.glb')
b, bb = read('streetlamp-painted.glb')
assert len(a['meshes']) == len(b['meshes']) == 13
count=0
for am,bm in zip(a['meshes'],b['meshes']):
    for ap,bp in zip(am['primitives'],bm['primitives']):
        assert ap['attributes'].keys() == bp['attributes'].keys()
        for attribute in ap['attributes']:
            assert array(a,ab,ap['attributes'][attribute]) == array(b,bb,bp['attributes'][attribute]), attribute
            count+=1
        # Exporters can reorder the bulb triangles without changing the geometry.
        assert triangles(array(a,ab,ap['indices'])) == triangles(array(b,bb,bp['indices']))
        count+=1
for doc in [a,b]:
    assert len(doc['images']) == 1 and 'bufferView' in doc['images'][0]

textures=['cast-iron-base.png','quiet-pigment.png','iron-base-atlas.png','iron-painted-atlas.png','oil-overlay-mask.png']
report={'passed':True,'attributeAndTriangleComparisons':count,'unchangedVerticesNormalsUVAndOrientedTriangles':True,'embeddedImagesPerGlb':1,'textures':{}}
for name in textures:
    raw=(root/'textures'/name).read_bytes()
    report['textures'][name]={'pixels':struct.unpack_from('>II',raw,16),'sha256':hashlib.sha256(raw).hexdigest()}
(root/'source/export-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
