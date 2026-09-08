// The solar pass and this local pass share Oklab, hue selection and soft limits.
// Native attenuation already contains both distance falloff and shadow visibility.
uniform bool lamp_art_enabled = true;
uniform float lamp_art_strength = 3.0;
uniform float lamp_importance_boost = 1.5;
uniform float lamp_hue_boost = 1.5;
uniform float lamp_chroma_gain = 1.0;
uniform float lamp_lightness_gain = 0.45;
uniform float lamp_hue_width = 85.0;
varying vec3 lamp_albedo;
varying float lamp_importance;

vec3 style_lamp_light(vec3 direct, vec3 light_rgb, float attenuation) {
    if (!enabled || !lamp_art_enabled || lamp_art_strength <= 0.0) { return direct; }
    vec3 material_lab = to_oklab(lamp_albedo);
    vec3 light_lab = to_oklab(light_rgb / max(luminance(light_rgb), 0.000001));
    float qm = confidence(length(material_lab.yz), material_chroma_knee);
    float qs = confidence(length(light_lab.yz), sun_chroma_knee);
    float match_hue = selected_hue_weight_for(material_lab, light_lab, 0, 0.0, lamp_hue_width, min(35.0, lamp_hue_width));
    // Either importance or matching hue can earn a bonus, and both can combine.
    float weight = lamp_art_strength * (lamp_importance_boost * pow(lamp_importance, 1.3)
        + lamp_hue_boost * qm * qs * match_hue);
    float received = max(luminance(light_rgb) * attenuation, 0.0);
    float response = (1.0 - exp(-received * 4.0)) * weight;
    float guard = smoothstep(0.08, 0.28, material_lab.x) * (1.0 - smoothstep(0.86, 1.0, material_lab.x));
    vec3 lab = to_oklab(direct);
    lab.yz *= 1.0 + soft_limit(lamp_chroma_gain * response * qm, lamp_chroma_gain);
    // Relative lightness boost vanishes with the light, including fully occluded pixels.
    lab.x *= 1.0 + soft_limit(lamp_lightness_gain * response * guard, lamp_lightness_gain);
    return max(from_oklab(lab), vec3(0.0));
}
