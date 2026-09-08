"""Regenerate the initial editable street-corner scene (Python standard library).

Run only to rebuild this baseline: it overwrites street_corner.tscn.
The imported building is preserved as a separate, replaceable scene instance.
"""
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parents[1]
resources, nodes = [], []


def resource(kind, name, properties):
    resources.append(f'[sub_resource type="{kind}" id="{name}"]\n{properties}\n')
    return f'SubResource("{name}")'


def node(name, kind, parent=None, properties="", instance=None):
    header = f'[node name="{name}"'
    if kind:
        header += f' type="{kind}"'
    if parent is not None:
        header += f' parent="{parent}"'
    if instance:
        header += f' instance={instance}'
    nodes.append(header + ']\n' + properties + '\n')


def color(hex_color):
    h = hex_color.lstrip('#')
    return 'Color(' + ', '.join(f'{int(h[i:i+2],16)/255:.5f}' for i in (0,2,4)) + ', 1)'


def material(name, shade, roughness=0.9):
    return resource('StandardMaterial3D', name,
                    f'albedo_color = {color(shade)}\nroughness = {roughness}')


def ground_material(name, base, secondary, paving=False):
    return resource('ShaderMaterial', name,
                    'shader = ExtResource("3")\n'
                    f'shader_parameter/base_color = {color(base)}\n'
                    f'shader_parameter/secondary_color = {color(secondary)}\n'
                    f'shader_parameter/paving = {str(paving).lower()}')


def vec(v):
    return 'Vector3(' + ', '.join(str(round(x, 6)) for x in v) + ')'


def box(name, parent, position, size, mat):
    mesh = resource('BoxMesh', 'mesh_' + name, f'material = {mat}\nsize = {vec(size)}')
    node(name, 'MeshInstance3D', parent, f'position = {vec(position)}\nmesh = {mesh}')


def panel_style(name, shade, border=None):
    props = f'bg_color = {color(shade)}\ncorner_radius_top_left = 3\ncorner_radius_top_right = 3\ncorner_radius_bottom_left = 3\ncorner_radius_bottom_right = 3'
    if border:
        props += f'\nborder_width_left = 1\nborder_width_top = 1\nborder_width_right = 1\nborder_width_bottom = 1\nborder_color = {color(border)}'
    return resource('StyleBoxFlat', name, props)


def margin(parent, amount=16):
    node('Margin', 'MarginContainer', parent, 'layout_mode = 2\n' + '\n'.join(
        f'theme_override_constants/margin_{side} = {amount}' for side in ['left','right','top','bottom']))
    return parent + '/Margin'


def label(name, parent, text, size=16, shade='E7DDC8', extra=''):
    text = text.replace('"', '\\"').replace('\n', '\\n')
    node(name, 'Label', parent,
         f'layout_mode = 2\nmouse_filter = 2\ntheme_override_colors/font_color = {color(shade)}\ntheme_override_font_sizes/font_size = {size}\ntext = "{text}"\n' + extra)


def button(name, parent, text, toggle=False):
    node(name, 'Button', parent,
         f'layout_mode = 2\ncustom_minimum_size = Vector2(100, 44)\ntext = "{text}"\n'
         f'toggle_mode = {str(toggle).lower()}')


asphalt = ground_material('asphalt', '505955', '62635A')
paving = ground_material('paving', 'A29B87', 'B2A88F', True)
lot = ground_material('lot', '858C79', '94977F')
curb = material('curb', 'B6AF9C')
edge = material('edge', '746F63')
paint = material('road_paint', 'B5A16A')
drain = material('drain', '444944', 0.76)

env = resource('Environment', 'environment',
    f'background_mode = 1\nbackground_color = {color("A4B7C2")}\n'
    f'ambient_light_source = 2\nambient_light_color = {color("AFC3DD")}\n'
    'ambient_light_energy = 0.55\nreflected_light_source = 2\n'
    'tonemap_mode = 0\ntonemap_exposure = 1.0\nadjustment_enabled = false\nadjustment_saturation = 1.0\nadjustment_contrast = 1.0')
font = resource('SystemFont', 'font', 'font_names = PackedStringArray("PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", "sans-serif")')
serif = resource('SystemFont', 'serif', 'font_names = PackedStringArray("Songti SC", "Noto Serif CJK SC", "serif")')
dark_panel = panel_style('dark_panel', '29332F', '5F6A5D')
paper_panel = panel_style('paper_panel', 'E7DDC8', 'C4B79E')
button_normal = panel_style('button_normal', '34413A', '5F6A5D')
button_hover = panel_style('button_hover', '46564A', '9DAB91')
button_pressed = panel_style('button_pressed', '6C6247', 'CDB98B')
focus = resource('StyleBoxFlat', 'focus', 'bg_color = Color(0, 0, 0, 0)\nborder_width_left = 2\nborder_width_top = 2\nborder_width_right = 2\nborder_width_bottom = 2\nborder_color = Color(0.88, 0.76, 0.49, 1)')
theme = resource('Theme', 'theme',
    f'default_font = {font}\ndefault_font_size = 16\n'
    f'Button/colors/font_color = {color("E7DDC8")}\n'
    f'Button/colors/font_pressed_color = {color("FFF3DB")}\n'
    f'Button/styles/normal = {button_normal}\nButton/styles/hover = {button_hover}\n'
    f'Button/styles/pressed = {button_pressed}\nButton/styles/hover_pressed = {button_pressed}\n'
    f'Button/styles/focus = {focus}')

