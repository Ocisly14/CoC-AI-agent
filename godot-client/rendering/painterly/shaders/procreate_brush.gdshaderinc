// Godot adaptation of embedded Aui grains, NOT the proprietary Procreate engine.
// Missing bundled Shape images are not replaced by QuickLook stroke thumbnails.
uniform bool procreate_shadows_enabled=false;
uniform sampler2DArray procreate_grains : filter_linear_mipmap, repeat_enable;
uniform vec4 procreate_parameters[4]; // grain scale, brightness, contrast, flow
uniform vec4 procreate_dynamics[4]; // spacing, jitter, rotation, depth

float aui_grain(vec2 p,int layer,float lod) {
    vec4 recipe=procreate_parameters[layer];
    float angle=procreate_dynamics[layer].z*6.2831853;
    vec2 rotated=vec2(cos(angle)*p.x-sin(angle)*p.y,sin(angle)*p.x+cos(angle)*p.y);
    float grain=textureLod(procreate_grains,vec3(rotated/max(recipe.x,0.1),float(layer)),lod).r;
    return clamp((grain-0.5)*(1.0+recipe.z)+0.5+recipe.y*0.35,0.0,1.0);
}

// A dense stroke is integrated locally along its travel, in brush-width units.
// Increasing shadow length extends travel; it never stretches one finished PNG.
vec3 aui_deposit(vec2 uv,float length_m,float width_m,vec2 id,float footprint_m) {
    float choice=hash21(id+vec2(97,13));
    int layer=choice<0.65 ? 0 : (choice<0.85 ? 1 : 2);
    vec4 recipe=procreate_parameters[layer];
    vec4 dynamics=procreate_dynamics[layer];
    float lod=clamp(log2(max(footprint_m/width_m*1024.0/max(recipe.x,0.1),1.0)),0.0,10.0);
    vec2 offset=vec2(hash21(id+vec2(29,5)),hash21(id+vec2(7,61)))*3.0;
    float travel=uv.x*length_m/width_m;
    float lateral=uv.y;
    // Grain-derived bristle groups keep different end lengths, giving a broken
    // lift-off rather than a uniformly blurred or triangular stamp endpoint.
    float bristle=aui_grain(vec2(offset.x,lateral*1.35)+offset,layer,lod);
    float tip=1.0-(0.035+0.15*bristle)*min(width_m/length_m*3.0,1.0);
    float lift=max(width_m/length_m*0.18,0.015);
    float pressure=1.0-smoothstep(max(tip-lift,0.0),tip,uv.x);
    float deposited=0.0;
    float dry=0.0;
    // Eight-point quadrature of the dense native stamp path (source spacing is
    // ~0.004–0.007 tip widths). Bounded work per fragment, independent of length.
    for(int tap=0;tap<8;tap++) {
        float distance_=(float(tap)+0.5)/8.0;
        float grain=aui_grain(vec2(travel-distance_*0.7,lateral*1.35)+offset,layer,lod);
        deposited+=grain;
        dry=max(dry,grain);
    }
    deposited/=8.0;
    float wobble=(aui_grain(vec2(travel*0.4,offset.y)+offset,layer,lod)-0.5)*min(dynamics.y,0.34)*0.2;
    float side_distance=abs(lateral-0.5-wobble)*2.0;
    float edge=1.0-smoothstep(0.76+0.12*deposited,0.99,side_distance);
    float root=1.0-smoothstep(0.0,0.65,travel);
    float load=mix(0.70,0.985,smoothstep(0.02,0.55,deposited));
    load=mix(load,0.995,root);
    float alpha=edge*pressure*load;
    return vec3(alpha,1.0-deposited,(dry-deposited)*pressure);
}

// Discrete pressure-driven Shape + Grain deposition. No time-dependent state.
uniform bool pressure_stamps_enabled=true;
uniform sampler2D pressure_curves : filter_linear, repeat_disable;
uniform float pressure_scale=1.0;
uniform float pressure_variation=0.055;
uniform vec2 pressure_width_range=vec2(0.45,1.2);
uniform float pressure_squash=0.55;
uniform float pressure_charge=1.0;
uniform float pressure_consumption=0.38;
uniform float pressure_stamp_spacing=0.1;
uniform float pressure_constant=-1.0;

vec2 aui_gesture(float progress,vec2 id) {
    float u=clamp(progress,0.0,1.0);
    vec2 curves=textureLod(pressure_curves,vec2((u*255.0+0.5)/256.0,0.5),0.0).rg;
    float variation=sin(u*9.0+hash21(id+vec2(83,31))*6.2831853);
    variation*=pressure_variation*smoothstep(0.0,0.12,u)*(1.0-smoothstep(0.75,1.0,u));
    float p=pressure_constant>=0.0 ? pressure_constant : curves.r+variation;
    return vec2(clamp(p*pressure_scale,0.0,1.0),curves.g*90.0);
}

