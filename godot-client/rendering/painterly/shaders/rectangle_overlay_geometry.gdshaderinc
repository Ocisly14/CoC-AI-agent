// Width sets the physical brush size. Only its longitudinal aspect is deformed.
// One image is placed even when the requested run exceeds the maximum length.
float rectangle_overlay_length(float brush_width,float native_aspect,float requested_length) {
    float native_length=max(brush_width*native_aspect,0.001);
    return native_length*clamp(requested_length/native_length,0.5,1.2);
}
