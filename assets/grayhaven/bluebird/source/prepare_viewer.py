"""Copy only the viewer's six required local Three.js modules; no network access."""
from pathlib import Path
import shutil
R=Path(__file__).resolve().parents[1]
S=R.parents[2]/'client/node_modules/three'
for name in ['build/three.module.js','build/three.core.js','examples/jsm/controls/OrbitControls.js','examples/jsm/environments/RoomEnvironment.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/utils/BufferGeometryUtils.js','LICENSE']:
    dst=R/'viewer-vendor'/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(S/name,dst)
print('Viewer dependencies ready in isolated asset directory.')
