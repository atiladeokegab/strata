// Map controls (top right: view, exploded, LiDAR and the photo tools) and the slim time bar (bottom: timeline, bascules).
import { useStore, FIRST_YEAR, THIS_YEAR } from '../store'
import { STAGES } from '../scene/bridge/stages.js'

const VIEWS = [['orbit', 'Orbit'], ['top', 'Top'], ['walk', 'Walk']]

// children are the photo tools (Reimagine, Vision); this wrapper has no backdrop-filter so their fixed modals cover the page
export function Controls({ children }) {
  const { view, setView, exploded, setExploded, lidar, setLidar } = useStore()
  return (
    <div className="controls">
      <div className="seg glass" role="radiogroup" aria-label="View">
        {VIEWS.map(([v, name]) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{name}</button>
        ))}
      </div>
      <div className="toggles glass">
        <button type="button" aria-pressed={exploded} className={exploded ? 'on' : ''} onClick={() => setExploded(!exploded)}>Exploded</button>
        <button type="button" aria-pressed={lidar} className={lidar ? 'on' : ''} onClick={() => setLidar(!lidar)}>LiDAR</button>
      </div>
      {children}
    </div>
  )
}

export function Dock() {
  const { year, setYear, bascule, setBascule, place } = useStore()
  const events = (place?.events || []).filter((e) => e.year <= year).sort((a, b) => a.year - b.year)
  // the latest thing that had happened by this year: a construction stage or a dated event, whichever is more recent
  const stage = STAGES.filter((s) => s.from <= year).at(-1)
  const ev = events.at(-1)
  const now = ev && (!stage || ev.year > stage.from) ? ev.title : stage?.label
  const maxAngle = place?.parts.find((p) => p.dims?.max_angle)?.dims.max_angle.value ?? 86
  return (
    <div className="dock glass">
      <label className="timeline">
        <span className="row"><span className="year num">{year === THIS_YEAR ? 'Today' : year}</span><span className="event">{now || 'Before construction'}</span></span>
        <input type="range" min={FIRST_YEAR} max={THIS_YEAR} step={1} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" />
        <span className="ticks" aria-hidden="true">
          {(place?.events || []).map((e) => <i key={e.year + e.title} style={{ left: `${((e.year - FIRST_YEAR) / (THIS_YEAR - FIRST_YEAR)) * 100}%` }} />)}
        </span>
      </label>
      <label className="bascule">
        <span className="row"><span>Bascules</span><span className="num">{Math.round(bascule * maxAngle)}°</span></span>
        <input type="range" min={0} max={1} step={0.01} value={bascule} onChange={(e) => setBascule(Number(e.target.value))} aria-label="Bascule opening" />
      </label>
    </div>
  )
}
