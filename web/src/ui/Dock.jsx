// Bottom controls: view, timeline, exploded, bascule and the LiDAR look.
import { useStore, FIRST_YEAR, THIS_YEAR } from '../store'

const VIEWS = [['orbit', 'Orbit'], ['top', 'Top-down'], ['walk', 'Walk']]

export function Dock() {
  const { view, setView, year, setYear, exploded, setExploded, bascule, setBascule, lidar, setLidar, place } = useStore()
  const events = (place?.events || []).filter((e) => e.year <= year).sort((a, b) => a.year - b.year)
  const now = events.at(-1)
  const maxAngle = place?.parts.find((p) => p.dims?.max_angle)?.dims.max_angle.value ?? 86
  return (
    <div className="dock glass">
      <div className="seg" role="radiogroup" aria-label="View">
        {VIEWS.map(([v, name]) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{name}</button>
        ))}
      </div>
      <label className="timeline">
        <span className="row"><span className="year num">{year === THIS_YEAR ? 'Today' : year}</span><span className="event">{now ? now.title : 'Before construction'}</span></span>
        <input type="range" min={FIRST_YEAR} max={THIS_YEAR} step={1} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" />
        <span className="ticks" aria-hidden="true">
          {(place?.events || []).map((e) => <i key={e.year + e.title} style={{ left: `${((e.year - FIRST_YEAR) / (THIS_YEAR - FIRST_YEAR)) * 100}%` }} />)}
        </span>
      </label>
      <label className="bascule">
        <span className="row"><span>Bascules</span><span className="num">{Math.round(bascule * maxAngle)}°</span></span>
        <input type="range" min={0} max={1} step={0.01} value={bascule} onChange={(e) => setBascule(Number(e.target.value))} aria-label="Bascule opening" />
      </label>
      <div className="toggles">
        <button type="button" aria-pressed={exploded} className={exploded ? 'on' : ''} onClick={() => setExploded(!exploded)}>Exploded</button>
        <button type="button" aria-pressed={lidar} className={lidar ? 'on' : ''} onClick={() => setLidar(!lidar)}>LiDAR</button>
      </div>
    </div>
  )
}
