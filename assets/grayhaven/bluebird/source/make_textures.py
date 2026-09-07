"""Original deterministic pigment textures, not photographs or concept-board crops.
Layers remain separate. Opposite-edge strokes wrap for repeatable UV sampling.
Run with Python + Pillow before build_bluebird.py.
"""
from pathlib import Path
import random, json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'textures'
OUT.mkdir(exist_ok=True)
(OUT/'source').mkdir(exist_ok=True)
S = 512
SPECS = {
    'siding': ('8C9990', .82, 'wood'),
    'blue': ('496669', .78, 'wood'),
    'trim': ('C3B79D', .80, 'wood'),
    'wood': ('8A6B49', .72, 'wood'),
    'darkwood': ('514537', .85, 'wood'),
    'plaster': ('C5B99E', .93, 'plaster'),
    'roof': ('4B4E49', .91, 'wood'),
    'green': ('394F43', .58, 'leather'),
    'red': ('874C40', .59, 'leather'),
    'cloth': ('DED5BF', .94, 'cloth'),
    'stone': ('777E77', .92, 'plaster'),
    'iron': ('343838', .67, 'metal'),
}
manifest = {}
for index, (name, (color, rough, kind)) in enumerate(SPECS.items()):
    rng = random.Random(1985 + index)
    rgb = tuple(bytes.fromhex(color))
    ground = Image.new('RGB', (S,S), rgb)
    brush = Image.new('RGBA', (S,S))
    d = ImageDraw.Draw(brush)
    for i in range(410):
        x,y = rng.randrange(S),rng.randrange(S)
        w = rng.randint(40,240) if kind=='wood' else rng.randint(20,120)
        h = rng.randint(2,15) if kind=='wood' else rng.randint(8,65)
        delta = rng.randint(-37,31) if kind in ('wood','plaster') else rng.randint(-25,24)
        tone = tuple(max(0,min(255,v+delta)) for v in rgb)
        a = rng.randint(40,135)
        for dx in (-S,0,S):
            for dy in (-S,0,S):
                p=[(x+dx,y+dy),(x+dx+w*.22,y+dy-h*.24),(x+dx+w,y+dy+h*.1),
                   (x+dx+w*.87,y+dy+h*.86),(x+dx+w*.11,y+dy+h)]
                d.polygon(p,fill=(*tone,a))
    tooth = Image.new('RGBA',(S,S)); td=ImageDraw.Draw(tooth)
    for i in range(1800):
        x,y=rng.randrange(S),rng.randrange(S)
        tone = tuple(max(0,min(255,v+rng.choice([-12,12]))) for v in rgb)
        td.line((x,y,x+rng.randint(1,9),y),fill=(*tone, rng.randint(12,50)),width=1)
    ground.save(OUT/'source'/f'{name}_01_ground.png')
    brush.save(OUT/'source'/f'{name}_02_brush.png')
    tooth.save(OUT/'source'/f'{name}_03_pigment.png')
    result=Image.alpha_composite(Image.alpha_composite(ground.convert('RGBA'),brush),tooth).convert('RGB')
    result.save(OUT/f'{name}_basecolor.png')
    # Broad roughness variation, independent of any lighting direction.
    rmap=Image.new('L',(S,S),round(255*rough)); rd=ImageDraw.Draw(rmap)
    for i in range(80):
        x,y=rng.randrange(S),rng.randrange(S); w,h=rng.randint(20,130),rng.randint(4,35)
        value=round(255*max(.1,min(1,rough+rng.uniform(-.035,.035))))
        for dx in (-S,0,S):
            for dy in (-S,0,S): rd.rectangle((x+dx,y+dy,x+dx+w,y+dy+h),fill=value)
    rmap.save(OUT/f'{name}_roughness.png')
    manifest[name]={'baseColor':f'{name}_basecolor.png','roughness':f'{name}_roughness.png',
                    'size':[S,S], 'colorSpaces':{'baseColor':'sRGB','roughness':'Non-Color'},
                    'repeatMeters':1.6 if kind=='wood' else 1.1,
                    'sourceLayers':['ground','brush','pigment'], 'seed':1985+index}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Wrote {len(manifest)} layered, repeatable material sets to {OUT}')
