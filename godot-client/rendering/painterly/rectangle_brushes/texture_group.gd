class_name RectangleTextureBrushGroup
extends Resource
## Original pressure brush recipes: 0 = Aui 05, 1 = Aui 02, 2 = Aui 06.
@export var label := "铺色"
@export var enabled := true
@export var variants := PackedInt32Array([0,1])
@export var weights := PackedFloat32Array([0.65,0.35])
@export_range(0,1,0.01) var probability := 1.0
@export_range(0,1,0.01) var opacity := 0.86
@export_range(0.05,1,0.01) var length_fraction := 1.0
@export_range(0.05,1,0.01) var width_fraction := 1.0
@export_range(0,1,0.01) var start_fraction := 0.0
@export_range(0,2,0.01) var pigment_gain := 1.0

## Additional full-stroke PNG accent; selected once per rectangle.
@export var overlay_variants := PackedInt32Array([0,1])
@export var overlay_weights := PackedFloat32Array([0.5,0.5])
@export_range(0,1,0.01) var overlay_weight := 0.2
