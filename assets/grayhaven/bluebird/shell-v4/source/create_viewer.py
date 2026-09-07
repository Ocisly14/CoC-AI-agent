from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT.parent/'shell-v3/index.html').read_text()
s=s.replace('Bluebird · 局部油画叠加','Bluebird · 外部构造细化').replace('BLUEBIRD / LOCAL PAINT 03','BLUEBIRD / EXTERIOR 04').replace('局部油画叠加<br>前后对照','蓝鸟餐厅<br>外部构造细化').replace('以原基础贴图为底，只在少量选定区域叠加油漆和粗笔触。遮罩外保留原色与小细节。','木框门头、竖牌、排水管、雨棚与门窗细部。切换版本，比较同一视角下的变化。')
s=s.replace('材质版本<select','模型版本<select').replace('<option value="v3">新版 · 局部叠加</option>','<option value="v4">新版 · 外部构造细化</option><option value="v3">细化前 · 局部油画</option>')
s=s.replace('<option value="ground">','<option value="street">街道视角</option><option value="entry">门头与入口近景</option><option value="roof">屋檐与管线近景</option><option value="ground">',1)
s=re.sub(r'<div class="links">.*?</div><details>', '<div class="links"><a href="compare.html">外观前后对比与细节图</a><a href="previews/03-entry-detail.png" target="_blank">入口近景渲染</a><a href="previews/08-ground-cutaway.png" target="_blank">一楼剖视渲染</a><a href="bluebird_exterior_detailed.blend" download>下载 Blender 模型</a><a href="bluebird_exterior_detailed.glb" download>下载完整 GLB</a><a href="README.md">制作说明</a></div><details>',s)
s=s.replace('墙体、楼板、屋顶、门窗洞口与窗套、固定雨棚、楼梯和洞口护栏。入口与室内门保留为空洞。','沿用原有建筑主体与局部油画材质。新增固定门头、双面竖牌、门扇、门灯、檐沟、落水管、窗台和屋顶通风管；本轮没有添加室内陈设。')
s=s.replace("const views={", "const views={street:{pos:[21,10.7,22],target:[6,2.6,-3.5],h:15.5},entry:{pos:[17,5.3,8],target:[10.38,2.45,-.65],h:6},roof:{pos:[19,14,9],target:[8.5,3.5,-4.4],h:9.8},")
s=s.replace("let assets={},asset,version='v3'", "let assets={},asset,detailRoot,version='v4'")
s=s.replace("mode==='exterior'?17/a:","mode==='entry'?7.5/a:mode==='roof'?12/a:mode==='street'?19/a:mode==='exterior'?18/a:")
a=s.index('function visibility()');b=s.index('function setView()',a)
s=s[:a]+'''function visibility(){
 if(!asset)return;
 const white=document.querySelector('#white').checked,showGlass=document.querySelector('#glass').checked;
 triangles=0;meshCount=0;
 for(const root of [asset,...(detailRoot?[detailRoot]:[])]){
  if(root===detailRoot)root.visible=version==='v4';
  root.traverse(o=>{
   const d=o.userData;
   if(d.architecture){let hide=false;
    if(mode==='ground'||mode==='plan')hide=d.floor===1||['roof','roof_edge'].includes(d.role)||(['front','right','corner'].includes(d.side)&&d.band==='high');
    if(mode==='upper')hide=(d.floor===0&&d.role!=='stair')||['roof','roof_edge'].includes(d.role)||(['front','right','corner'].includes(d.side)&&(['wall','frame','glass'].includes(d.role)||d.exteriorDetail));
    if(d.role==='glass'&&(white||!showGlass))hide=true;
    o.visible=!hide;
   }
   if(o.isMesh){o.material=white?clay:o.userData.originalMaterial;if(root!==detailRoot||version==='v4'){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;meshCount++;}}
  });
 }
 status.textContent=({v4:'外部细化',v3:'细化前',v2:'整面覆色',v1:'基础贴图'}[version])+' · '+(white?'白模':'油画材质')+' · '+Math.round(triangles).toLocaleString()+' 三角形';
 window.bluebirdShellQA={loaded:true,version,meshCount,triangles,architectureOnly:true,versions:4};
}
''' + s[b:]
a=s.index('const loader=new GLTFLoader();');b=s.index("document.querySelector('#light').onchange",a)
s=s[:a]+'''const HOSTED=false;
const loader=new GLTFLoader(),pending={};
const modelURLs={v3:'../shell-v3/bluebird_shell_textured.glb',v1:'../shell-v1/bluebird_shell_textured.glb',v2:'../shell-v2/bluebird_shell_textured.glb',details:'./bluebird_exterior_details.glb'};
async function loadModel(key){
 if(key==='details'&&detailRoot)return detailRoot;
 if(assets[key])return assets[key];
 if(pending[key])return pending[key];
 pending[key]=(async()=>{
  let gltf;
  if(HOSTED&&key!=='details'){
   const {bytes}=await readPacked(modelURLs[key],(done,total)=>{status.textContent='正在载入建筑 '+Math.round(done/total*100)+'%';});
   gltf=await loader.parseAsync(bytes.buffer,'');
  }else gltf=await loader.loadAsync(modelURLs[key]);
  const root=gltf.scene;root.visible=false;scene.add(root);
  root.traverse(o=>{if(o.isMesh){o.castShadow=o.material.name!=='glass'&&!o.userData.lettering;o.receiveShadow=true;o.userData.originalMaterial=o.material;}});
  if(key==='details')detailRoot=root;else assets[key]=root;
  return root;
 })();
 try{return await pending[key];}finally{delete pending[key];}
}
async function chooseVersion(){
 version=document.querySelector('#version').value;const chosen=version;
 try{
  status.textContent='正在载入模型…';
  const [root]=await Promise.all([loadModel(chosen==='v4'?'v3':chosen),...(chosen==='v4'?[loadModel('details')]:[])]);
  if(chosen!==version)return;
  Object.values(assets).forEach(a=>a.visible=false);asset=root;asset.visible=true;visibility();
 }catch(e){if(chosen===version)status.textContent='载入失败，请重新选择版本重试，或查看静态渲染。';}
}
document.querySelector('#version').onchange=chooseVersion;
chooseVersion();
''' + s[b:]
s=s.replace("import * as THREE from 'three';", "import * as THREE from 'three';\nimport {readPacked} from './packed-assets.js';")
(ROOT/'index.html').write_text(s)
