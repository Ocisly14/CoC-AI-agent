"""Checks exported artifact integrity and source-module identity, not aesthetic quality."""
import json, struct, math
from pathlib import Path
R=Path(__file__).resolve().parents[1]
b=(R/'bluebird_diner.glb').read_bytes()
magic,version,size=struct.unpack_from('<4sII',b)
assert (magic,version,size)==(b'glTF',2,len(b))
ln,kind=struct.unpack_from('<I4s',b,12);assert kind==b'JSON'
g=json.loads(b[20:20+ln]);assert g['asset']['version']=='2.0'
manifest=json.loads((R/'manifest.json').read_text())
ids={n.get('extras',{}).get('itemId') for n in g['nodes']} - {None}
expected=set()
for room in ['dining','kitchen','upstairs']:
    data=json.loads((R.parents[2]/'testmods/grayhaven/Grayhaven_Scenarios'/f'SCN_bluebird_{room}.json').read_text())
    expected.update(i['id'] for i in data['references']['items'])
assert ids==expected=={i['id'] for i in manifest['items']} and len(ids)==40
assert all('pivotNativeMeters' in n.get('extras',{}) for n in g['nodes'] if n.get('extras',{}).get('itemId'))
images=g.get('images',[]);assert len(images)>=24
for image in images:assert 'bufferView' in image and image.get('mimeType')=='image/png'
for a in g['accessors']:
    for key in ['min','max']:
        if key in a:assert all(math.isfinite(v) for v in a[key])
triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
assert triangles==manifest['triangles']
roles={n.get('extras',{}).get('role') for n in g['nodes']}
assert {'roof','wall_low','wall_upper','floor','stairs','contents','fixtures'} <= roles
for n in ['01_exterior','02_ground_cutaway','03_residence','04_kitchen','05_stew_pot','06_exterior_dusk']:
    p=R/'previews'/f'{n}.png';assert p.stat().st_size>10000 and p.read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
assert (R/'bluebird_diner.blend').stat().st_size>100000
report={'result':'pass','canonicalItems':len(ids),'triangles':triangles,'meshes':len(g['meshes']),
        'embeddedImages':len(images),'glbBytes':len(b),'previewCount':6,
        'scope':'GLB binary structure, embedded textures, finite accessor bounds, exact canonical identity coverage, semantic cutaway roles and output completeness. Not runtime/performance or aesthetic certification.'}
(R/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
