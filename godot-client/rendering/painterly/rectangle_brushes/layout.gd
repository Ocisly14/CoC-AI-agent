extends RefCounted
## Adjacent equal-width rectangles overlap by the requested fraction exactly.
## Clockwise means increasing atan2(z,x), seen from above with +X on the right.
var texture: ImageTexture
var counts=PackedInt32Array()
var bands: Array=[]
var signature := ""

func rebuild(lo: PackedVector4Array,hi: PackedVector4Array,count: int,direction: Vector3,base_width: float,settings: Resource) -> void:
    var new_signature=str([lo,hi,count,direction,base_width,settings.seed,settings.painting_revision,settings.clockwise,settings.overlap_min,settings.overlap_max])
    if new_signature==signature:return
    signature=new_signature
    var image_=Image.create(64,32,false,Image.FORMAT_RGBAF)
    counts.clear();counts.resize(32);bands.clear()
    var trail=-Vector2(direction.x,direction.z).normalized()
    if trail.length_squared()<0.01:trail=Vector2.RIGHT
    var across=Vector2(-trail.y,trail.x)
    for caster in count:
        var half=Vector2(hi[caster].x-lo[caster].x,hi[caster].z-lo[caster].z)*0.5
        var full=maxf(2*across.abs().dot(half),0.08)
        var rng=RandomNumberGenerator.new()
        rng.seed=(str(lo[caster].w)+"/"+str(settings.seed)+"/"+str(settings.painting_revision)).hash()
        var positions: Array[float]=[0.0]
        var overlaps: Array[float]=[0.0]
        while positions[-1]+1.0<full/maxf(base_width,0.08) and positions.size()<64:
            var overlap=rng.randf_range(clampf(minf(settings.overlap_min,settings.overlap_max),0.3,0.6),clampf(maxf(settings.overlap_min,settings.overlap_max),0.3,0.6))
            positions.append(positions[-1]+1-overlap);overlaps.append(overlap)
        var span=positions[-1]+1.0
        var ordered: Array=[]
        for index in positions.size():
            var lateral=((positions[index]+0.5)/span-0.5)*full
            var origin=across*lateral
            var axis=Vector2(trail.x if absf(trail.x)>0.0001 else 0.0001,trail.y if absf(trail.y)>0.0001 else 0.0001)
            var a=(-half-origin)/axis;var b=(half-origin)/axis
            var leave=minf(maxf(a.x,b.x),maxf(a.y,b.y))
            var root=origin+trail*leave
            ordered.append({"index":index,"center":lateral/full,"width":1.0/span,"overlap":overlaps[index],"angle":fposmod(atan2(root.y,root.x),TAU)})
        ordered.sort_custom(func(a,b):return a.angle<b.angle if settings.clockwise else a.angle>b.angle)
        counts[caster]=ordered.size()
        for order in ordered.size():
            var band: Dictionary=ordered[order]
            image_.set_pixel(order,caster,Color(band.center,band.width,band.index,band.overlap))
        bands.append(ordered)
    if texture==null:texture=ImageTexture.create_from_image(image_)
    else:texture.update(image_)
