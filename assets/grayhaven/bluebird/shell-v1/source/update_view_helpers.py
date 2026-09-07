"""Update only embedded viewing helpers; do not rebuild geometry or materials."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for filename in ['bluebird_shell_textured.blend','bluebird_shell_white.blend']:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/filename))
    text=bpy.data.texts['README_AND_VIEWS.py']
    source=text.as_string()
    if '_white.blend' not in source:
        source=source.replace(' o.hide_render=hide;', ' if o["role"] == "glass" and bpy.data.filepath.endswith("_white.blend"): hide=True\n o.hide_render=hide;')
        compile(source,'README_AND_VIEWS.py','exec')
        text.clear();text.write(source)
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/filename))
print('VIEW_HELPERS_UPDATED')
