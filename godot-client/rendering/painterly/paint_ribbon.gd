extends RefCounted
## Scene-wide one-way paint compiled into world-anchored ribbon geometry.
## Two edge sources (geometric contact, screen-space silhouette) produce the
## same shape of data: a world-space polyline plus (donor, receiver) identity.
## No asset names, roof/wall assumptions or recursive colour reads.

const RIBBON_SHADER = preload("res://rendering/painterly/shaders/ribbon.gdshader")
const BRUSH_NAMES := ["solid", "asymmetric", "offset-notch", "knife", "fine-tail"]
const MODE_CONTACT := 0.0
const MODE_SILHOUETTE := 1.0
const MODE_SKY := 2.0

var brush_layers: Texture2DArray
var brush_regions := PackedVector4Array()
var stamps: Array[Dictionary] = []
var seams: Array[Dictionary] = []
var ribbons := {}          # paint_id -> MeshInstance3D
var stats := {}
var errors: Array[String] = []
var _images := {}
var _geometry := {}
var _signature := ""
var build_count := 0
var _camera_forward := Vector3.FORWARD
var _paint_orders := {}    # paint_id -> paint_order, for render_priority

func anchor_transform(renderer: Node) -> Transform3D:
	var node := renderer.get_parent()
	while node != null:
		if node is Node3D: return node.global_transform
		node = node.get_parent()
	return Transform3D.IDENTITY

func signature(renderer: Node, records: Array) -> String:
	var anchor := anchor_transform(renderer).affine_inverse()
	var values: Array = []
	for record in records:
		if not is_instance_valid(record.mesh): continue
		var t: Transform3D = anchor * record.mesh.global_transform
		# Rigid movement of the whole scene must not reseed or repaint it.
		var rounded: Array = []
		for v in [t.basis.x,t.basis.y,t.basis.z,t.origin]:
			rounded.append(Vector3(snappedf(v.x,0.0001),snappedf(v.y,0.0001),snappedf(v.z,0.0001)))
		values.append([record.mesh.mesh.get_instance_id() if record.mesh.mesh!=null else 0,record.mesh.is_visible_in_tree(),rounded])
	return str(values)

func needs_rebuild(renderer: Node, records: Array) -> bool:
	return _signature != signature(renderer,records)

func load_brushes() -> void:
	if brush_layers != null: return
	var layers: Array[Image] = []
	for variant in BRUSH_NAMES:
		var image: Image = load("res://rendering/painterly/textures/oil-shadow-%s-preview-v1.png" % variant).get_image()
		if image.is_compressed(): image.decompress()
		image.convert(Image.FORMAT_RGBA8)
		image.resize(1024,384,Image.INTERPOLATE_LANCZOS)
		var lo := Vector2i(1024,384)
		var hi := Vector2i.ZERO
		for y in range(0,384,4):
			for x in range(0,1024,4):
				if image.get_pixel(x,y).a > 0.1:
					lo = lo.min(Vector2i(x,y)); hi = hi.max(Vector2i(x,y))
		brush_regions.append(Vector4(lo.x/1024.0,lo.y/384.0,(hi.x-lo.x+4)/1024.0,(hi.y-lo.y+4)/384.0))
		image.generate_mipmaps()
		layers.append(image)
	brush_layers = Texture2DArray.new()
	assert(brush_layers.create_from_images(layers)==OK)

func key_point(p: Vector3) -> String:
	return "%d,%d,%d" % [roundi(p.x*10000),roundi(p.y*10000),roundi(p.z*10000)]

func edge_cells(a: Vector3,b: Vector3,padding: float) -> Array[Vector3i]:
	var lo:=a.min(b)-Vector3.ONE*padding
	var hi:=a.max(b)+Vector3.ONE*padding
	var cells: Array[Vector3i]=[]
	for z in range(floori(lo.z),floori(hi.z)+1):
		for y in range(floori(lo.y),floori(hi.y)+1):
			for x in range(floori(lo.x),floori(hi.x)+1): cells.append(Vector3i(x,y,z))
	return cells

