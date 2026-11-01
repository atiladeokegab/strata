// "See it in <year>": capture the 3D view, ask the server for a period photograph, compare them with a slider.
// At a fixed view (reimagine/views.js) in a cached year, the photograph generated earlier shows instantly.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { VIEWS, capture, nearView } from './reimagine/views'
import './reimagine/reimagine.css'

const MODEL_FALLBACK = 'gpt-image-2.5-flare'
const BASE = '/reimagine/'
let manifest = null
const loadManifest = () =>
  (manifest ??= fetch(`${BASE}manifest.json`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })))

const cachedState = (m, it) => ({
  status: 'done', cached: true, view: it.view, year: it.year, aspect: it.aspect,
  before: BASE + it.before, after: BASE + it.file, model: m.model,
})

export default function Reimagine() {
  const year = useStore((s) => s.year)
  const [state, setState] = useState(null) // null | {status: 'busy'|'done'|'error', before, year, aspect, view?, cached?, after?, model?, error?}
  const [m, setM] = useState({ items: [] })
  const [split, setSplit] = useState(50)
  const [secs, setSecs] = useState(0)

  useEffect(() => { loadManifest().then(setM) }, [])

  const run = async (before, y, aspect, view) => {
    setState({ before, year: y, aspect, view, status: 'busy' })
    setSecs(0)
    try {
      const r = await fetch('/api/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: before, year: y }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'Something went wrong. Try again.')
      setState({ before, year: j.year, aspect, view, status: 'done', after: j.image, model: j.model })
      setSplit(50)
    } catch (e) {
      setState({ before, year: y, aspect, view, status: 'error', error: e.message || 'Something went wrong. Try again.' })
    }
  }

  const open = () => {
    const view = nearView()
    const hit = view && m.items.find((it) => it.view === view && Math.abs(it.year - year) <= 2)
    if (hit) { setState(cachedState(m, hit)); setSplit(50); return }
    try {
      const { image, aspect } = capture()
      run(image, year, aspect, view)
    } catch (e) {
      setState({ before: null, year, status: 'error', error: e.message })
    }
  }

  useEffect(() => {
    if (state?.status !== 'busy') return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state?.status])

  useEffect(() => {
    if (!state) return
    const onKey = (e) => e.key === 'Escape' && setState(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const stripView = state?.view && VIEWS[state.view] ? state.view : 'hero'
  const strip = m.items.filter((it) => it.view === stripView).sort((a, b) => a.year - b.year)

  return (
    <>
      <button className="rm-open glass" onClick={open} disabled={state?.status === 'busy'}>
        See it in {year}
      </button>
      {state && (
        <div className="rm-backdrop" onClick={() => setState(null)}>
          <div className="rm-modal" role="dialog" aria-modal="true" aria-label={`The view in ${state.year}`} onClick={(e) => e.stopPropagation()}>
            <header className="rm-head">
              <h2>{state.year}</h2>
              <button className="rm-close" onClick={() => setState(null)} aria-label="Close">×</button>
            </header>

            <div className="rm-stage" style={{ aspectRatio: state.aspect || 16 / 9 }}>
              {state.before && <img className="rm-img" src={state.before} alt="The 3D view" />}
              {state.status === 'done' && (
                <>
                  <img key={state.after} className="rm-img rm-after" src={state.after} alt={`The same view as a photograph in ${state.year}`} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
                  <div className="rm-divider" style={{ left: `${split}%` }} />
                  <span className="rm-tag rm-tag-l">3D view</span>
                  <span className="rm-tag rm-tag-r">{state.year}</span>
                  <input className="rm-range" type="range" min="0" max="100" value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Compare the 3D view with the photograph" />
                </>
              )}
              {state.status === 'busy' && (
                <div className="rm-veil" role="status">
                  <div className="rm-spinner" />
                  <p>Developing the photograph of {state.year}…</p>
                  <p className="rm-muted">{secs}s · this takes about 30 seconds</p>
                </div>
              )}
              {state.status === 'error' && (
                <div className="rm-veil" role="alert">
                  <p>{state.error}</p>
                  <button onClick={() => (state.before ? run(state.before, state.year, state.aspect, state.view) : open())}>Try again</button>
                </div>
              )}
            </div>

            <footer className="rm-foot">
              {state.status === 'done'
                ? `${state.cached ? 'Generated earlier' : 'Generated'} by ${state.model || MODEL_FALLBACK} from this exact view. Drag to compare.`
                : `Generated by ${MODEL_FALLBACK}.`}
            </footer>

            {strip.length > 0 && (
              <section className="rm-strip" aria-label="Then and now">
                <h3>Then and now <span className="rm-muted">· {VIEWS[stripView].label}</span></h3>
                <div className="rm-thumbs">
                  {strip.map((it) => (
                    <button
                      key={it.file}
                      className={`rm-thumb${state.cached && state.after === BASE + it.file ? ' on' : ''}`}
                      onClick={() => { setState(cachedState(m, it)); setSplit(50) }}
                      disabled={state.status === 'busy'}
                    >
                      <img src={BASE + it.file} alt="" loading="lazy" />
                      <span>{it.label || it.year}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
