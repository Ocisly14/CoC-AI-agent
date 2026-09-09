extends RefCounted
## Remove the building footprint from the street before either native rendering
## or painterly conversion. The imported sidewalk and indoor floor share Y=0.18.

static func cut(ground: MeshInstance3D, floor_mesh: MeshInstance3D) -> void:
	var points := PackedVector2Array()
	var to_ground := ground.global_transform.affine_inverse() * floor_mesh.global_transform
	for surface in floor_mesh.mesh.get_surface_count():
		var arrays := floor_mesh.mesh.surface_get_arrays(surface)
		for vertex in arrays[Mesh.ARRAY_VERTEX]:
			var p: Vector3 = to_ground * vertex
			points.append(Vector2(p.x, p.z))
	# Bluebird's ground-floor outline is convex, including its diagonal entrance.
	# Derive it from the actual floor, not the coarse shadow-caster rectangles.
	var outline := Geometry2D.convex_hull(points)
	if outline.size() < 4: return
	outline.remove_at(outline.size() - 1) # convex_hull repeats the first point.
	if Geometry2D.is_polygon_clockwise(outline): outline.reverse()
	var result := ArrayMesh.new()
	for surface in ground.mesh.get_surface_count():
		var arrays := ground.mesh.surface_get_arrays(surface)
		var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if indices.is_empty():
			for i in positions.size(): indices.append(i)
		var builder := SurfaceTool.new()
		builder.begin(Mesh.PRIMITIVE_TRIANGLES)
		builder.set_material(ground.mesh.surface_get_material(surface))
		for start in range(0, indices.size(), 3):
			var inside: Array = []
			for j in 3:
				var i := indices[start + j]
				inside.append({"p": positions[i], "n": normals[i], "uv": uvs[i]})
			# Subtract a convex footprint by successively splitting at its edges.
			# Each emitted exterior polygon is convex, so no hole triangulation is
			# needed even when the building lies entirely inside a street triangle.
			for edge in outline.size():
				if inside.size() < 3: break
				var a := outline[edge]
				var b := outline[(edge + 1) % outline.size()]
				var outside := half_plane(inside, a, b, false)
				for j in range(1, outside.size() - 1):
					var triangle: Array = [outside[0], outside[j], outside[j + 1]]
					if (triangle[1].p - triangle[0].p).cross(triangle[2].p - triangle[0].p).length_squared() < 0.0000000001: continue
					for v in triangle:
						builder.set_normal(v.n.normalized())
						builder.set_uv(v.uv)
						builder.add_vertex(v.p)
				inside = half_plane(inside, a, b, true)
		builder.commit(result)
	ground.mesh = result
	ground.set_meta("building_footprint", outline)

static func half_plane(polygon: Array, a: Vector2, b: Vector2, keep_inside: bool) -> Array:
	var result: Array = []
	if polygon.is_empty(): return result
	var previous: Dictionary = polygon.back()
	var previous_distance := (b - a).cross(Vector2(previous.p.x, previous.p.z) - a)
	for current in polygon:
		var distance := (b - a).cross(Vector2(current.p.x, current.p.z) - a)
		var previous_kept := previous_distance >= 0.0 if keep_inside else previous_distance <= 0.0
		var kept := distance >= 0.0 if keep_inside else distance <= 0.0
		if previous_kept != kept:
			var t := previous_distance / (previous_distance - distance)
			result.append({"p": previous.p.lerp(current.p, t), "n": previous.n.lerp(current.n, t), "uv": previous.uv.lerp(current.uv, t)})
		if kept: result.append(current)
		previous = current
		previous_distance = distance
	return result