func geometry(record: Dictionary, anchor_inverse: Transform3D) -> Dictionary:
	var node: MeshInstance3D = record.mesh
	var transform: Transform3D = anchor_inverse*node.global_transform
	var triangles: Array[Dictionary] = []
	var edges := {}
	for surface in node.mesh.get_surface_count():
		if node.mesh is ArrayMesh and node.mesh.surface_get_primitive_type(surface)!=Mesh.PRIMITIVE_TRIANGLES: continue
		var a: Array = node.mesh.surface_get_arrays(surface)
		var vertices: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
		if vertices.is_empty(): continue
		var normals_in: PackedVector3Array = a[Mesh.ARRAY_NORMAL] if a[Mesh.ARRAY_NORMAL]!=null else PackedVector3Array()
		var indices: PackedInt32Array = a[Mesh.ARRAY_INDEX]
		var uv: PackedVector2Array = a[Mesh.ARRAY_TEX_UV] if a[Mesh.ARRAY_TEX_UV] != null else PackedVector2Array()
		if indices.is_empty():
			for i in vertices.size(): indices.append(i)
		for i in range(0,indices.size()-2,3):
			var ids := [indices[i],indices[i+1],indices[i+2]]
			var p := [transform*vertices[ids[0]],transform*vertices[ids[1]],transform*vertices[ids[2]]]
			var cross_: Vector3 = (p[1]-p[0]).cross(p[2]-p[0])
			if cross_.length_squared()<0.0000000001: continue
			var tri := {"p":p,"uv":[uv[ids[0]],uv[ids[1]],uv[ids[2]]] if not uv.is_empty() else [Vector2.ZERO,Vector2.ZERO,Vector2.ZERO],"normal":cross_.normalized()}
			if not normals_in.is_empty(): tri.normal=(transform.basis.inverse().transposed()*normals_in[ids[0]]).normalized()
			tri.center=(p[0]+p[1]+p[2])/3.0
			triangles.append(tri)
			for j in 3:
				var pa: Vector3 = p[j]; var pb: Vector3 = p[(j+1)%3]
				# Position welding removes triangulation and UV-island edges.
				var ka := key_point(pa); var kb := key_point(pb)
				var key := ka+"|"+kb if ka<kb else kb+"|"+ka
				if edges.has(key):
					edges[key].count += 1
					edges[key].incident.append(tri)
				else: edges[key]={"a":pa,"b":pb,"tri":tri,"count":1,"incident":[tri]}
	var boundary: Array[Dictionary] = []
	for edge in edges.values():
		if edge.a.distance_to(edge.b)<=0.01: continue
		if edge.count==1: boundary.append(edge)
		else:
			var normals: Array[Vector3]=[]
			for tri in edge.incident:
				var unique:=true
				for normal in normals:
					if normal.dot(tri.normal)>0.96: unique=false
				if unique: normals.append(tri.normal)
			if normals.size()>1:
				for normal in normals:
					for tri in edge.incident:
						if normal.dot(tri.normal)>0.96:
							boundary.append({"a":edge.a,"b":edge.b,"tri":tri,"count":edge.count})
							break
	var grid: Dictionary={}
	for i in boundary.size():
		for cell in edge_cells(boundary[i].a,boundary[i].b,0.001):
			if not grid.has(cell): grid[cell]=[]
			grid[cell].append(i)
	var tri_grid: Dictionary={}
	for i in triangles.size():
		var tri: Dictionary=triangles[i]
		var lo: Vector3=tri.p[0].min(tri.p[1]).min(tri.p[2])
		var hi: Vector3=tri.p[0].max(tri.p[1]).max(tri.p[2])
		for cell in edge_cells(lo,hi,0.001):
			if not tri_grid.has(cell): tri_grid[cell]=[]
			tri_grid[cell].append(i)
	return {"triangles":triangles,"tri_grid":tri_grid,"edges":boundary,"edge_grid":grid,"transform":transform,"bounds":transform*node.mesh.get_aabb()}

