import * as THREE from 'three';
import { lightPresets } from './lighting';
import { giPresets } from './globalIllumination';

export const normalizeHour=(hour:number)=>Number.isFinite(hour)?((hour%24)+24)%24:15;
export function formatTime(hour:number) {
  const minute=Math.floor(normalizeHour(hour)*60+1e-7)%1440;
  return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
export function timeOfDay(hour:number) {
  const h=normalizeHour(hour);
  return h<5?'深夜':h<7?'黎明':h<11?'上午':h<14?'正午':h<17?'午后':h<19?'日落':h<21?'暮色':'夜晚';
}
const night={...lightPresets.bluehour,sky:0x18263c,fill:0x7395c1,bounce:0x354864,water:0x1c3047,direct:0,exposure:.9,dapple:0,beacon:1800,porch:130,harbor:160,glow:4};
const nightGi={...giPresets.bluehour,zenith:0x101c35,ground:0x252e41,sunGlow:0,envIntensity:.25,ambient:.2,bounceStrength:.16};
// Authored coastal day, not a live astronomical simulation. Existing painterly
// palettes are control points, interpolated in linear colour space with smooth tangents.
const keys=[
  {hour:0,light:night,gi:nightGi},
  {hour:5,light:night,gi:nightGi},
  {hour:6,light:{...lightPresets.sunset,sky:0xb5bac7,sun:0xffc69c,direct:1.8,exposure:1.02,dapple:.22},gi:{...giPresets.sunset,sunGlow:.8}},
  {hour:8,light:{...lightPresets.afternoon,sky:0xc4d1d4,direct:3.8},gi:giPresets.afternoon},
  {hour:12,light:{...lightPresets.afternoon,direct:5.1,sky:0xc4d4dc},gi:giPresets.afternoon},
  {hour:15,light:lightPresets.afternoon,gi:giPresets.afternoon},
  {hour:17.5,light:lightPresets.sunset,gi:giPresets.sunset},
  {hour:18.5,light:{...lightPresets.bluehour,direct:0,dapple:0},gi:giPresets.bluehour},
  {hour:20,light:night,gi:nightGi},
  {hour:24,light:night,gi:nightGi},
];
const smooth=(a:number,b:number,v:number)=>THREE.MathUtils.smoothstep(v,a,b);
/** Sun rises on +X, sets over the -X ocean; the old afternoon remains the art reference. */
export function solarDirection(hour:number) {
  const phase=(normalizeHour(hour)-6)/12*Math.PI;
  return new THREE.Vector3(Math.cos(phase),Math.sin(phase)*.88,-Math.sin(phase)*.18).normalize();
}
export function sampleDaylight(hour:number) {
  const h=normalizeHour(hour),index=keys.findIndex((key,i)=>i<keys.length-1&&h>=key.hour&&h<keys[i+1].hour);
  const a=keys[index],b=keys[index+1],t=smooth(a.hour,b.hour,h);
  const color=(x:number,y:number)=>new THREE.Color(x).lerp(new THREE.Color(y),t);
  const scalar=(key:'direct'|'exposure'|'dapple'|'beacon'|'porch'|'harbor'|'glow')=>THREE.MathUtils.lerp(a.light[key],b.light[key],t);
  const giScalar=(key:'sunGlow'|'envIntensity'|'ambient'|'bounceStrength'|'aoStrength'|'contactHeight'|'penumbra'|'mistFloor'|'mistTop')=>THREE.MathUtils.lerp(a.gi[key],b.gi[key],t);
  const direction=solarDirection(h),sunVisibility=smooth(-.025,.09,direction.y);
  const daylight=smooth(-.13,.36,direction.y);
  const lamps=1-smooth(-.06,.28,direction.y);
  return {
    sky:color(a.light.sky,b.light.sky),sun:color(a.light.sun,b.light.sun),fill:color(a.light.fill,b.light.fill),bounce:color(a.light.bounce,b.light.bounce),water:color(a.light.water,b.light.water),
    direct:scalar('direct')*sunVisibility,exposure:scalar('exposure'),dapple:scalar('dapple')*sunVisibility,
    beacon:90+lamps*1710,porch:lamps*130,harbor:lamps*160,glow:.45+lamps*3.55,
    daylight,lamps,direction,
    gi:{zenith:color(a.gi.zenith,b.gi.zenith),ground:color(a.gi.ground,b.gi.ground),sunGlow:giScalar('sunGlow')*sunVisibility,envIntensity:giScalar('envIntensity'),ambient:giScalar('ambient'),bounceStrength:giScalar('bounceStrength'),aoStrength:giScalar('aoStrength'),contactHeight:giScalar('contactHeight'),penumbra:giScalar('penumbra'),mistFloor:giScalar('mistFloor'),mistTop:giScalar('mistTop')},
  };
}

/** Bounded refreshes while scrubbing; a final settled sample is never dropped. */
export function lightingRefresh(now:number,lastDirect:number,lastIndirect:number,lastInput:number,playing:boolean,dirty:boolean,indirectDirty:boolean) {
  const settled=!playing&&now-lastInput>=120;
  return {direct:dirty&&(now-lastDirect>=80||settled),indirect:indirectDirty&&(now-lastIndirect>=500||settled)};
}
