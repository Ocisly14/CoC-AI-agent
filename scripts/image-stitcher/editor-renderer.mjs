import {adjustPixels} from "./editor-core.mjs";
export function makeRenderer(canvas,imageBank,cache){
function renderLayer(l){
  if(l.type==='text'){
    const key=JSON.stringify([l.text,l.fontSize,l.fontFamily,l.color]);const old=cache.get(l.id);if(old?.key===key)return old.canvas;
    const c=canvas(Math.ceil(l.w),Math.ceil(l.h)),p=c.getContext('2d');p.font=`${l.fontSize}px ${l.fontFamily}`;p.textBaseline='top';p.fillStyle=l.color;
    l.text.split('\n').forEach((line,i)=>p.fillText(line,6,6+i*l.fontSize*1.3));cache.set(l.id,{key,canvas:c});return c;
  }
  const image=imageBank.get(l.src);if(!image)return null;
  const key=JSON.stringify([l.adjust,l.feather]);const old=cache.get(l.id);if(old?.key===key&&old.image===image)return old.canvas;
  const c=canvas(image.naturalWidth,image.naturalHeight),p=c.getContext('2d',{willReadFrequently:true});p.drawImage(image,0,0);
  const pixels=p.getImageData(0,0,c.width,c.height);adjustPixels(pixels.data,l.adjust);p.putImageData(pixels,0,0);
  p.globalCompositeOperation='destination-in';
  const {width:w,height:h}=c;
  for(const side of ['left','right','top','bottom']){
    const ratio=l.feather[side]/100;if(!ratio)continue;let g;
    if(side==='left')g=p.createLinearGradient(0,0,w*ratio,0);
    if(side==='right')g=p.createLinearGradient(w,0,w*(1-ratio),0);
    if(side==='top')g=p.createLinearGradient(0,0,0,h*ratio);
    if(side==='bottom')g=p.createLinearGradient(0,h,0,h*(1-ratio));
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,1)');p.fillStyle=g;p.fillRect(0,0,w,h);
  }
  cache.set(l.id,{key,image,canvas:c});return c;
}
function compose(target, project){
  if(target.width!==project.width)target.width=project.width;if(target.height!==project.height)target.height=project.height;
  const p=target.getContext('2d');p.clearRect(0,0,target.width,target.height);p.imageSmoothingEnabled=true;p.imageSmoothingQuality='high';
  for(const l of project.layers){if(!l.visible||l.opacity===0)continue;const c=renderLayer(l);if(!c)continue;
    p.save();p.globalAlpha=l.opacity/100;p.globalCompositeOperation=l.blend;p.translate(l.x,l.y);p.rotate(l.rotation*Math.PI/180);p.scale(l.scale,l.scale);p.drawImage(c,0,0,l.w,l.h);p.restore();
  }
  return target;
}
return {renderLayer,compose};
}