func inward(edge: Dictionary) -> Vector3:
	var tangent: Vector3 = (edge.b-edge.a).normalized()
	var to_center: Vector3 = edge.tri.center-(edge.a+edge.b)*0.5
	return (to_center-tangent*to_center.dot(tangent)).normalized()

func match_edges(source: Dictionary, receiver: Dictionary, tolerance: float) -> Dictionary:
	var t: Vector3 = (receiver.b-receiver.a).normalized()
	var st: Vector3 = (source.b-source.a).normalized()
	if absf(t.dot(st))<0.995: return {}
	var len_: float = receiver.a.distance_to(receiver.b)
	var s0: float = (source.a-receiver.a).dot(t)
	var s1: float = (source.b-receiver.a).dot(t)
	var lo := maxf(0,minf(s0,s1)); var hi := minf(len_,maxf(s0,s1))
	if hi-lo<0.025: return {}
	var mid: Vector3 = receiver.a+t*(lo+hi)*0.5
	var nearest: Vector3 = Geometry3D.get_closest_point_to_segment(mid,source.a,source.b)
	if mid.distance_to(nearest)>tolerance: return {}
	# Coplanar faces must occupy opposite sides of the shared boundary.
	if absf(source.tri.normal.dot(receiver.tri.normal))>0.98 and inward(source).dot(inward(receiver))>0.0: return {}
	return {"a":receiver.a+t*lo,"b":receiver.a+t*hi,"tangent":t,"inward":inward(receiver),"normal":receiver.tri.normal}

func match_face(edge: Dictionary, tri: Dictionary, tolerance: float) -> Dictionary:
	# T-junction: an edge contacts the interior of a perpendicular receiver face.
	if absf(edge.tri.normal.dot(tri.normal))>0.90: return {}
	var da: float=(edge.a-tri.p[0]).dot(tri.normal)
	var db: float=(edge.b-tri.p[0]).dot(tri.normal)
	if maxf(absf(da),absf(db))>tolerance: return {}
	var pa: Vector3=edge.a-tri.normal*da; var pb: Vector3=edge.b-tri.normal*db
	var wa:=barycentric(pa,tri);var wb:=barycentric(pb,tri)
	var lo:=0.0;var hi:=1.0
	for i in 3:
		var delta:=wb[i]-wa[i]
		if absf(delta)<0.000001:
			if wa[i]<-0.00001: return {}
		elif delta>0: lo=maxf(lo,-wa[i]/delta)
		else: hi=minf(hi,-wa[i]/delta)
	if hi<=lo: return {}
	var a:=pa.lerp(pb,lo);var b:=pa.lerp(pb,hi)
	if a.distance_to(b)<0.025: return {}
	var into: Vector3=-edge.tri.normal+tri.normal*edge.tri.normal.dot(tri.normal)
	return {"a":a,"b":b,"tangent":(b-a).normalized(),"inward":into.normalized(),"normal":tri.normal}

func merge_segment(list: Array[Dictionary], segment: Dictionary, tolerance: float) -> void:
	for old in list:
		if old.source_id!=segment.source_id or old.receiver_id!=segment.receiver_id: continue
		if old.normal.dot(segment.normal)<0.995 or old.inward.dot(segment.inward)<0.995: continue
		if absf(old.tangent.dot(segment.tangent))<0.995: continue
		var offset: Vector3 = segment.a-old.a
		if (offset-old.tangent*offset.dot(old.tangent)).length()>0.003: continue
		var lo: float = (segment.a-old.a).dot(old.tangent)
		var hi: float = (segment.b-old.a).dot(old.tangent)
		var mn := minf(lo,hi); var mx := maxf(lo,hi)
		var length_: float = old.a.distance_to(old.b)
		if mn>length_+tolerance or mx< -tolerance: continue
		old.b=old.a+old.tangent*maxf(length_,mx)
		old.a+=old.tangent*minf(0,mn)
		return
	list.append(segment)

