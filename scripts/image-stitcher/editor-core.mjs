export const defaultAdjustments = () => ({exposure:0, brightness:0, contrast:0, saturation:100, temperature:0, tint:0});
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function transformPoint(layer, x, y) {
  const r=layer.rotation*Math.PI/180, c=Math.cos(r),s=Math.sin(r);
  return {x:layer.x+(x*c-y*s)*layer.scale,y:layer.y+(x*s+y*c)*layer.scale};
}
export function localPoint(layer,x,y) {
  const r=-layer.rotation*Math.PI/180, dx=x-layer.x,dy=y-layer.y;
  return {x:(dx*Math.cos(r)-dy*Math.sin(r))/layer.scale,y:(dx*Math.sin(r)+dy*Math.cos(r))/layer.scale};
}
export function adjustPixels(data,a) {
  const gain=2**a.exposure, contrast=1+a.contrast/100, sat=a.saturation/100;
  const offset=a.brightness*1.275, warm=a.temperature*.40, tint=a.tint*.30;
  for(let i=0;i<data.length;i+=4){
    let r=(data[i]*gain-127.5)*contrast+127.5+offset+warm+tint*.5;
    let g=(data[i+1]*gain-127.5)*contrast+127.5+offset-tint;
    let b=(data[i+2]*gain-127.5)*contrast+127.5+offset-warm+tint*.5;
    const l=.2126*r+.7152*g+.0722*b;
    data[i]=clamp(l+(r-l)*sat,0,255);data[i+1]=clamp(l+(g-l)*sat,0,255);data[i+2]=clamp(l+(b-l)*sat,0,255);
  }
  return data;
}
export function validateProject(value) {
  if(value?.format!=='street-paint-project'||value.version!==1) throw Error('这不是支持的拼接工程（版本 1）。');
  if(!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<64||value.height<64||value.width>8192||value.height>8192||value.width*value.height>24000000) throw Error('画布需在 64–8192 像素内，总像素不超过 2400 万。');
  if(!Array.isArray(value.layers)||value.layers.length>40) throw Error('工程最多支持 40 个图层。');
  const ids=new Set();
  for(const l of value.layers){
    if(!l||!['image','text'].includes(l.type)||typeof l.id!=='string'||ids.has(l.id)) throw Error('图层数据不完整或 ID 重复。'); ids.add(l.id);
    for(const k of ['x','y','w','h','scale','rotation','opacity']) if(!Number.isFinite(l[k])) throw Error('图层位置或尺寸无效。');
    if(l.w<=0||l.h<=0||l.w>16384||l.h>16384||l.scale<.02||l.scale>20||l.opacity<0||l.opacity>100||Math.abs(l.x)>100000||Math.abs(l.y)>100000)throw Error('图层尺寸或位置超出范围。');
    if(!['source-over','multiply','screen','overlay','difference'].includes(l.blend))throw Error('不支持的混合模式。');
    if(typeof l.name!=='string'||l.name.length>200)throw Error('图层名称无效。');
    if(typeof l.visible!=='boolean'||typeof l.locked!=='boolean')throw Error('图层可见性或锁定状态无效。');
    if(l.type==='image'){
      if(typeof l.src!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(l.src))throw Error('工程中的图像必须是内嵌 PNG、JPEG 或 WebP。');
      for(const k of Object.keys(defaultAdjustments())){
        const n=l.adjust?.[k],min=k==='exposure'?-2:k==='saturation'?0:-100,max=k==='exposure'?2:k==='saturation'?200:100;
        if(!Number.isFinite(n)||n<min||n>max)throw Error('调色参数无效。');
      }
      for(const k of ['left','right','top','bottom'])if(!Number.isFinite(l.feather?.[k])||l.feather[k]<0||l.feather[k]>50)throw Error('羽化参数无效。');
    }else if(typeof l.text!=='string'||l.text.length>2000||!Number.isFinite(l.fontSize)||l.fontSize<8||l.fontSize>300||!/^#[0-9a-f]{6}$/i.test(l.color)||!['sans-serif','serif','monospace'].includes(l.fontFamily))throw Error('文字参数无效。');
  }
  return value;
}
