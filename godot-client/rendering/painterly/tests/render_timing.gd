extends RefCounted
## Main viewport render work; settled capture viewports do not redraw. Wall frame
## time includes VSync/scheduling and is reported separately from GPU/CPU work.
static func measure(viewport: Viewport, warmup: int=24, frames: int=90) -> Dictionary:
    var rid := viewport.get_viewport_rid()
    RenderingServer.viewport_set_measure_render_time(rid,true)
    for i in warmup: await RenderingServer.frame_post_draw
    var gpu: Array[float]=[]
    var cpu: Array[float]=[]
    var wall: Array[float]=[]
    var previous := Time.get_ticks_usec()
    for i in frames:
        await RenderingServer.frame_post_draw
        var now := Time.get_ticks_usec()
        wall.append((now-previous)/1000.0)
        previous=now
        gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(rid))
        cpu.append(RenderingServer.viewport_get_measured_render_time_cpu(rid))
    gpu.sort(); cpu.sort(); wall.sort()
    return {"samples":frames,"viewport_pixels":[viewport.get_visible_rect().size.x,viewport.get_visible_rect().size.y],
        "gpu_median_ms":gpu[frames/2] if gpu[frames/2]>0 else null,
        "gpu_p95_ms":gpu[int(frames*0.95)] if gpu[frames/2]>0 else null,
        "render_cpu_median_ms":cpu[frames/2],"frame_median_ms":wall[frames/2],"frame_p95_ms":wall[int(frames*0.95)],
        "gpu_note":"Viewport GPU timer; null means unavailable, never zero cost."}
