// Oklab matrices: Bjorn Ottosson, https://bottosson.github.io/posts/oklab/
vec3 to_oklab(vec3 c) {
    vec3 lms = vec3(dot(c, vec3(.4122214708,.5363325363,.0514459929)),
                    dot(c, vec3(.2119034982,.6806995451,.1073969566)),
                    dot(c, vec3(.0883024619,.2817188376,.6299787005)));
    lms = sign(lms) * pow(abs(lms), vec3(1.0/3.0));
    return vec3(dot(lms, vec3(.2104542553,.7936177850,-.0040720468)),
                dot(lms, vec3(1.9779984951,-2.4285922050,.4505937099)),
                dot(lms, vec3(.0259040371,.7827717662,-.8086757660)));
}
vec3 from_oklab(vec3 c) {
    vec3 t = vec3(c.x+.3963377774*c.y+.2158037573*c.z,
                  c.x-.1055613458*c.y-.0638541728*c.z,
                  c.x-.0894841775*c.y-1.2914855480*c.z);
    t = t*t*t;
    return vec3(dot(t,vec3(4.0767416621,-3.3077115913,.2309699292)),
                dot(t,vec3(-1.2684380046,2.6097574011,-.3413193965)),
                dot(t,vec3(-.0041960863,-.7034186147,1.7076147010)));
}
float luminance(vec3 c) { return dot(c,vec3(.2126,.7152,.0722)); }
float confidence(float c, float knee) { return c*c/(c*c+knee*knee); }
float soft_limit(float amount, float cap) {
    return cap > 0.000001 ? cap * tanh(amount/cap) : 0.0;
}
bool in_gamut(vec3 c) {
    return min(c.r,min(c.g,c.b)) >= 0.0 && max(c.r,max(c.g,c.b)) <= 1.0;
}
vec3 gamut_map(vec3 lab) {
    // Tone mapping has already put L in [0,1]. Preserve L,h, reduce C.
    vec3 rgb = from_oklab(lab);
    if (in_gamut(rgb)) { return rgb; }
    float lo=0.0, hi=1.0;
    for(int i=0;i<12;i++) {
        float mid=(lo+hi)*0.5;
        if(in_gamut(from_oklab(vec3(lab.x,lab.yz*mid)))) {lo=mid;} else {hi=mid;}
    }
    return from_oklab(vec3(lab.x,lab.yz*lo));
}
vec3 output_map(vec3 scene_linear, float exposure) {
    // Shoulder in perceptual lightness; hue/chroma are not channel-clipped.
    vec3 lab=to_oklab(scene_linear*exposure);
    if(lab.x>0.78) {lab.x=0.78+0.22*tanh((lab.x-0.78)/0.22);}
    lab.x=max(lab.x,0.0);
    return gamut_map(lab);
}
