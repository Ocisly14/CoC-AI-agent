class_name PainterlyPressureSettings
extends Resource
## Shadow-specific overrides. Source Procreate recipes remain unmodified.

static func curve_from(points: Array[Vector2], maximum: float = 1.0) -> Curve:
    var curve := Curve.new()
    curve.max_value=maximum
    for point in points: curve.add_point(point,0,0,Curve.TANGENT_LINEAR,Curve.TANGENT_LINEAR)
    return curve

@export var pressure_curve: Curve = curve_from([Vector2(0,0.65),Vector2(0.12,0.9),Vector2(0.45,0.85),Vector2(0.75,0.82),Vector2(1,0)])
@export var tilt_curve: Curve = curve_from([Vector2(0,50),Vector2(0.75,50),Vector2(1,80)],90)
@export var width_response: Curve = curve_from([Vector2(0,0),Vector2(1,1)])
@export_range(0,1.5,0.01) var pressure_scale := 1.0
@export_range(0,0.15,0.01) var pressure_variation := 0.055
@export var width_range := Vector2(0.45,1.2)
@export_range(0,1,0.01) var squash_strength := 0.55
@export_range(0,2,0.01) var paint_charge := 1.0
@export_range(0,1,0.01) var paint_consumption := 0.38
@export_range(0.08,0.2,0.01) var stamp_spacing := 0.1
# Test/preview controls, default -1 uses the authored gesture.
@export_range(-1,1,0.01) var constant_pressure := -1.0
var _curve_texture: ImageTexture

func curve_texture() -> ImageTexture:
    # Small LUT rebuilt on explicit refresh, including live Curve edits.
    var img := Image.create(256,1,false,Image.FORMAT_RGBAF)
    for i in 256:
        var u := float(i)/255.0
        img.set_pixel(i,0,Color(clampf(pressure_curve.sample(u),0,1),clampf(tilt_curve.sample(u),0,90)/90.0,clampf(width_response.sample(u),0,1),1))
    if _curve_texture == null: _curve_texture=ImageTexture.create_from_image(img)
    else: _curve_texture.update(img)
    return _curve_texture

func uniforms() -> Dictionary:
    return {
        "pressure_curves":curve_texture(),
        "pressure_scale":clampf(pressure_scale,0,1.5),
        "pressure_variation":clampf(pressure_variation,0,0.15),
        "pressure_width_range":Vector2(clampf(minf(width_range.x,width_range.y),0.1,1.35),clampf(maxf(width_range.x,width_range.y),0.1,1.35)),
        "pressure_squash":clampf(squash_strength,0,1),
        "pressure_charge":clampf(paint_charge,0,2),
        "pressure_consumption":clampf(paint_consumption,0,1),
        "pressure_stamp_spacing":clampf(stamp_spacing,0.08,0.2),
        "pressure_constant":clampf(constant_pressure,-1,1),
    }