func barycentric(point: Vector3, tri: Dictionary) -> Vector3:
	var a: Vector3=tri.p[0]; var b: Vector3=tri.p[1]; var c: Vector3=tri.p[2]
	var v0:=b-a; var v1:=c-a; var v2:=point-a
	var d00:=v0.dot(v0); var d01:=v0.dot(v1); var d11:=v1.dot(v1)
	var d20:=v2.dot(v0); var d21:=v2.dot(v1)
	var den:=d00*d11-d01*d01
	var v: float=(d11*d20-d01*d21)/den
	var w: float=(d00*d21-d01*d20)/den
	return Vector3(1-v-w,v,w)

func nearest_triangle(point: Vector3, triangles: Array) -> Dictionary:
	var distance := INF
	var result := {}
	for tri in triangles:
		var projected: Vector3=point-tri.normal*(point-tri.p[0]).dot(tri.normal)
		var weights:=barycentric(projected,tri)
		var closest:=projected
		if weights.x<0 or weights.y<0 or weights.z<0:
			var best:=INF
			for i in 3:
				var candidate:=Geometry3D.get_closest_point_to_segment(point,tri.p[i],tri.p[(i+1)%3])
				var d:=point.distance_squared_to(candidate)
				if d<best: best=d;closest=candidate
		var d:=point.distance_squared_to(closest)
		if d<distance:
			distance=d; result={"triangle":tri,"weights":barycentric(closest,tri),"point":closest,"distance":sqrt(d)}
	return result

func texture_color(texture: Texture2D, uv: Vector2) -> Color:
	var id:=texture.get_instance_id()
	if not _images.has(id):
		var im:=texture.get_image()
		if im.is_compressed(): im.decompress()
		_images[id]=im
	var image: Image=_images[id]
	var x:=fposmod(uv.x,1.0)*image.get_width()-0.5
	var y:=fposmod(uv.y,1.0)*image.get_height()-0.5
	var xi:=floori(x);var yi:=floori(y)
	var a:=image.get_pixel(posmod(xi,image.get_width()),posmod(yi,image.get_height())).srgb_to_linear()
	var b:=image.get_pixel(posmod(xi+1,image.get_width()),posmod(yi,image.get_height())).srgb_to_linear()
	var c:=image.get_pixel(posmod(xi,image.get_width()),posmod(yi+1,image.get_height())).srgb_to_linear()
	var d:=image.get_pixel(posmod(xi+1,image.get_width()),posmod(yi+1,image.get_height())).srgb_to_linear()
	return a.lerp(b,x-xi).lerp(c.lerp(d,x-xi),y-yi)

func sample_source(record: Dictionary, geom: Dictionary, point: Vector3, tangent: Vector3) -> Color:
	var color:=Color(0,0,0,0)
	for offset in [-0.025,0.0,0.025]:
		var sample:=nearest_triangle(point+tangent*offset,geom.triangles)
		var inputs: Resource=record.inputs
		var pigment: Color=inputs.albedo.srgb_to_linear()
		if inputs.albedo_texture != null:
			var weights: Vector3=sample.weights
			var uv: Vector2=sample.triangle.uv[0]*weights.x+sample.triangle.uv[1]*weights.y+sample.triangle.uv[2]*weights.z
			pigment*=texture_color(inputs.albedo_texture,uv)
		color+=pigment/3.0
	color.a=1.0
	return color