node('BluebirdStreetCorner', 'Node3D', properties='script = ExtResource("1")')
node('WorldEnvironment', 'WorldEnvironment', '.', f'environment = {env}')
node('Lighting', 'Node3D', '.')
node('Sun', 'DirectionalLight3D', 'Lighting',
     'rotation_degrees = Vector3(-48, -32, 0)\nlight_color = Color(1, 0.94118, 0.83922, 1)\n'
     'light_energy = 1.10\nshadow_enabled = true\nshadow_opacity = 0.85\nlight_angular_distance = 0.65\nshadow_bias = 0.03\nshadow_blur = 2.0\n'
     'directional_shadow_max_distance = 85.0\ndirectional_shadow_blend_splits = true')

# Author metres are retained. Bluebird floor is raised to the sidewalk surface.
node('Bluebird', 'Node3D', '.', 'position = Vector3(-6, 0.18, 5)\nmetadata/place_id = "bluebird_diner"')
node('Architecture', None, 'Bluebird', instance='ExtResource("2")')
node('PickBody', 'StaticBody3D', 'Bluebird', 'collision_layer = 2\ncollision_mask = 0')
shape0 = resource('BoxShape3D', 'building_pick_lower', 'size = Vector3(11.8, 3.3, 9.8)')
shape1 = resource('BoxShape3D', 'building_pick_upper', 'size = Vector3(6, 2.9, 6)')
node('GroundFloor', 'CollisionShape3D', 'Bluebird/PickBody',
     f'position = Vector3(6, 1.65, -5)\nshape = {shape0}')
node('UpperFloor', 'CollisionShape3D', 'Bluebird/PickBody',
     f'position = Vector3(3, 4.8, -7)\nshape = {shape1}')

node('Streets', 'Node3D', '.')
box('Surroundings', 'Streets', (0,-0.36,0), (300,0.4,300), lot)
box('MainStreet', 'Streets', (0,-0.09,11), (52,0.18,8), asphalt)
box('SideStreet', 'Streets', (12,-0.09,-12), (8,0.18,38), asphalt)
node('Sidewalk', 'Node3D', '.')
box('DinerPavement', 'Sidewalk', (0,0.06,-0.5), (16,0.24,15), paving)
box('FrontCurb', 'Sidewalk', (0,0.035,7), (16.2,0.29,0.2), curb)
box('SideCurb', 'Sidewalk', (8,0.035,-0.5), (0.2,0.29,15), curb)
box('OppositeFront', 'Sidewalk', (0,0.045,16.15), (52,0.27,2.3), paving)
box('OppositeFrontCurb', 'Sidewalk', (0,0.035,15.08), (52,0.29,0.16), curb)
box('OppositeSide', 'Sidewalk', (17.15,0.045,-12), (2.3,0.27,38), paving)
box('OppositeSideCurb', 'Sidewalk', (16.08,0.035,-12), (0.16,0.29,38), curb)
node('RoadDetails', 'Node3D', '.')
for i in range(-8,9):
    # Aged, restrained lane markings, interrupted at the side-street junction.
    if 8 < i * 3 < 17:
        continue
    for j,z in enumerate([10.9,11.1]):
        box(f'MainLine_{i+8}_{j}', 'RoadDetails', (i*3,0.004,z), (2.85,0.006,0.065), paint)
for i in range(9):
    box(f'SideLine_{i}', 'RoadDetails', (12,0.004,2-i*3.5), (0.07,0.006,1.6), paint)
for x,z,rot in [(7.68,4.6,False),(4.8,6.68,True)]:
    prefix = 'FrontDrain' if rot else 'SideDrain'
    box(prefix, 'RoadDetails', (x,0.185,z), (0.75,0.014,0.28) if rot else (0.28,0.014,0.75), edge)
    for i in range(6):
        pos = (x-0.3+i*0.12,0.194,z) if rot else (x,0.194,z-0.3+i*0.12)
        box(prefix+str(i), 'RoadDetails', pos, (0.045,0.005,0.23) if rot else (0.23,0.005,0.045), drain)

