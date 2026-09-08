"""Extract original grains and scalar recipes; never substitute preview thumbnails.
Run from any directory. Python standard library only. No image synthesis/editing.
"""
import hashlib
import json
import plistlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / 'assets/grayhaven/Aui_Vangogh_.brushset'
OUTPUT = Path(__file__).resolve().parents[1] / 'textures/aui-vangogh'
KEYS = ['name', 'authorName', 'bundledShapePath', 'bundledGrainPath', 'plotSpacing',
        'plotJitter', 'textureScale', 'textureRotation', 'textureBrightness',
        'textureContrast', 'grainDepth', 'dynamicsGlazedFlow', 'textureMovement',
        'textureApplication', 'textureZoom', 'textureOrientation',
        'dynamicsPressureSize', 'dynamicsPressureOpacity', 'dynamicsPressureMix',
        'dynamicsPressureShapeRoundness', 'dynamicsPressureShapeRoundnessMinimum',
        'dynamicsTiltSize', 'dynamicsTiltShapeRoundness', 'dynamicsTiltShapeRoundnessMinimum',
        'pencilTaperEndLength', 'pencilTaperSize', 'pencilTaperOpacity', 'dynamicsLoad',
        'dynamicsPressureSizeCurve', 'dynamicsPressureOpacityCurve', 'dynamicsPressureShapeRoundnessCurve']


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    recipes = []
    with zipfile.ZipFile(SOURCE) as archive:
        for path in archive.namelist():
            if not path.endswith('/Brush.archive'):
                continue
            objects = plistlib.loads(archive.read(path))['$objects']
            values = objects[1]
            recipe = {'archive_path': path}
            for key in KEYS:
                value = values.get(key)
                if isinstance(value, plistlib.UID):
                    value = objects[value.data]
                    if isinstance(value, dict) and 'points' in value:
                        points = objects[value['points'].data]['NS.objects']
                        value = [[float(n) for n in objects[u.data].strip('{}').split(',')] for u in points]
                recipe[key] = value
            grain_path = path.replace('Brush.archive', 'Grain.png')
            if grain_path in archive.namelist():
                data = archive.read(grain_path)
                filename = 'grain-' + hashlib.sha256(data).hexdigest()[:12] + '.png'
                (OUTPUT / filename).write_bytes(data)
                recipe['grain_file'] = filename
                recipe['grain_sha256'] = hashlib.sha256(data).hexdigest()
            recipe['shape_embedded'] = path.replace('Brush.archive', 'Shape.png') in archive.namelist()
            recipes.append(recipe)
    manifest = {
        'source': str(SOURCE.relative_to(ROOT)),
        'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'adaptation': 'Original grain data with Godot continuous deposition. Missing bundled tips are not reconstructed. No preview artwork used as a stamp.',
        'recipes': recipes,
    }
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Extracted {len(set(r["grain_file"] for r in recipes if "grain_file" in r))} original grains; {len(recipes)} recipes')


if __name__ == '__main__':
    main()
