from pathlib import Path
import shutil,re
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT.parent/'shell-v4/index.html').read_text()
s=s.replace('Bluebird · 外部构造细化','Bluebird · 大色块油画').replace('BLUEBIRD / EXTERIOR 04','BLUEBIRD / BROAD PAINT 05').replace('蓝鸟餐厅<br>外部构造细化','蓝鸟餐厅<br>大色块与骨白干刷')
s=s.replace('木框门头、竖牌、排水管、雨棚与门窗细部。切换版本，比较同一视角下的变化。','大尺度灰绿、灰紫与暖赭色块，加上局部骨白墙边笔刷。切换版本查看同机位变化。')
s=s.replace('<option value="v4">新版 · 外部构造细化</option>','<option value="v5">新版 · 大色块与骨白干刷</option><option value="v4">上一版 · 外部构造细化</option>')
s=s.replace('<option value="street">','<option value="paint">大笔触与墙边近景</option><option value="street">',1)
s=s.replace('外观前后对比与细节图','油画前后对比与笔刷源图').replace('bluebird_exterior_detailed.blend','bluebird_painterly_layered.blend').replace('bluebird_exterior_detailed.glb','bluebird_painterly.glb')
s=s.replace('沿用原有建筑主体与局部油画材质。新增固定门头、双面竖牌、门扇、门灯、檐沟、落水管、窗台和屋顶通风管；本轮没有添加室内陈设。','沿用上一版完整建筑。新色块只作用在选定墙面，骨白干刷集中于部分墙边和墙脚；门头、管线、窗套及室内保留原材质。')
s=s.replace('const views={','const views={paint:{pos:[16,8.5,1],target:[5.5,4.45,-6],h:6.8},')
s=s.replace("version='v4'","version='v5'").replace("mode==='entry'?7.5/a:","mode==='paint'?8.5/a:mode==='entry'?7.5/a:")
s=s.replace("root.visible=version==='v4'","root.visible=['v4','v5'].includes(version)")
s=s.replace("if(root!==detailRoot||version==='v4')","if(root!==detailRoot||['v4','v5'].includes(version))")
s=s.replace("o.material=white?clay:o.userData.originalMaterial", "o.material=white?clay:paintedMaterial(o)")
s=s.replace("({v4:'外部细化'","({v5:'大色块与骨白干刷',v4:'外部细化'").replace('versions:4','versions:5')
s=s.replace("details:'./bluebird_exterior_details.glb'","details:'../shell-v4/bluebird_exterior_details.glb'")
s=s.replace("const loader=new GLTFLoader(),pending={};",'''const loader=new GLTFLoader(),pending={};
let paintMaps;
async function loadPaintMaps(){
 if(paintMaps)return paintMaps;
 if(pending.paint)return pending.paint;
 pending.paint=(async()=>{
  const tx=new THREE.TextureLoader();
  const maps=await Promise.all(['ground','upper'].map(k=>tx.loadAsync('./atlases/'+k+'-basecolor.png')));
  for(const t of maps){t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;}
  paintMaps={ground:maps[0],upper:maps[1]};return paintMaps;
 })();
 try{return await pending.paint;}finally{delete pending.paint;}
}
const paintedMaterials=new Map();
function paintedMaterial(o){
 const old=o.userData.originalMaterial;
 if(version!=='v5'||!paintMaps)return old;
 const cat=old.name.startsWith('PAINT_ground_')?'ground':old.name.startsWith('PAINT_upper_')?'upper':null;
 if(!cat)return old;
 if(!paintedMaterials.has(old.uuid)){
  const m=old.clone();m.map=paintMaps[cat].clone();
  m.map.channel=old.map.channel;m.map.flipY=old.map.flipY;
  m.map.offset.copy(old.map.offset);m.map.repeat.copy(old.map.repeat);m.map.center.copy(old.map.center);m.map.rotation=old.map.rotation;
  m.map.wrapS=old.map.wrapS;m.map.wrapT=old.map.wrapT;m.map.needsUpdate=true;
  m.needsUpdate=true;paintedMaterials.set(old.uuid,m);
 }
 return paintedMaterials.get(old.uuid);
}''')
s=s.replace("loadModel(chosen==='v4'?'v3':chosen),...(chosen==='v4'?[loadModel('details')]:[])","loadModel(['v4','v5'].includes(chosen)?'v3':chosen),...(['v4','v5'].includes(chosen)?[loadModel('details')]:[]),...(chosen==='v5'?[loadPaintMaps()]:[])")
(ROOT/'index.html').write_text(s)
shutil.copy2(ROOT.parent/'shell-v4/packed-assets.js',ROOT/'packed-assets.js')
s=(ROOT.parent/'shell-v4/compare.html').read_text().replace('外部构造细化','大色块与骨白干刷').replace('外部构造对照','油画色块对照').replace('../shell-v3/previews/01-textured-exterior.png','../shell-v4/previews/01-exterior.png')
s=s.replace('比较新增构件与原建筑','比较局部大色块、骨白墙边和上一版材质').replace('>外部细化<','>大色块与骨白干刷<').replace('>细化前<','>上一版材质<')
a=s.index('<h2>入口与屋面</h2>');b=s.index('<h2>街道与立面</h2>',a)
s=s[:a]+'''<h2>大笔触与骨白墙边</h2><figure><img src="previews/10-paint-detail.png" alt="大色块覆盖部分木漆，墙边有骨白干刷"><figcaption>局部实色核心、破碎边缘，以及色块之间保留的旧木漆。</figcaption></figure>
<h2>本次使用的笔刷</h2><div class="grid"><figure><img src="layers/broad-pigment-black.png" alt="六种同色系有明暗变化的大色块笔触"><figcaption>新绘制的大色块；黑底在材质中作为零覆盖区域。</figcaption></figure><figure><img src="layers/white-edge-brush.png" alt="复用之前绘制的白色干刷遮罩"><figcaption>复用旧白色笔刷，赋予骨白颜料颜色，放在局部墙边。</figcaption></figure></div>
''' + s[b:]
s=s.replace('几何承担厚度、连接和轮廓；原油画贴图承担木纹、磨损与色块；光照承担投影和体积；网页控件只负责版本与观察视角切换。','建筑几何保持不变。大色块与骨白边缘烘焙进新的墙面基色图，原木漆在选区外保留；动态光照继续承担体积和投影。')
(ROOT/'compare.html').write_text(s)