az,el = math.radians(42),math.radians(31)
camera_pos = (math.sin(az)*math.cos(el)*45,1.7+math.sin(el)*45,math.cos(az)*math.cos(el)*45)
node('Camera3D', 'Camera3D', '.',
     f'position = {vec(camera_pos)}\nrotation_degrees = Vector3(-31, 42, 0)\n'
     'projection = 1\nsize = 23.0\nnear = 0.1\nfar = 180.0\ncurrent = true')

node('HUD', 'CanvasLayer', '.')
node('TopBar', 'PanelContainer', 'HUD',
     f'offset_left = 24.0\noffset_top = 24.0\noffset_right = 592.0\noffset_bottom = 98.0\n'
     f'theme = {theme}\ntheme_override_styles/panel = {dark_panel}')
parent = margin('HUD/TopBar',16)
node('Row','HBoxContainer',parent,'layout_mode = 2\ntheme_override_constants/separation = 24')
parent += '/Row'
label('Brand',parent,'GRAYHAVEN  /  灰港',18)
label('Time',parent,'晴天 · 日照预览',14,'BAC3B1','size_flags_horizontal = 10\nhorizontal_alignment = 2')

node('Caption','VBoxContainer','HUD',
     f'offset_left = 28.0\noffset_top = 117.0\noffset_right = 470.0\noffset_bottom = 188.0\n'
     f'mouse_filter = 2\ntheme = {theme}\ntheme_override_constants/separation = 5')
label('Title','HUD/Caption','蓝鸟餐厅 · 街角',30,'28332C',f'theme_override_fonts/font = {serif}')
label('Subtitle','HUD/Caption','北加州海岸，1985  /  场景样板',14,'3D493F')

node('Info','PanelContainer','HUD',
     f'visible = false\nanchors_preset = 1\nanchor_left = 1.0\nanchor_right = 1.0\n'
     f'offset_left = -308.0\noffset_top = 118.0\noffset_right = -24.0\noffset_bottom = 420.0\n'
     f'grow_horizontal = 0\ntheme = {theme}\ntheme_override_styles/panel = {paper_panel}')
parent = margin('HUD/Info',22)
node('Column','VBoxContainer',parent,'layout_mode = 2\ntheme_override_constants/separation = 16')
parent += '/Column'
label('Index',parent,'地点手记   /   01',14,'756447')
label('Title',parent,'蓝鸟餐厅',26,'29332F',f'theme_override_fonts/font = {serif}')
label('English',parent,'BLUEBIRD DINER',14,'756447')
label('Body',parent,'临街的玻璃门通向主街。\n\n堂座里，临窗绿皮卡座与长条柜台留着小镇繁荣年代的底子。咖啡和烤面包的香气，从清早一直暖到打烊。',17,'343C34',
      'custom_minimum_size = Vector2(240, 0)\nautowrap_mode = 3\ntheme_override_constants/line_spacing = 7')
label('Note',parent,'此样板展示建筑外观。',14,'756447')
button('Close',parent,'收起手记')

node('Controls','PanelContainer','HUD',
     f'anchors_preset = 2\nanchor_top = 1.0\nanchor_bottom = 1.0\noffset_left = 24.0\n'
     f'offset_top = -104.0\noffset_right = 592.0\noffset_bottom = -36.0\ngrow_vertical = 0\n'
     f'theme = {theme}\ntheme_override_styles/panel = {dark_panel}')
parent = margin('HUD/Controls',10)
node('Row','HBoxContainer',parent,'layout_mode = 2\ntheme_override_constants/separation = 10')
parent += '/Row'
button('Day',parent,'1  晴天',True)
button('Evening',parent,'2  暮色',True)
button('Reset',parent,'R  复位')
button('Info',parent,'I  地点手记',True)
node('Help','Label','HUD',
     f'anchors_preset = 2\nanchor_top = 1.0\nanchor_bottom = 1.0\noffset_left = 28.0\n'
     f'offset_top = -29.0\noffset_right = 960.0\noffset_bottom = -7.0\ngrow_vertical = 0\n'
     f'mouse_filter = 2\ntheme = {theme}\ntheme_override_colors/font_color = {color("2B382F")}\n'
     'theme_override_font_sizes/font_size = 14\ntext = "固定正交视角     滚轮 / 双指捏合 缩放     中键拖动 / 双指滑动 平移     点击建筑 查看"')

header = f'[gd_scene load_steps={len(resources)+4} format=3]\n\n'
external = ('[ext_resource type="Script" path="res://demos/bluebird/street_corner.gd" id="1"]\n'
            '[ext_resource type="PackedScene" path="res://demos/bluebird/assets/bluebird.glb" id="2"]\n'
            '[ext_resource type="Shader" path="res://demos/bluebird/ground.gdshader" id="3"]\n\n')
(ROOT/'street_corner.tscn').write_text(header + external + '\n'.join(resources) + '\n' + '\n'.join(nodes))
print(f'Wrote {len(nodes)} editable nodes to {ROOT / "street_corner.tscn"}')