func rebuild(renderer: Node, records: Array) -> Dictionary:
	var start:=Time.get_ticks_usec()
	_signature=signature(renderer,records)
	errors.clear(); stamps.clear(); seams.clear(); _images.clear(); _geometry.clear()
	_paint_orders.clear()
	var anchor_inv:=anchor_transform(renderer).affine_inverse()
	var registry: Dictionary={}
	for record in records:
		record.material.set_shader_parameter("seam_stamp_count",0)
		if not is_instance_valid(record.mesh) or record.mesh.mesh==null or not record.mesh.is_visible_in_tree(): continue
		var inputs: Resource=record.inputs
		if not inputs.seam_participation or inputs.seam_protection>=1.0 or inputs.alpha_cutoff>0.0: continue
		var id: String=inputs.paint_id if inputs.paint_id!="" else str(renderer.get_path_to(record.mesh))
		if registry.has(id): errors.append("Duplicate paint ID: "+id);continue
		var geom:=geometry(record,anchor_inv)
		if geom.triangles.is_empty(): continue
		registry[id]=record
		_paint_orders[id]=inputs.paint_order
		_geometry[id]=geom
	var overrides: Dictionary={}
	for override in renderer.seam_overrides:
		var pair: Array[String]=[override.source_id,override.receiver_id];pair.sort()
		var key:=pair[0]+"|"+pair[1]
		if overrides.has(key): errors.append("Duplicate or bidirectional seam override: "+key)
		elif not registry.has(override.source_id) or not registry.has(override.receiver_id): errors.append("Unknown seam override surface: "+key)
		else: overrides[key]=override
	if not errors.is_empty():
		stats={"errors":errors.duplicate(),"stamps":0};return stats
	var ids: Array=registry.keys();ids.sort()
	for i in ids.size():
		for j in range(i+1,ids.size()):
			var aid: String=ids[i];var bid: String=ids[j]
			var ga: Dictionary=_geometry[aid];var gb: Dictionary=_geometry[bid]
			if not ga.bounds.grow(renderer.seam_contact_tolerance_m).intersects(gb.bounds.grow(0.001)): continue
			var a: Dictionary=registry[aid];var b: Dictionary=registry[bid]
			var source_id:=aid;var receiver_id:=bid
			var key:=aid+"|"+bid
			if overrides.has(key):
				if overrides[key].disabled: continue
				source_id=overrides[key].source_id;receiver_id=overrides[key].receiver_id
			else:
				if a.inputs.paint_order==b.inputs.paint_order: continue
				if a.inputs.paint_order<b.inputs.paint_order: source_id=bid;receiver_id=aid
			var receiver_geometry: Dictionary=_geometry[receiver_id]
			for se in _geometry[source_id].edges:
				var candidates: Dictionary={}
				for cell in edge_cells(se.a,se.b,renderer.seam_contact_tolerance_m):
					for index in receiver_geometry.edge_grid.get(cell,[]): candidates[index]=true
				for index in candidates:
					var re: Dictionary=receiver_geometry.edges[index]
					var segment:=match_edges(se,re,renderer.seam_contact_tolerance_m)
					if segment.is_empty(): continue
					segment.source_id=source_id;segment.receiver_id=receiver_id
					merge_segment(seams,segment,0.002)
				if se.a.distance_to(se.b)<0.4: continue
				var face_candidates: Dictionary={}
				for cell in edge_cells(se.a,se.b,renderer.seam_contact_tolerance_m):
					for index in receiver_geometry.tri_grid.get(cell,[]): face_candidates[index]=true
				for index in face_candidates:
					var segment:=match_face(se,receiver_geometry.triangles[index],renderer.seam_contact_tolerance_m)
					if segment.is_empty(): continue
					segment.source_id=source_id;segment.receiver_id=receiver_id
					merge_segment(seams,segment,0.002)
	# Complete transitive merges after arbitrary triangle edge order.
	for iteration in 3:
		var merged: Array[Dictionary]=[]
		for segment in seams: merge_segment(merged,segment,0.002)
		seams=merged
	var drip_candidates: Array[Dictionary]=[]
	var total_length:=0.0;var covered_length:=0.0
	for seam in seams:
		var length_: float=seam.a.distance_to(seam.b)
		if length_<0.4: continue
		var target: Dictionary=registry[seam.receiver_id]
		var inverse: Transform3D=_geometry[seam.receiver_id].transform.affine_inverse()
		var local_key:=key_point(inverse*seam.a)+"|"+key_point(inverse*seam.b)
		var stable_id: String=seam.source_id+">"+seam.receiver_id+":"+local_key
		var rng:=RandomNumberGenerator.new();rng.seed=hash(stable_id)^renderer.seam_seed
		var count:=maxi(1,roundi(length_/3.2))
		var width:=minf(0.32,length_*clampf(renderer.seam_coverage,0,0.15)/count)
		if width<0.025: continue
		var used:=0.0
		for i in count:
			var distance_: float=length_*(i+rng.randf_range(0.22,0.78))/count
			var center: Vector3=seam.a+seam.tangent*distance_
			var ink: Color=sample_source(registry[seam.source_id],_geometry[seam.source_id],center,seam.tangent)
			var stamp: Dictionary={"id":stable_id+":"+str(i),"source_id":seam.source_id,"receiver_id":seam.receiver_id,"center":center,"tangent":seam.tangent,"inward":seam.inward,"normal":seam.normal,"width":width*rng.randf_range(0.72,1.0),"reach":rng.randf_range(0.05,0.20),"opacity":rng.randf_range(0.78,0.98)*(1.0-target.inputs.seam_protection),"color":ink,"variant":0 if rng.randf()<0.55 else rng.randi_range(1,4),"tilt":rng.randf_range(-0.20,0.20),"drip_length":0.0,"drip_width":0.0,"drip_direction":Vector3.ZERO,"order":registry[seam.source_id].inputs.paint_order}
			# Fixed random priority gives a scene-wide sparse cap without depending on registration order.
			stamp.drip_priority=rng.randf()
			stamp.long_drip=rng.randf()>0.70
			var gravity: Vector3=anchor_inv.basis*Vector3.DOWN
			var projected: Vector3=gravity-seam.normal*gravity.dot(seam.normal)
			if projected.length()>0.2 and projected.normalized().dot(seam.inward)>0.4 and stamp.drip_priority<0.12:
				stamp.drip_direction=projected.normalized();drip_candidates.append(stamp)
			# Ribbon geometry needs the two-sided data the material stage never carried.
			stamp.mode = MODE_CONTACT
			# length runs along the seam, max_width reaches inward onto the receiver.
			stamp.length = stamp.width
			stamp.max_width = stamp.reach
			stamp.depth_offset = 0.004
			stamp.donor_normal = _geometry[seam.source_id].triangles[0].normal
			stamp.receiver_albedo = target.inputs.albedo.srgb_to_linear()
			stamp.importance = target.inputs.default_importance
			stamps.append(stamp);used+=stamp.width
		total_length+=length_;covered_length+=used
	drip_candidates.sort_custom(func(a,b): return a.drip_priority<b.drip_priority)
	for stamp in drip_candidates.slice(0,renderer.seam_max_drips):
		stamp.drip_length=0.22 if stamp.long_drip else 0.065
		stamp.drip_width=0.009 if stamp.long_drip else 0.022
	stamps.sort_custom(func(a,b):return a.order<b.order if a.order!=b.order else a.id<b.id)
	if not stamps.is_empty(): load_brushes()
	# Geometry has no per-receiver uniform array, so the 128-stamp wall is gone.
	var receivers := {}
	for stamp in stamps: receivers[stamp.receiver_id]=true
	_signature=signature(renderer,records);build_count+=1
	stats={"build_count":build_count,"build_ms":(Time.get_ticks_usec()-start)/1000.0,"eligible_surfaces":registry.size(),"seams":seams.size(),"receivers":receivers.size(),"stamps":stamps.size(),"vertices":stamps.size()*4,"truncated":0,"contact_stamps":stamps.size(),"silhouette_stamps":0,"sky_stamps":0,"drips":mini(drip_candidates.size(),renderer.seam_max_drips),"seam_length_m":total_length,"covered_length_m":covered_length,"coverage_upper_bound":covered_length/maxf(total_length,0.001),"errors":errors.duplicate()}
	_images.clear()
	return stats

