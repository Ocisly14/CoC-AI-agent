"""Build a packed, appendable Blender material library and neutral UV samples.

Run with Blender --background --python this_file.py. Does not edit raster sources.
"""
import bpy, json, math, struct, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'manifest.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1800
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
world = bpy.data.worlds.new('Neutral World')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.65, .65, .65, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .45
scene.world = world

def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4

def solid(name, rgb):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = tuple(linear(c) for c in rgb) + (1,)
    bsdf.inputs['Roughness'].default_value = .9
    return mat

paper = solid('Display / bone paper', (.78, .75, .67))
ink = solid('Display / charcoal', (.14, .16, .17))

def plane(name, x, y, z, width, height, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x,y,z),(x+width,y,z),(x+width,y+height,z),(x,y+height,z)], [], [(0,1,2,3)])
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for loop, coord in zip(uv.data, [(0,0),(1,0),(1,1),(0,1)]):
        loop.uv = coord
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

def label(body, x, y, size=.115):
    curve = bpy.data.curves.new('Label', 'FONT')
    curve.body = body
    curve.size = size
    obj = bpy.data.objects.new(body, curve)
    scene.collection.objects.link(obj)
    obj.location = (x,y,.035)
    obj.data.materials.append(ink)

materials = []
checks = []
for i, entry in enumerate(manifest['entries']):
    path = ROOT / entry['path']
    raw = path.read_bytes()
    width, height = struct.unpack('>II', raw[16:24])
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'sRGB'
    image.pack()
    image.filepath = '//' + entry['path']
    mat = bpy.data.materials.new('BB_OIL_' + entry['id'])
    mat.use_nodes = True
    mat.use_fake_user = True
    mat.asset_mark()
    mat.asset_data.description = entry['name'] + ' / dedicated UV oil basecolor; see manifest'
    mat['uv_width_m'], mat['uv_height_m'] = entry['size']
    mat['tiling'] = 'dedicated panel; no automatic repetition'
    mat['basecolor_source'] = entry['path']
    tree = mat.node_tree
    bsdf = tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = entry['roughness']
    bsdf.inputs['Metallic'].default_value = entry['metalness']
    bsdf.inputs['Specular IOR Level'].default_value = .28
    bsdf.location = (0,0)
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Linear'
    texture.extension = 'EXTEND'
    texture.label = 'PAINTED COLOR ONLY / no noise or auto-bump'
    texture.location = (-300,0)
    uv = tree.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    uv.location = (-520,0)
    tree.links.new(uv.outputs['UV'], texture.inputs['Vector'])
    tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    materials.append((mat, texture, bsdf))
    x, y = (i % 5) * 2.35, 3.3 - (i // 5) * 2.7
    # Comparison squares show every source pixel. Separate off-camera samples
    # retain the actual proposed aspect and metric UV coverage.
    plane(entry['id'] + ' / comparison', x,y,.05,2.1,2.1,mat)
    label(entry['id'].upper(),x,y-.21,.102)
    label('UV %.2f x %.2f m | rough %.2f' % (*entry['size'], entry['roughness']),x,y-.4,.08)
    physical = plane(entry['id'] + ' / metric UV sample',20+(i%5)*3.3,(i//5)*4,0,*entry['size'],mat)
    physical['purpose'] = 'authoring coverage at real scale; unmodified 0..1 UV'
    checks.append({'id':entry['id'],'resolution':[width,height], 'sha256':hashlib.sha256(raw).hexdigest(),
                   'colorSpace':image.colorspace_settings.name,'packed':bool(image.packed_file),
                   'roughness':entry['roughness'],'normalConnected':bsdf.inputs['Normal'].is_linked})

plane('Display backing',-.35,-.05,-.01,12.25,6.3,paper)
label('BLUEBIRD / OIL-PAINTED MATERIALS',0,5.87,.24)
label('10 dedicated basecolors | square comparison samples | full UV scale samples at right in the .blend',0,5.56,.105)
lamp = bpy.data.lights.new('Neutral softbox','AREA')
lamp.energy = 850
lamp.shape = 'DISK'
lamp.size = 9
obj = bpy.data.objects.new('Neutral softbox',lamp)
scene.collection.objects.link(obj)
obj.location = (5.8,3,10)
camera_data = bpy.data.cameras.new('Material comparison')
camera = bpy.data.objects.new('Material comparison',camera_data)
scene.collection.objects.link(camera)
camera.location = (5.85,3,18)
camera.rotation_euler = (Vector((5.85,3,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 12.3
scene.camera = camera
(ROOT/'previews').mkdir(exist_ok=True)

# Render unlit source-color proof, then restore Principled for the actual library.
for mat, texture, bsdf in materials:
    tree = mat.node_tree
    emission = tree.nodes.new('ShaderNodeEmission')
    tree.links.new(texture.outputs['Color'],emission.inputs['Color'])
    tree.links.new(emission.outputs[0],tree.nodes.get('Material Output').inputs['Surface'])
scene.render.filepath = str(ROOT/'previews'/'01-basecolor-proof.png')
bpy.ops.render.render(write_still=True)
for mat, texture, bsdf in materials:
    tree = mat.node_tree
    for node in list(tree.nodes):
        if node.bl_idname == 'ShaderNodeEmission': tree.nodes.remove(node)
    tree.links.new(bsdf.outputs[0],tree.nodes.get('Material Output').inputs['Surface'])
scene.render.filepath = str(ROOT/'previews'/'02-neutral-materials.png')
bpy.ops.render.render(write_still=True)

for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_oil_materials.blend'))
report = {'blender':bpy.app.version_string,'checks':checks,'previews':['01-basecolor-proof.png','02-neutral-materials.png'],
          'limitations':['UV square comparisons are not uniform texel density; metric samples are separate',
                         'No full diner, moving-camera or game-runtime validation in this package',
                         'No seamless tiling, normal, displacement, or spatial roughness maps']}
(ROOT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('OIL_LIBRARY_OK',len(checks),'packed basecolors',flush=True)