// Full tip extents in base-width units. Pressure widens AND shortens the tip.
// Width is capped at 1.35 and longitudinal extent at 1.0, so 16 local stamps
// at the minimum 0.08 spacing include the complete support at every pixel.
vec2 aui_tip_size(float p,float tilt) {
    float response=textureLod(pressure_curves,vec2((p*255.0+0.5)/256.0,0.5),0.0).b;
    float flatten=pressure_squash*p;
    float lean=clamp((80.0-tilt)/30.0,0.0,1.0);
    float width=mix(pressure_width_range.x,pressure_width_range.y,response);
    width*=mix(0.92,1.0,lean);
    return vec2(mix(0.95,0.42,flatten)*mix(0.9,1.0,lean),width);
}

float aui_tip_shape(vec2 relative,vec2 size_,float pixel_width) {
    vec2 q=abs(relative)/max(size_*0.5,vec2(0.0001));
    // Rounded flat tip: a fourth-power superellipse, rather than a hard box.
    float boundary=pow(pow(q.x,4.0)+pow(q.y,4.0),0.25);
    float aa=clamp(pixel_width/max(min(size_.x,size_.y),0.01)*2.0,0.035,0.3);
    return 1.0-smoothstep(1.0-aa,1.0,boundary);
}

vec3 aui_pressure_deposit_impl(vec2 uv,float length_m,float width_m,vec2 id,float footprint_m,float root_offset_m,int layer,bool full_tip) {
    if(!full_tip && (uv.x<0.0 || uv.x>1.0)) {return vec3(0);}
    vec2 offset=vec2(hash21(id+vec2(29,5)),hash21(id+vec2(7,61)))*3.0;
    float travel=uv.x*length_m/width_m;
    float total_length=length_m/width_m;
    // Contact casters hide the front part of the path. Start the pressure/charge
    // gesture at the visible rear silhouette, not at the buried front footprint.
    float root_offset=clamp(root_offset_m/width_m,0.0,max(total_length-0.08,0.0));
    float pixel_width=footprint_m/width_m;
    float lod=clamp(log2(max(pixel_width*1024.0/max(procreate_parameters[layer].x,0.1),1.0)),0.0,10.0);
    float spacing_=pressure_stamp_spacing;
    int nearest=int(floor(travel/spacing_));
    float mass=0.0, dry_mass=0.0;
    // Grain stays in the undeformed stroke plane. No grain scaling with pressure.
    float grain=aui_grain(vec2(travel,uv.y*1.35)+offset,layer,lod);
    for(int tap=-7;tap<=8;tap++) {
        int index=nearest+tap;
        float center=(float(index)+0.5)*spacing_;
        if(index<0 || center>total_length) {continue;}
        float progress=clamp((center-root_offset)/max(total_length-root_offset,0.08),0.0,1.0);
        vec2 gesture=aui_gesture(progress,id);
        float pressure=gesture.x;
        if(pressure<0.001) {continue;}
        vec2 tip=aui_tip_size(pressure,gesture.y);
        // Keep each stamp entirely inside the gesture's longitudinal support.
        if(!full_tip) {tip.x=min(tip.x,2.0*min(center,total_length-center));}
        float sway=sin(center*1.8+offset.x)*0.025*min(pressure,0.8);
        vec2 relative=vec2(travel-center,uv.y-0.5-sway);
        float shape=aui_tip_shape(relative,tip,pixel_width);
        if(shape<=0.0) {continue;}
        // Low pressure contacts only grain peaks. Loaded strokes fill valleys.
        float grain_contact=mix(smoothstep(0.10,0.70,grain),mix(0.55,1.0,grain),pressure);
        float edge_band=smoothstep(0.60,0.95,abs(relative.y)/max(tip.y*0.5,0.001));
        grain_contact*=mix(1.0,smoothstep(0.08,0.50,grain),edge_band*0.85);
        float charge=max(pressure_charge-pressure_consumption*progress,0.0);
        float flow=pressure*charge*mix(0.8,1.0,procreate_parameters[layer].w);
        // Integrate optical mass per unit path distance. Longitudinal normalization
        // makes pressure-induced squash change shape without erasing paint load.
        float amount=shape*grain_contact*flow*spacing_/max(tip.x,0.08)*5.5;
        mass+=amount;
        dry_mass+=amount*(1.0-grain_contact);
    }
    float alpha=1.0-exp(-mass);
    return vec3(alpha,clamp(mass/5.5,0.0,1.0),dry_mass/max(mass,0.0001));
}

// Original pressure mode retains its exact extent and recipe selection.
vec3 aui_pressure_deposit(vec2 uv,float length_m,float width_m,vec2 id,float footprint_m,float root_offset_m) {
    float choice=hash21(id+vec2(97,13));
    int layer=choice<0.65 ? 0 : (choice<0.85 ? 1 : 2);
    return aui_pressure_deposit_impl(uv,length_m,width_m,id,footprint_m,root_offset_m,layer,false);
}
// A rectangle plans the path, not a clipping mask. Complete pressure-deformed
// tips can extend past its sides and ends. Bounds below are outside tip support.
vec3 aui_pressure_full_tip(vec2 uv,float length_m,float width_m,vec2 id,float footprint_m,float root_offset_m,int layer) {
    float travel=uv.x*length_m/width_m;
    if(travel< -0.55 || travel>length_m/width_m+0.55 || abs(uv.y-0.5)>0.71) {return vec3(0);}
    return aui_pressure_deposit_impl(uv,length_m,width_m,id,footprint_m,root_offset_m,layer,true);
}