func anchor_node(renderer: Node) -> Node3D:
	var node := renderer.get_parent()
	while node != null:
		if node is Node3D: return node
		node = node.get_parent()
	return null

func build_mesh(own: Array[Dictionary], camera_forward: Vector3) -> ArrayMesh:
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var uv2s := PackedVector2Array()
	var colors := PackedColorArray()
	var custom0 := PackedFloat32Array()
	var custom1 := PackedFloat32Array()
	var indices := PackedInt32Array()
	for stamp in own:
		var t: Vector3 = stamp.tangent
		var c: Vector3 = stamp.center
		var u: Vector3
		if stamp.mode == MODE_CONTACT:
			u = stamp.normal.cross(t).normalized()
			c += stamp.normal * stamp.depth_offset
		else:
			u = t.cross(camera_forward).normalized()
			c -= camera_forward * stamp.depth_offset
		if u.length_squared() < 0.000001: continue
		var half_t: Vector3 = t * (stamp.length * 0.5)
		var half_u: Vector3 = u * (stamp.max_width * 0.5)
		var base := verts.size()
		verts.append_array(PackedVector3Array([c-half_t-half_u, c+half_t-half_u, c+half_t+half_u, c-half_t+half_u]))
		for i in 4: normals.append(stamp.normal)
		uvs.append_array(PackedVector2Array([Vector2(0,0), Vector2(1,0), Vector2(1,1), Vector2(0,1)]))
		for i in 4: uv2s.append(Vector2(stamp.variant, stamp.mode))
		var ink: Color = stamp.color
		for i in 4: colors.append(Color(ink.r, ink.g, ink.b, stamp.opacity))
		var dn: Vector3 = stamp.donor_normal
		var ra: Color = stamp.receiver_albedo
		for i in 4:
			custom0.append_array(PackedFloat32Array([dn.x, dn.y, dn.z, 0.0]))
			custom1.append_array(PackedFloat32Array([ra.r, ra.g, ra.b, stamp.importance]))
		indices.append_array(PackedInt32Array([base, base+1, base+2, base, base+2, base+3]))
	if verts.is_empty(): return null
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_TEX_UV2] = uv2s
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_CUSTOM0] = custom0
	arrays[Mesh.ARRAY_CUSTOM1] = custom1
	arrays[Mesh.ARRAY_INDEX] = indices
	var flags := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) \
		| (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, flags)
	return mesh

