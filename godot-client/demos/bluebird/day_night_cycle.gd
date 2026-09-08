extends RefCounted
## Art-directed equinox-like preview, not an astronomical ephemeris.
## One active celestial light: both approach zero energy at the horizon handoff.

static func sample(hour: float) -> Dictionary:
	var h = fposmod(hour, 24.0)
	var day = h >= 6.0 and h < 18.0
	var phase = (h - 6.0) / 12.0 if day else fposmod(h - 18.0, 24.0) / 12.0
	var height = maxf(sin(phase * PI), 0.0)
	var sun_height = sin((h - 6.0) / 12.0 * PI)
	var daylight = smoothstep(-0.14, 0.35, sun_height)
	var twilight = (1.0 - smoothstep(0.0, 0.3, absf(sun_height)))
	var warm = smoothstep(0.02, 0.55, height)
	var color = Color("ff9857").lerp(Color("fff0d6"), warm) if day else Color("7d91c4").lerp(Color("b8cced"), warm)
	var ambient = Color("667ba5").lerp(Color("afc3dd"), daylight)
	ambient = ambient.lerp(Color("b49ba8"), twilight * 0.25)
	return {
		"hour": h, "source": "太阳" if day else "月亮", "is_day": day,
		"azimuth": lerpf(-90.0, 90.0, phase),
		# A small elevation floor bounds artistic shadow lengths near the horizon.
		"elevation": maxf(5.0, height * (60.0 if day else 45.0)),
		"energy": (1.10 if day else 0.16) * smoothstep(0.0, 0.22, height) * lerpf(0.45, 1.0, height),
		"color": color, "ambient_color": ambient,
		"ambient_energy": lerpf(0.10, 0.55, daylight),
		"background_color": Color("172239").lerp(Color("a4b7c2"), daylight)
	}
