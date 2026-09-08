class_name PainterlySurface
extends Resource
## Explicit diffuse surface inputs. Data maps are linear; albedo is sRGB.

@export var albedo := Color("a49e8a")
@export var albedo_texture: Texture2D
@export var importance_map: Texture2D
@export_range(0, 1) var default_importance := 0.2
## RG encodes (cos(2*angle), sin(2*angle))*0.5+0.5 in the surface XZ plane.
@export var flow_map: Texture2D
@export var default_flow := Vector2(1, 0)
## Local XZ metres -> map UV. Use separate instances for separate map domains.
@export_enum("XZ (ground)", "XY (front wall)", "ZY (side wall)") var map_plane := 0
@export var map_origin := Vector2(-8, -8)
@export var map_extent := Vector2(16, 16)
## Mesh local -> shared authored data coordinates, independent of albedo UV.
@export var data_transform := Transform3D.IDENTITY
## RGB linear irradiance input, separate from direct sunlight. Not native Godot GI.
@export var indirect_map: Texture2D
## Optional alpha accessibility attenuates ambient light only.
@export var indirect_alpha_occlusion := false
@export var indirect_tint := Color.BLACK
@export_range(0, 4) var indirect_energy := 1.0
@export var painterly_shadows := true
@export var casts_shadow := true
@export_range(0, 1) var alpha_cutoff := 0.0
@export var contact_protection_map: Texture2D
@export_range(0, 1) var contact_protection := 0.0
