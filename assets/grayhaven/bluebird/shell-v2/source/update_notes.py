"""Update embedded usage notes without changing appearance or geometry."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for filename in ['bluebird_shell_layered.blend','bluebird_shell_textured.blend']:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/filename))
    text=bpy.data.texts.get('PAINT_LAYER_README.py')
    if text:
        value=text.as_string().replace('Change these, then use source/finish_paint.py baking section to regenerate delivery.','Change these, save this layered file, then run source/bake_export.py to regenerate delivery.')
        text.clear();text.write(value)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/filename))
exec(compile((ROOT/'source/check_shell.py').read_text(),str(ROOT/'source/check_shell.py'),'exec'))
