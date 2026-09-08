import bpy,json,hashlib,struct,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent
checks={}
def gh(o):return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world))).encode()).hexdigest()
def uh(o):return {u.name:hashlib.sha256(repr([tuple(v.uv) for v in u.data]).encode()).hexdigest() for u in o.data.uv_layers}
bpy.ops.wm.open_mainfile(filepath=str(BASE/'shell-v4/bluebird_exterior_detailed.blend'))
old={o.name:(gh(o),uh(o)) for o in bpy.data.objects if o.get('architecture')}
oldglass={o.name:[m.name for m in o.data.materials] for o in bpy.data.objects if o.get('role') in ['glass','sign'] and not any(m.name.startswith('DETAIL_OIL') for m in o.data.materials)}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_base.blend'))
arch=[o for o in bpy.data.objects if o.get('architecture')]
checks['base_83_objects_geometry_transforms_preserved']=len(arch)==83 and all(gh(o)==old[o.name][0] for o in arch)
checks['original_uv_channels_unchanged']=all(all(uh(o).get(n)==v for n,v in old[o.name][1].items()) for o in arch)
base_mats={m for o in arch for m in o.data.materials}
checks['seven_new_material_families']=len({m.get('v8_family') for m in base_mats if m.get('v8_family')})==7
checks['base_has_no_expressive_groups']=all(not any(n.type=='GROUP' and n.node_tree.name.startswith(('PFX_','TONE_')) for n in m.node_tree.nodes) for m in base_mats)
checks['new_base_images_active']=all(m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].links[0].from_node.image.name.startswith('V8_SOURCE_') for m in base_mats if m.get('v8_family'))
checks['weathered_v3_sources_active']=all('textures-weathered-v3/basecolor/' in m.node_tree.nodes['V8_REALIST_BASE'].image.filepath for m in base_mats if m.get('v8_family'))
manifest=json.loads((BASE/'textures-weathered-v3/manifest.json').read_text())
expected_hashes={x['family']:x['sha256'] for x in manifest['materials']}
checks['packed_base_images_match_generated_sources']=all(hashlib.sha256(m.node_tree.nodes['V8_REALIST_BASE'].image.packed_file.data).hexdigest()==expected_hashes[m['v8_family']] for m in base_mats if m.get('v8_family'))
checks['physical_material_uvs']=all('MaterialUVV8' in o.data.uv_layers for o in arch if any(m.get('v8_family') for m in o.data.materials))
checks['siding_20cm_courses']=all(abs(m['coverageMeters'][1]/9-.2)<1e-6 for m in base_mats if m.get('v8_family')=='ivory-clapboard')
checks['wainscot_20cm_boards']=all(abs(m['coverageMeters'][0]/6-.2)<1e-6 for m in base_mats if m.get('v8_family')=='teal-wainscot')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly_layered.blend'))
arch=[o for o in bpy.data.objects if o.get('architecture')]
checks['layered_geometry_preserved']=all(gh(o)==old[o.name][0] for o in arch)
checks['glass_and_lettering_preserved']=all([m.name for m in bpy.data.objects[name].data.materials]==mats for name,mats in oldglass.items())
def stamps(m,prefix):return [(n.node_tree.name,tuple(n.inputs['Center'].default_value),tuple(n.inputs['Size'].default_value),n.inputs['Angle'].default_value) for n in m.node_tree.nodes if n.type=='GROUP' and n.node_tree.name.startswith(prefix)]
wall=bpy.data.objects['L0_FRONT_low'].data.materials[0];sill=bpy.data.objects['D0_FRONT_WINDOW_JOINERY'].data.materials[0]
checks['wall_sill_continuous_marks']=bool(stamps(wall,'PFX_')) and stamps(wall,'PFX_')==stamps(sill,'PFX_')
checks['roof_flashing_continuous_marks']=stamps(bpy.data.objects['L0_LOW_ROOF'].data.materials[0],'TONE_')==stamps(bpy.data.objects['D0_KITCHEN_EXHAUST'].data.materials[0],'TONE_')
checks['both_facade_roof_layers_editable']=bool(stamps(wall,'PFX_')) and bool(stamps(bpy.data.objects['L1_ROOF'].data.materials[0],'TONE_'))
# Compare authored placements to previous working sources, not approximate visual similarity.
facade=json.loads((ROOT/'source/facade-placements.json').read_text())['patches'];prior=json.loads((BASE/'shell-v6/source/placements.json').read_text())['patches']
roof=json.loads((ROOT/'source/roof-placements.json').read_text())['patches'];priorroof=json.loads((BASE/'shell-v7/source/placements.json').read_text())['patches']
checks['authored_facade_and_roof_placements_preserved']=facade==prior and roof==priorroof
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'bluebird_painterly.blend'))
arch=[o for o in bpy.data.objects if o.get('architecture')]
checks['baked_geometry_preserved']=all(gh(o)==old[o.name][0] for o in arch)
checks['baked_original_uvs_preserved']=all(all(uh(o).get(n)==v for n,v in old[o.name][1].items()) for o in arch)
checks['six_packed_color_atlases']=all(bpy.data.images.get('V8_BAKED_'+c) and bpy.data.images['V8_BAKED_'+c].packed_file for c in ['ground','upper','frames','roof','details','interior'])
checks['uv_coordinates_finite']=all(math.isfinite(x) for o in arch for uv in o.data.uv_layers for item in uv.data for x in item.uv)
consistent=True;nonzero=True
for o in arch:
 if 'BakeV8' not in o.data.uv_layers:continue
 for p in o.data.polygons:
  if not o.data.materials[p.material_index].node_tree.nodes.get('V8_DELIVERY_COLOR') or p.area<1e-12:continue
  positions={};uvs=[]
  for li in p.loop_indices:
   co=tuple(round(x,6) for x in o.data.vertices[o.data.loops[li].vertex_index].co);uv=o.data.uv_layers['BakeV8'].data[li].uv;uvs.append(uv)
   if co in positions and (uv-positions[co]).length>1e-6:consistent=False
   positions[co]=uv.copy()
  area=abs(sum(uvs[i].x*uvs[(i+1)%len(uvs)].y-uvs[(i+1)%len(uvs)].x*uvs[i].y for i in range(len(uvs))))/2
  nonzero=nonzero and area>1e-15
checks['repeated_vertices_have_consistent_bake_uvs']=consistent
checks['all_visible_material_faces_have_atlas_area']=nonzero
raw=(ROOT/'bluebird_painterly.glb').read_bytes();g=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
tri=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
checks['56034_export_triangles']=tri==56034
checks['self_contained_glb']=all('uri' not in b for b in g['buffers']) and all('bufferView' in i for i in g['images'])
bindings=[]
for mesh in g['meshes']:
 for prim in mesh['primitives']:
  tex=g['materials'][prim['material']].get('pbrMetallicRoughness',{}).get('baseColorTexture')
  if tex:
   channel=tex.get('extensions',{}).get('KHR_texture_transform',{}).get('texCoord',tex.get('texCoord',0));bindings.append(f'TEXCOORD_{channel}' in prim['attributes'])
checks['glb_color_uv_bindings_valid']=bool(bindings) and all(bindings)
checks={k:bool(v) for k,v in checks.items()}
report={'passed':all(checks.values()),'checks':checks,'glbBytes':len(raw),'triangles':tri,'scope':'Model, active material layers, geometry/UV preservation and self-contained GLB. Visual QA uses actual renders; runtime performance not measured.'}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
assert report['passed']
