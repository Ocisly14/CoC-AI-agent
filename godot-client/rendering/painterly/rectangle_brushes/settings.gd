class_name RectangleBrushSettings
extends Resource
const GROUP=preload("res://rendering/painterly/rectangle_brushes/texture_group.gd")
@export var seed := 1701
@export var painting_revision := 0
@export var clockwise := true
@export_range(0.3,0.6,0.01) var overlap_min := 0.30
@export_range(0.3,0.6,0.01) var overlap_max := 0.60
@export var groups: Array[RectangleTextureBrushGroup]=[]

func ensure_defaults() -> void:
    if not groups.is_empty():return
    var rows=[
        ["铺色",[0,1],[0.65,0.35],1.0,0.88,1.0,1.0,0.0,1.0],
        ["衔接",[1,2],[0.5,0.5],0.55,0.42,0.76,0.92,0.10,0.9],
        ["接触",[0,2],[0.6,0.4],0.65,0.46,0.24,0.85,0.0,1.25],
        ["修边",[0,1],[0.35,0.65],0.6,0.38,0.48,0.75,0.46,0.85],
        ["干刷",[1,2],[0.55,0.45],0.7,0.36,0.75,0.88,0.12,0.7]]
    for row in rows:
        var group=GROUP.new();group.label=row[0]
        group.variants=PackedInt32Array(row[1]);group.weights=PackedFloat32Array(row[2])
        group.probability=row[3];group.opacity=row[4];group.length_fraction=row[5]
        group.width_fraction=row[6];group.start_fraction=row[7];group.pigment_gain=row[8]
        groups.append(group)

func shader_values() -> Dictionary:
    ensure_defaults()
    var choices=PackedVector4Array();var shape=PackedVector4Array();var amount=PackedVector4Array()
    for group in groups.slice(0,5):
        var indices=Vector2.ZERO;var split=1.0
        if not group.variants.is_empty():indices.x=group.variants[0];indices.y=group.variants[0]
        if group.variants.size()>1:indices.y=group.variants[1]
        if group.weights.size()>1:split=maxf(group.weights[0],0)/maxf(maxf(group.weights[0],0)+maxf(group.weights[1],0),0.0001)
        choices.append(Vector4(indices.x,indices.y,split,group.probability if group.enabled else 0.0))
        shape.append(Vector4(group.length_fraction,group.width_fraction,group.start_fraction,group.pigment_gain))
        amount.append(Vector4(group.opacity,0,0,0))
    choices.resize(5);shape.resize(5);amount.resize(5)
    return {"rectangle_group_choices":choices,"rectangle_group_shape":shape,"rectangle_group_amount":amount}
