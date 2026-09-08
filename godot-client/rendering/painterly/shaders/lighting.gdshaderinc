// Shared diffuse and selective-colour math. Direct and indirect terms stay
// separate so cast shadows attenuate only direct illumination.
#include "res://rendering/painterly/shaders/color.gdshaderinc"
#include "res://rendering/painterly/shaders/color_selection.gdshaderinc"

void painterly_light_split(vec3 albedo, vec3 normal, vec3 sun_dir, vec3 sun_rgb, float sun_e,
        vec3 irradiance, bool selective, float importance,
        float chroma_g, float lightness_g, float material_knee, float sun_knee, float color_resp,
        out vec3 indirect_out, out vec3 styled_out, out float weight_out) {
    float ndotl = max(dot(normalize(normal), sun_dir), 0.0);
    vec3 s0 = albedo * sun_rgb * (ndotl * sun_e);
    indirect_out = albedo * irradiance;
    styled_out = s0;
    weight_out = 0.0;
    if (selective && sun_e > 0.000001) {
        vec3 material_lab = to_oklab(albedo);
        vec3 solar_lab = to_oklab(sun_rgb / max(luminance(sun_rgb), 0.000001));
        float cm = length(material_lab.yz), cs = length(solar_lab.yz);
        float qm = confidence(cm, material_knee), qs = confidence(cs, sun_knee);
        float match_hue = selected_hue_weight(material_lab, solar_lab);
        float d = (1.0 - exp(-sun_e)) * ndotl;
        float fc = mix(0.12, 1.0, pow(importance, 1.3)) * color_resp;
        float fl = mix(0.15, 1.0, importance);
        float guard = smoothstep(0.08, 0.28, material_lab.x) * (1.0 - smoothstep(0.86, 1.0, material_lab.x));
        // Manual selection is independent of sun chroma, including white light.
        weight_out = d * fc * qm * (hue_selection_mode == 1 ? 1.0 : qs) * match_hue;
        vec3 slab = to_oklab(s0);
        float gain = soft_limit(chroma_g * weight_out, chroma_g);
        slab.yz *= 1.0 + gain;
        slab.x += soft_limit(lightness_g * d * fl * guard, lightness_g);
        slab.yz += solar_lab.yz * (1.0 - qm) * d * fl * guard * 0.04;
        styled_out = from_oklab(slab);
    }
}
