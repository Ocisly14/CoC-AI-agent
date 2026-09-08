import {makeRenderer} from "./editor-renderer.mjs";
import {defaultAdjustments,clamp,transformPoint,localPoint,validateProject} from './editor-core.mjs';
const $=id=>document.getElementById(id),view=$('view'),ctx=view.getContext('2d'),workspace=$('workspace');
const imageBank=new Map(), cache=new Map(),sceneCanvas=document.createElement('canvas'),sceneCtx=sceneCanvas.getContext('2d');
let project={format:'street-paint-project',version:1,width:2688,height:1536,layers:[]},selected=null;
let camera={zoom:.3,x:0,y:0},history=[],future=[],pending=null,dirty=true,raf=0,space=false,drag=null,saveTimer,toastTimer,ready=false,revision=0,busy=false;
const copy=p=>({...p,layers:p.layers.map(l=>({...l,adjust:l.adjust?{...l.adjust}:undefined,feather:l.feather?{...l.feather}:undefined}))});
const current=()=>project.layers.find(l=>l.id===selected);
const signature=p=>JSON.stringify({...p,layers:p.layers.map(({src,...l})=>l)});
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);$('status').textContent=message;}
function begin(){if(!pending)pending=copy(project);}
function commit(){if(pending&&(signature(pending)!==signature(project)||pending.layers.some((l,i)=>l.src!==project.layers[i]?.src))){history.push(pending);if(history.length>40)history.shift();future=[];changed();}pending=null;updateHistory();}
function mutate(fn){if(busy)return;begin();fn();commit();refresh();}
function changed(){revision++;dirty=true;drawSoon();$('saveState').textContent='有未保存调整';clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,800);}
function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function undo(){if(busy)return;commit();if(!history.length)return;future.push(copy(project));project=history.pop();selected=project.layers.some(l=>l.id===selected)?selected:project.layers.at(-1)?.id;cache.clear();changed();refresh();}
function redo(){if(busy)return;commit();if(!future.length)return;history.push(copy(project));project=future.pop();selected=project.layers.some(l=>l.id===selected)?selected:project.layers.at(-1)?.id;cache.clear();changed();refresh();}
function drawSoon(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
const renderer=makeRenderer(canvas,imageBank,cache);
const compose=target=>renderer.compose(target,project);
const checker=canvas(24,24);{const p=checker.getContext('2d');p.fillStyle='#343a45';p.fillRect(0,0,24,24);p.fillStyle='#3c4350';p.fillRect(0,0,12,12);p.fillRect(12,12,12,12);}
function draw(){
  const dpr=Math.min(window.devicePixelRatio||1,2),w=workspace.clientWidth,h=workspace.clientHeight;
  if(view.width!==Math.round(w*dpr)||view.height!==Math.round(h*dpr)){view.width=Math.round(w*dpr);view.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(dirty){compose(sceneCanvas);dirty=false;}
  ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.zoom,camera.zoom);
  ctx.fillStyle=ctx.createPattern(checker,'repeat');ctx.fillRect(0,0,project.width,project.height);
  ctx.drawImage(sceneCanvas,0,0);
  ctx.strokeStyle='#8995a8';ctx.lineWidth=1/camera.zoom;ctx.strokeRect(0,0,project.width,project.height);
  const l=current();if(l&&l.visible&&$('showOutline').checked){
    ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rotation*Math.PI/180);ctx.scale(l.scale,l.scale);const u=1/(camera.zoom*l.scale);
    ctx.strokeStyle=l.locked?'#e3be76':'#a9d0ff';ctx.lineWidth=1.4*u;ctx.setLineDash(l.locked?[5*u,4*u]:[]);ctx.strokeRect(0,0,l.w,l.h);
    if(!l.locked){ctx.fillStyle='#d3e6ff';ctx.fillRect(l.w-5*u,l.h-5*u,10*u,10*u);}ctx.restore();
  }
  ctx.restore();$('zoomLabel').textContent=`${Math.round(camera.zoom*100)}%`;
}
function fit(){const w=workspace.clientWidth,h=workspace.clientHeight;camera.zoom=clamp(Math.min((w-64)/project.width,(h-70)/project.height),.02,4);camera.x=(w-project.width*camera.zoom)/2;camera.y=(h-project.height*camera.zoom)/2;drawSoon();}
function zoomAt(factor,x=workspace.clientWidth/2,y=workspace.clientHeight/2){const old=camera.zoom;camera.zoom=clamp(old*factor,.02,6);camera.x=x-(x-camera.x)*camera.zoom/old;camera.y=y-(y-camera.y)*camera.zoom/old;drawSoon();}
function updateTextSize(l){const p=sceneCtx;p.font=`${l.fontSize}px ${l.fontFamily}`;const lines=l.text.split('\n');l.w=clamp(Math.ceil(Math.max(10,...lines.map(t=>p.measureText(t).width))+12),20,8192);l.h=clamp(Math.ceil(lines.length*l.fontSize*1.3+12),20,8192);}
function renderLayers(){
  const root=$('layers');root.replaceChildren();$('layerCount').textContent=`${project.layers.length} / 40`;
  for(const l of [...project.layers].reverse()){
    const row=document.createElement('div');row.className=`layer ${l.id===selected?'selected':''}`;row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',`选择 ${l.name}`);
    const thumb=document.createElement(l.type==='image'?'img':'span');if(l.type==='image'){thumb.src=l.src;thumb.alt='';}else{thumb.className='text-thumb';thumb.textContent='T';}
    const title=document.createElement('span');title.className='layer-name';title.textContent=l.name;title.title=l.name;
    const vis=document.createElement('button');vis.textContent=l.visible?'◉':'○';vis.title=l.visible?'隐藏图层':'显示图层';vis.setAttribute('aria-label',`${vis.title} ${l.name}`);vis.onclick=e=>{e.stopPropagation();mutate(()=>l.visible=!l.visible);};
    const lock=document.createElement('button');lock.textContent=l.locked?'锁':'◇';lock.title=l.locked?'解锁位置':'锁定位置';lock.setAttribute('aria-label',`${lock.title} ${l.name}`);lock.onclick=e=>{e.stopPropagation();mutate(()=>l.locked=!l.locked);};
    row.append(thumb,title,vis,lock);row.onclick=()=>select(l.id);row.onkeydown=e=>{if(e.target===row&&['Enter',' '].includes(e.key)){e.preventDefault();select(l.id);}};root.append(row);
  }
}
function select(id){commit();selected=id;refresh();}
const sliders=[];
function slider(parent,key,label,min,max,step,get,set){
  const el=document.createElement('div');el.className='range-control';const top=document.createElement('div');top.className='range-top';
  const lab=document.createElement('label');lab.textContent=label;lab.htmlFor=`range-${key}`;
  const num=document.createElement('input');num.type='number';num.min=min;num.max=max;num.step=step;num.setAttribute('aria-label',`${label}数值`);
  const range=document.createElement('input');range.type='range';range.id=`range-${key}`;range.min=min;range.max=max;range.step=step;range.setAttribute('aria-label',label);
  top.append(lab,num);el.append(top,range);$(parent).append(el);
  function input(from){const l=current();if(!l||!Number.isFinite(from.valueAsNumber)||busy)return;begin();const value=clamp(from.valueAsNumber,min,max);set(l,value);range.value=value;num.value=value;dirty=true;drawSoon();}
  range.oninput=()=>input(range);range.onchange=()=>{commit();};num.oninput=()=>input(num);num.onchange=()=>commit();num.onblur=()=>{commit();if(current())num.value=get(current());};
  sliders.push({range,num,get});
}
slider('opacityControl','opacity','不透明度',0,100,1,l=>l.opacity,(l,v)=>l.opacity=v);
for(const [key,label,min,max,step] of [['exposure','曝光',-2,2,.05],['brightness','亮度',-100,100,1],['contrast','对比度',-100,100,1],['saturation','饱和度',0,200,1],['temperature','色温 · 冷 / 暖',-100,100,1],['tint','色调 · 绿 / 洋红',-100,100,1]])slider('colorControls',key,label,min,max,step,l=>l.adjust?.[key]??0,(l,v)=>{if(l.adjust)l.adjust[key]=v;});
for(const [key,label]of [['left','左边缘'],['right','右边缘'],['top','上边缘'],['bottom','下边缘']])slider('featherControls',`feather-${key}`,label,0,50,.5,l=>l.feather?.[key]??0,(l,v)=>{if(l.feather)l.feather[key]=v;});
function inspector(){
  const l=current();$('empty').classList.toggle('hidden',!!l);$('inspector').classList.toggle('hidden',!l);
  for(const id of ['raise','lower','duplicate','delete'])$(id).disabled=!l;
  if(!l)return;
  $('layerName').value=l.name;$('blend').value=l.blend;
  for(const input of document.querySelectorAll('[data-prop]')){const key=input.dataset.prop;input.value=Number((key==='scale'?l[key]*100:l[key]).toFixed(2));input.disabled=!!l.locked;}
  for(const item of sliders){item.range.value=item.get(l);item.num.value=item.get(l);}
  $('imageControls').classList.toggle('hidden',l.type!=='image');$('textControls').classList.toggle('hidden',l.type!=='text');
  if(l.type==='text'){$('textContent').value=l.text;$('fontSize').value=l.fontSize;$('textColor').value=l.color;$('fontFamily').value=l.fontFamily;}
  $('status').textContent=`${l.name} · ${Math.round(l.w*l.scale)} × ${Math.round(l.h*l.scale)} px${l.locked?' · 位置已锁定':''}`;
}
function refresh(){renderLayers();inspector();updateHistory();$('canvasWidth').value=project.width;$('canvasHeight').value=project.height;$('dimensions').textContent=`${project.width} × ${project.height} px`;dirty=true;drawSoon();}
for(const input of document.querySelectorAll('[data-prop]'))input.onchange=()=>{const l=current();if(!l||l.locked)return;const k=input.dataset.prop,v=input.valueAsNumber;if(!Number.isFinite(v)){inspector();return;}mutate(()=>l[k]=k==='scale'?clamp(v/100,.02,20):k==='rotation'?clamp(v,-360,360):clamp(v,-100000,100000));};
$('layerName').onchange=()=>{const l=current();if(l)mutate(()=>l.name=$('layerName').value.trim()||'未命名图层');};
$('blend').onchange=()=>{const l=current();if(l)mutate(()=>l.blend=$('blend').value);};
for(const [id,k]of [['textContent','text'],['fontSize','fontSize'],['textColor','color'],['fontFamily','fontFamily']]){
  $(id).oninput=()=>{const l=current();if(l?.type!=='text'||busy)return;const v=k==='fontSize'?$(id).valueAsNumber:$(id).value;if(k==='fontSize'&&!Number.isFinite(v))return;begin();l[k]=k==='fontSize'?clamp(v,8,300):v;updateTextSize(l);dirty=true;drawSoon();};$(id).onchange=()=>commit();
}
$('resetColor').onclick=()=>{const l=current();if(l?.type==='image')mutate(()=>l.adjust=defaultAdjustments());};
$('undo').onclick=undo;$('redo').onclick=redo;$('fit').onclick=fit;$('zoomIn').onclick=()=>zoomAt(1.2);$('zoomOut').onclick=()=>zoomAt(1/1.2);$('actual').onclick=()=>zoomAt(1/camera.zoom);
$('showOutline').onchange=drawSoon;
function reorder(direction){const l=current();if(!l)return;const i=project.layers.indexOf(l),j=i+direction;if(j<0||j>=project.layers.length)return;mutate(()=>{[project.layers[i],project.layers[j]]=[project.layers[j],project.layers[i]];});}
$('raise').onclick=()=>reorder(1);$('lower').onclick=()=>reorder(-1);
$('duplicate').onclick=()=>{const l=current();if(!l)return;if(project.layers.length>=40)return toast('最多支持 40 个图层。');mutate(()=>{const c=copy({...project,layers:[l]}).layers[0];c.id=crypto.randomUUID();c.name=`${l.name} 副本`.slice(0,200);c.x+=30;c.y+=30;project.layers.push(c);selected=c.id;});};
function remove(){const l=current();if(!l)return;if(l.locked)return toast('请先解锁图层。');mutate(()=>{project.layers=project.layers.filter(x=>x.id!==selected);selected=project.layers.at(-1)?.id;});}
$('delete').onclick=remove;
$('resizeCanvas').onclick=()=>{const w=$('canvasWidth').valueAsNumber,h=$('canvasHeight').valueAsNumber;try{validateProject({...project,width:w,height:h});mutate(()=>{project.width=w;project.height=h;});fit();}catch(e){toast(e.message);}};
function pointer(e){const r=view.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function world(p){return {x:(p.x-camera.x)/camera.zoom,y:(p.y-camera.y)/camera.zoom};}
function endDrag(){if(drag?.kind!=='pan')commit();drag=null;view.style.cursor=space?'grab':'default';inspector();}
view.onpointerdown=e=>{
  if(busy||!ready)return;view.focus();const p=pointer(e),wp=world(p);view.setPointerCapture(e.pointerId);
  if(space||e.button===1){drag={kind:'pan',p,x:camera.x,y:camera.y};view.style.cursor='grabbing';e.preventDefault();return;}
  if(e.button!==0)return;
  let l=current();if(l?.visible&&!l.locked&&$('showOutline').checked){const handle=transformPoint(l,l.w,l.h);if(Math.hypot((wp.x-handle.x)*camera.zoom,(wp.y-handle.y)*camera.zoom)<13){begin();drag={kind:'scale',id:l.id,start:copy({...project,layers:[l]}).layers[0]};return;}}
  const hit=[...project.layers].reverse().find(l=>{if(!l.visible||l.opacity===0)return false;const q=localPoint(l,wp.x,wp.y);return q.x>=0&&q.y>=0&&q.x<=l.w&&q.y<=l.h;});
  select(hit?.id);l=current();if(l&&!l.locked){begin();drag={kind:'move',id:l.id,p:wp,x:l.x,y:l.y};view.style.cursor='move';}
};
view.onpointermove=e=>{const p=pointer(e);if(!drag)return;const wp=world(p);
  if(drag.kind==='pan'){camera.x=drag.x+p.x-drag.p.x;camera.y=drag.y+p.y-drag.p.y;drawSoon();return;}
  const l=project.layers.find(l=>l.id===drag.id);if(!l)return;
  if(drag.kind==='move'){l.x=clamp(drag.x+wp.x-drag.p.x,-100000,100000);l.y=clamp(drag.y+wp.y-drag.p.y,-100000,100000);}
  else{const q=localPoint({...drag.start,scale:1},wp.x,wp.y);l.scale=clamp((q.x*l.w+q.y*l.h)/(l.w*l.w+l.h*l.h),.02,20);}
  dirty=true;drawSoon();inspector();
};
view.onpointerup=endDrag;view.onpointercancel=endDrag;view.onlostpointercapture=()=>{if(drag)endDrag();};
view.addEventListener('wheel',e=>{e.preventDefault();const p=pointer(e);zoomAt(Math.exp(-e.deltaY*.0015),p.x,p.y);},{passive:false});
window.addEventListener('blur',()=>{space=false;if(drag)endDrag();});
window.addEventListener('keydown',e=>{
  const editing=e.target.closest('input,textarea,select,[contenteditable]');if(editing)return;
  if(e.code==='Space'){space=true;view.style.cursor='grab';e.preventDefault();return;}
  const mod=e.metaKey||e.ctrlKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}
  const l=current(),step=e.shiftKey?10:1;if(l&&!l.locked&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();mutate(()=>{if(e.key==='ArrowLeft')l.x-=step;if(e.key==='ArrowRight')l.x+=step;if(e.key==='ArrowUp')l.y-=step;if(e.key==='ArrowDown')l.y+=step;});}
});
window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;view.style.cursor='default';}});
function readDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('无法读取图像文件。'));r.readAsDataURL(blob);});}
async function loadImage(src){if(imageBank.has(src))return imageBank.get(src);const im=new Image();im.src=src;await im.decode();if(im.naturalWidth*im.naturalHeight>24000000||im.naturalWidth>16384||im.naturalHeight>16384)throw Error('单张图片不能超过 2400 万像素，最长边不超过 16384 像素。');imageBank.set(src,im);return im;}
function imageLayer(name,src,w,h,x=0,y=0){return {id:crypto.randomUUID(),type:'image',name,src,w,h,x,y,scale:1,rotation:0,opacity:100,visible:true,locked:false,blend:'source-over',adjust:defaultAdjustments(),feather:{left:0,right:0,top:0,bottom:0}};}
async function importImages(files){
  if(busy)return;const list=[...files];if(project.layers.length+list.length>40)return toast('最多支持 40 个图层。');if(!list.length)return;
  busy=true;$('status').textContent='正在导入图片…';const added=[];
  try{for(const file of list){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPEG 或 WebP 图片。');if(file.size>40*1024*1024)throw Error('单张文件不能超过 40 MB。');const src=await readDataURL(file),im=await loadImage(src);const l=imageLayer(file.name.slice(0,200),src,im.naturalWidth,im.naturalHeight);l.scale=Math.min(1,project.width*.8/l.w,project.height*.8/l.h);l.x=(project.width-l.w*l.scale)/2;l.y=(project.height-l.h*l.scale)/2;added.push(l);}
    begin();project.layers.push(...added);selected=added.at(-1).id;commit();refresh();toast(`已添加 ${added.length} 张图片。`);
  }catch(e){toast(`导入失败：${e.message}`);}finally{busy=false;}
}
$('importImages').onclick=()=>$('imageFiles').click();$('imageFiles').onchange=async e=>{await importImages(e.target.files);e.target.value='';};
workspace.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});workspace.addEventListener('drop',e=>{e.preventDefault();importImages(e.dataTransfer.files);});
$('addText').onclick=()=>{if(project.layers.length>=40)return toast('最多支持 40 个图层。');mutate(()=>{const l={id:crypto.randomUUID(),type:'text',name:'文字图层',text:'输入文字',fontSize:64,fontFamily:'serif',color:'#f4e9d4',x:project.width*.12,y:project.height*.15,w:1,h:1,scale:1,rotation:0,opacity:100,visible:true,locked:false,blend:'source-over'};updateTextSize(l);project.layers.push(l);selected=l.id;});};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function saveProject(){commit();if(!ready||busy)return;download(new Blob([JSON.stringify(project)],{type:'application/json'}),'街景拼接工程.json');toast('已生成包含图片和调色参数的工程文件。');}
$('saveProject').onclick=saveProject;
$('exportPng').onclick=async()=>{commit();if(busy||!ready)return;busy=true;$('exportPng').disabled=true;
  try{compose(sceneCanvas);const blob=await new Promise(resolve=>sceneCanvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图像编码失败。');download(blob,'图片拼接.png');toast(`已导出 ${project.width} × ${project.height} PNG，包含全部可见图层。`);}catch(e){toast(`导出失败：${e.message}`);}finally{busy=false;$('exportPng').disabled=false;}
};
async function applyProject(data){validateProject(data);await Promise.all(data.layers.filter(l=>l.type==='image').map(l=>loadImage(l.src)));begin();project=copy(data);project.layers.filter(l=>l.type==='text').forEach(updateTextSize);selected=project.layers.at(-1)?.id;commit();cache.clear();refresh();fit();}
$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||busy)return;busy=true;try{if(f.size>180*1024*1024)throw Error('工程文件超过 180 MB。');commit();await applyProject(JSON.parse(await f.text()));toast('工程已载入，可继续调整；撤销可回到载入前。');}catch(err){toast(`打开失败：${err.message}`);}finally{busy=false;}};
function emptyProject(){return {format:'street-paint-project',version:1,width:2688,height:1536,layers:[]};}
$('newProject').onclick=()=>{if(busy)return;mutate(()=>{project=emptyProject();selected=null;cache.clear();});fit();toast('已新建空白工程，撤销可恢复之前的工程。');};
let dbPromise;
function db(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('street-paint-editor',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return dbPromise;}
async function readDraft(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('projects').objectStore('projects').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function saveDraft(){const rev=revision,p=copy(project);try{const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').put(p,'draft');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});if(rev===revision)$('saveState').textContent='已自动保存到本机';}catch{$('saveState').textContent='自动保存不可用，请保存工程';}}
new ResizeObserver(()=>{if(ready)drawSoon();}).observe(workspace);
window.addEventListener('beforeunload',e=>{if(pending||$('saveState').textContent==='有未保存调整'){e.preventDefault();e.returnValue='';}});
async function init(){
  try{
    let draft;try{draft=await readDraft();}catch{}
    if(draft){try{validateProject(draft);await Promise.all(draft.layers.filter(l=>l.type==='image').map(l=>loadImage(l.src)));project=copy(draft);project.layers.filter(l=>l.type==='text').forEach(updateTextSize);toast('已恢复上次保存在本机的工程。');}catch{project=emptyProject();toast('上次草稿无法读取，已打开空白画布；可尝试打开保存的工程文件。');}}
    else project=emptyProject();
    selected=project.layers.at(-1)?.id;ready=true;refresh();fit();await saveDraft();
  }catch(e){toast(`载入失败：${e.message}。可使用“图片”按钮导入本机素材。`);ready=true;refresh();fit();}
  finally{$('loading').classList.add('hidden');}
}
init();
