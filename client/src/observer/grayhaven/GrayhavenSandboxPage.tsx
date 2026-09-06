import { useCallback, useEffect, useRef, useState } from "react";
import { GrayhavenWorld, type LightMode } from "./GrayhavenWorld";
import { loadGrayhavenArt } from "./painterlyArt";
import { locations, roadPaths, type Region } from "./layout";
import "./grayhaven.css";

const regions: { id: Region; name: string }[] = [{ id: "town", name: "小镇" }, { id: "coast", name: "海岸" }, { id: "forest", name: "红杉林与山地" }];
const moods: { id: LightMode; name: string }[] = [{ id: "afternoon", name: "午后" }, { id: "sunset", name: "落日" }, { id: "bluehour", name: "蓝调" }];

export default function GrayhavenSandboxPage() {
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const world = useRef<GrayhavenWorld | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [mood, setMood] = useState<LightMode>("afternoon");
  const [fog, setFog] = useState(0.24);
  const [labels, setLabels] = useState(true);
  const [roads, setRoads] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const select = useCallback((id: string) => {
    setSelected(id); setExpanded(false); setIndexOpen(false); world.current?.select(id);
  }, []);
  const reset = useCallback(() => { setSelected(null); setIndexOpen(false); world.current?.reset(); }, []);

  useEffect(() => {
    document.title = "Grayhaven · 灰港镇";
    let instance: GrayhavenWorld | null = null;
    let cancelled = false;
    const started = performance.now();
    loadGrayhavenArt().then(art => {
      if (cancelled) { art.dispose(); return; }
      try {
        instance = new GrayhavenWorld(host.current!, labelHost.current!, {
          onSelect: select,
          onZoom: value => setZoom(Math.round(value * 100)),
          onError: setError,
        }, art);
        host.current!.dataset.loadMs = String(Math.round(performance.now() - started));
        world.current = instance; setReady(true);
      } catch (cause) { art.dispose(); throw cause; }
    }).catch(cause => {
      if (cancelled) return;
      console.error("Grayhaven scene could not initialize", cause);
      host.current?.replaceChildren(); labelHost.current?.replaceChildren();
      setError("当前设备无法显示三维地图。你仍然可以通过地点目录阅读灰港镇。");
    });
    return () => { cancelled = true; instance?.dispose(); world.current = null; };
  }, [select]);

  useEffect(() => { world.current?.setAtmosphere(mood, fog); }, [ready, mood, fog]);
  useEffect(() => { world.current?.setLabels(labels); }, [ready, labels]);
  useEffect(() => { world.current?.setRoads(roads); }, [ready, roads]);
  // Preserve selections made through the text directory while art is loading.
  useEffect(() => { world.current?.select(selected); }, [ready, selected]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.key === "+" || event.key === "=") world.current?.zoomBy(1.2);
      if (event.key === "-") world.current?.zoomBy(1 / 1.2);
      if (event.key === "0") reset();
      if (event.key === "Escape") { setIndexOpen(false); setSelected(null); world.current?.select(null, false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  const place = locations.find(location => location.id === selected);
  const connections = place ? roadPaths.filter(road => road.from === place.id || road.to === place.id) : [];

  return <main className="gh-sandbox">
    <div className="gh-canvas" ref={host} />
    <div className="gh-film" aria-hidden="true" />
    <div className="gh-labels" ref={labelHost} />
    <header className="gh-heading">
      <p className="gh-eyebrow">NORTHERN CALIFORNIA · 1985</p>
      <h1>Grayhaven<span>灰 港 镇</span></h1>
      <p className="gh-caption">海岸、旧街与红杉林之间</p>
    </header>
    <div className="gh-top-right">
      <span className="gh-preview">世界地图 <i /> 静态预览</span>
      <button className="gh-index-toggle" onClick={() => setIndexOpen(!indexOpen)} aria-expanded={indexOpen} aria-controls="gh-place-index">
        <span aria-hidden="true">☷</span> 地点目录 <small>{locations.length}</small>
      </button>
    </div>

    {indexOpen && <aside id="gh-place-index" className="gh-index gh-paper" aria-label="地点目录">
      <div className="gh-panel-title"><span>灰港镇 · 地点目录</span><button aria-label="关闭地点目录" onClick={() => setIndexOpen(false)}>×</button></div>
      {regions.map(region => <section key={region.id}>
        <h2>{region.name}</h2>
        {locations.filter(location => location.region === region.id).map(location => <button key={location.id} className="gh-place-row" onClick={() => select(location.id)}>
          <span>{location.name}<small>{location.english}</small></span><span aria-hidden="true">↗</span>
        </button>)}
      </section>)}
    </aside>}

    {place && <aside className="gh-place gh-paper" aria-label="地点说明" key={place.id}>
      <div className="gh-panel-title"><span>FIELD NOTES / 地点手记</span><button aria-label="关闭地点说明" onClick={() => { setSelected(null); world.current?.select(null, false); }}>×</button></div>
      <p className="gh-place-en">{place.english}</p><h2>{place.name}</h2>
      <p className={expanded ? "gh-description is-expanded" : "gh-description"}>{place.description}</p>
      <button className="gh-read-more" onClick={() => setExpanded(!expanded)}>{expanded ? "收起手记 −" : "阅读完整手记 +"}</button>
      {connections.length > 0 && <div className="gh-connections"><h3>沿路前往 <span>模组步行时间</span></h3>
        {connections.map(road => {
          const next = locations.find(location => location.id === (road.from === place.id ? road.to : road.from))!;
          return <button key={road.id} onClick={() => select(next.id)} title={road.name}><span>{next.name}</span><small>{road.minutes} 分钟 ↗</small></button>;
        })}
      </div>}
    </aside>}

    {error ? <div className="gh-error gh-paper" role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>重新载入</button><button onClick={() => setIndexOpen(true)}>查看地点</button></div>
      : !ready && <div className="gh-loading" role="status">正在展开灰港镇…</div>}

    <nav className="gh-map-controls" aria-label="地图操作">
      <button aria-label="放大地图" title="放大 (+)" onClick={() => world.current?.zoomBy(1.25)}>+</button>
      <button aria-label="缩小地图" title="缩小 (-)" onClick={() => world.current?.zoomBy(0.8)}>−</button>
      <button aria-label="回到全景" title="回到全景 (0)" onClick={reset}>⌖</button>
      <span />
      <button aria-label="地点标注" title="地点标注" aria-pressed={labels} onClick={() => setLabels(!labels)}>Aa</button>
      <button aria-label="道路指引" title="道路指引" aria-pressed={roads} onClick={() => setRoads(!roads)}>⌁</button>
    </nav>

    <footer className="gh-footer">
      <div className="gh-map-note"><span className="gh-note-line" /><p>16 处户外地点 · 19 条道路<small>地形为示意布局 · 拖动平移，滚轮缩放</small></p></div>
      <div className="gh-atmosphere" aria-label="画面氛围预览">
        <span className="gh-atmosphere-title">光与雾<small>画面预览</small></span>
        <div className="gh-moods">{moods.map(option => <button key={option.id} aria-pressed={mood === option.id} onClick={() => setMood(option.id)}>{option.name}</button>)}</div>
        <label className="gh-fog">海雾 <input aria-label="海雾浓度" type="range" min="0" max="1" step="0.01" value={fog} onChange={event => setFog(Number(event.target.value))} /><output>{Math.round(fog * 100)}%</output></label>
      </div>
      <div className="gh-compass" aria-label={`缩放 ${zoom}%`}><span aria-hidden="true">N<br />↑</span><small>{zoom}%</small></div>
    </footer>
  </main>;
}