## Ribbons hang under the renderer's nearest Node3D ancestor, the same node
## anchor_transform() measures from, so stamp coordinates need no extra transform.
func attach(renderer: Node) -> void:
	var anchor := anchor_node(renderer)
	if anchor == null:
		errors.append("PainterlyRenderer has no Node3D ancestor to anchor ribbons to")
		return
	var wanted := {}
	for stamp in stamps:
		if not wanted.has(stamp.receiver_id): wanted[stamp.receiver_id] = []
		wanted[stamp.receiver_id].append(stamp)
	for id in ribbons.keys():
		if not wanted.has(id):
			if is_instance_valid(ribbons[id]): ribbons[id].queue_free()
			ribbons.erase(id)
	for id in wanted:
		var mesh := build_mesh(wanted[id], _camera_forward)
		if mesh == null: continue
		var node: MeshInstance3D = ribbons.get(id)
		if node == null or not is_instance_valid(node):
			node = MeshInstance3D.new()
			node.name = "Ribbon_" + str(id).replace("/", "_")
			var material := ShaderMaterial.new()
			material.shader = RIBBON_SHADER
			node.material_override = material
			anchor.add_child(node)
			ribbons[id] = node
		node.transform = Transform3D.IDENTITY
		node.mesh = mesh
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var mat: ShaderMaterial = node.material_override
		mat.set_shader_parameter("brushes", brush_layers)
		mat.set_shader_parameter("brush_regions", brush_regions)
		mat.set_shader_parameter("seam_enabled", renderer.seam_enabled)
		mat.set_shader_parameter("seam_strength", renderer.seam_strength)
		mat.render_priority = clampi(int(_paint_orders.get(id, 0)), -128, 127)
	_geometry.clear()
