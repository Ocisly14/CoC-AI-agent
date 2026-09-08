@tool
extends EditorScenePostImport
## Embedded images need mip levels as well as a mipmap-capable material filter.
## Keep pixels and UVs intact; only build the runtime sampling hierarchy.

func _post_import(scene: Node) -> Object:
	var textures: Dictionary = {}
	for node in scene.find_children("*", "MeshInstance3D", true, false):
		for surface in node.mesh.get_surface_count():
			var material: Material = node.mesh.surface_get_material(surface)
			if not material is BaseMaterial3D:
				continue
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
			var texture: Texture2D = material.albedo_texture
			if texture == null:
				continue
			var key := texture.get_instance_id()
			if not textures.has(key):
				var image := texture.get_image()
				if image.is_compressed():
					image.decompress()
				if not image.has_mipmaps():
					image.generate_mipmaps()
				textures[key] = ImageTexture.create_from_image(image)
				textures[textures[key].get_instance_id()] = textures[key]
			material.albedo_texture = textures[key]
	return scene
