import {describe,it,expect} from 'vitest';
import {sampleDaylight,solarDirection,formatTime,normalizeHour,lightingRefresh} from './daylight';

describe('continuous coastal day lighting',()=>{
  it('wraps midnight and keeps the timeline clock valid',()=>{
    expect(formatTime(0)).toBe('00:00');expect(formatTime(23+59/60)).toBe('23:59');expect(formatTime(24)).toBe('00:00');
    expect(formatTime(-.5)).toBe('23:30');expect(normalizeHour(NaN)).toBe(15);
    expect(sampleDaylight(0)).toEqual(sampleDaylight(24));
  });
  it('moves the sun east to west and removes direct sunlight below the horizon',()=>{
    expect(solarDirection(7).x).toBeGreaterThan(0);expect(solarDirection(17).x).toBeLessThan(0);
    expect(solarDirection(12).y).toBeGreaterThan(.95);
    for(const h of [0,2,4,20,22,24]){expect(sampleDaylight(h).direct).toBe(0);expect(sampleDaylight(h).dapple).toBe(0);}
    expect(sampleDaylight(12).direct).toBeGreaterThan(sampleDaylight(17.5).direct);
  });
  it('has continuous sky, lamps and sunlight across every palette anchor and midnight',()=>{
    for(const h of [0,5,6,8,12,15,17.5,18.5,20,24]){
      const a=sampleDaylight(h-.0001),b=sampleDaylight(h+.0001);
      expect(a.sky.toArray().every((v,i)=>Math.abs(v-b.sky.toArray()[i])<.001)).toBe(true);
      expect(Math.abs(a.direct-b.direct)).toBeLessThan(.002);
      expect(Math.abs(a.porch-b.porch)).toBeLessThan(.1);
      expect(a.direction.distanceTo(b.direction)).toBeLessThan(.001);
    }
  });
  it('gradually turns on local lights while preserving readable night fill',()=>{
    const day=sampleDaylight(12),dusk=sampleDaylight(17.5),night=sampleDaylight(22);
    expect(day.porch).toBe(0);expect(dusk.porch).toBeGreaterThan(0);expect(night.porch).toBeGreaterThan(dusk.porch);
    expect(night.beacon).toBeGreaterThan(day.beacon);expect(night.gi.ambient).toBeGreaterThan(0);
    expect(night.gi.envIntensity).toBeLessThan(day.gi.envIntensity);
    for(let minute=0;minute<1440;minute++){
      const p=sampleDaylight(minute/60);
      expect(Number.isFinite(p.direction.length())).toBe(true);expect(p.direct).toBeGreaterThanOrEqual(0);
      expect(p.daylight).toBeGreaterThanOrEqual(0);expect(p.daylight).toBeLessThanOrEqual(1);
    }
  });
  it('bounds expensive refreshes during dragging and catches the final settled time',()=>{
    expect(lightingRefresh(110,100,100,105,false,true,true)).toEqual({direct:false,indirect:false});
    expect(lightingRefresh(210,100,100,205,false,true,true)).toEqual({direct:true,indirect:false});
    expect(lightingRefresh(610,530,100,605,true,true,true)).toEqual({direct:true,indirect:true});
    expect(lightingRefresh(250,200,200,100,false,true,true)).toEqual({direct:true,indirect:true});
    expect(lightingRefresh(10000,0,0,0,false,false,false)).toEqual({direct:false,indirect:false});
  });
});
