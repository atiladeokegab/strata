// "Through your own eyes": snap or upload a photo of the real bridge; the server names the parts it can see,
// boxes them on the photo, and estimates where you stood so the 3D camera can fly there.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import './reimagine/reimagine.css'
import './identify/identify.css'

const MAX_SIDE = 1600 // downscale before upload: phone photos are big, the model needs far less
const SAMPLES = '/identify-samples/'
let manifest = null
const loadManifest = () =>
  (manifest ??= fetch(`${SAMPLES}manifest.json`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })))

async function toDataURL(file) {
  const bmp = await createImageBitmap(file) // decodes HEIC on Safari and applies EXIF rotation
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) })
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.9)
}

export default function Identify() {
  const parts = useStore((s) => s.place?.parts) || []
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const flyTo = useStore((s) => s.flyTo)
  const [state, setState] = useState(null) // null | {status: 'pick'|'busy'|'done'|'error', photo?, result?, error?, sample?}
  const [samples, setSamples] = useState([])
  useEffect(() => { loadManifest().then((m) => setSamples(m.items)) }, [])

  const name = (id) => parts.find((p) => p.id === id)?.name || id

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let photo
    try {
      photo = await toDataURL(file)
    } catch {
      return setState({ photo: null, status: 'error', error: 'That file could not be read as a photo. Try a JPEG, PNG or WebP.' })
    }
    setState({ photo, status: 'busy' })
    try {
      const r = await fetch('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: photo }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'Something went wrong. Try again.')
      setState({ photo, status: 'done', result: j })
    } catch (err) {
      setState({ photo, status: 'error', error: err.message || 'Something went wrong. Try again.' })
    }
  }

  const fly = () => {
    const { x, y, z } = state.result.camera
    flyTo?.([x, Math.max(y, -7), z]) // never below the river surface
    setState(null)
  }

  useEffect(() => {
    if (!state) return
    const onKey = (e) => e.key === 'Escape' && setState(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const res = state?.result
  return (
    <>
      <button className="rm-open" onClick={() => setState({ status: 'pick' })}>Your own eyes</button>
      {state && (
        <div className="rm-backdrop" onClick={() => setState(null)}>
          <div className="rm-modal" role="dialog" aria-modal="true" aria-label="Your photo of the bridge" onClick={(e) => e.stopPropagation()}>
            <header className="rm-head">
              <h2>Through your own eyes</h2>
              <button className="rm-close" onClick={() => setState(null)} aria-label="Close">×</button>
            </header>

            {state.status === 'pick' && (
              <div className="id-pick">
                <p>Snap or upload a photo of the real Tower Bridge. The model finds the parts it can see and works out where you stood.</p>
                <label className="id-fly id-upload">
                  Take or choose a photo
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" onChange={pick} hidden />
                </label>
                {samples.length > 0 && <p className="rm-muted">Or try a sample:</p>}
                <div className="id-samples">
                  {samples.map((it) => (
                    <button key={it.file} className="id-sample" onClick={() => setState({ status: 'done', photo: SAMPLES + it.file, result: it.result, sample: it })}>
                      <img src={SAMPLES + it.file} alt="" />
                      <span>{it.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.status !== 'pick' && <div className="id-stage">
              {state.photo && <img className="id-photo" src={state.photo} alt="Your photo" />}
              {res?.is_bridge && res.parts.map(({ id, box: b }) => {
                const c = (v) => Math.min(1, Math.max(0, v)) // a box reaching past the photo edge is clipped by the stage
                const box = { x0: c(b.x0), y0: c(b.y0), x1: c(b.x1), y1: c(b.y1) }
                return (
                <button
                  key={id}
                  className={`id-box${selected === id ? ' id-on' : ''}`}
                  style={{ left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`, width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%`,
                    zIndex: Math.round(1000 - (box.x1 - box.x0) * (box.y1 - box.y0) * 1000) }} // smaller boxes on top, so overlapped labels stay visible
                  onClick={() => select(id)}
                  aria-pressed={selected === id}
                >
                  <span>{name(id)}</span>
                </button>
                )
              })}
              {state.status === 'busy' && (
                <div className="rm-veil" role="status">
                  <div className="rm-spinner" />
                  <p>Looking for the bridge in your photo…</p>
                  <p className="rm-muted">this takes 5 to 12 seconds</p>
                </div>
              )}
              {state.status === 'error' && (
                <div className="rm-veil" role="alert"><p>{state.error}</p></div>
              )}
            </div>}
            {state.sample && (
              <p className="rm-muted id-credit">Photo: <a href={state.sample.source} target="_blank" rel="noreferrer">{state.sample.credit}</a></p>
            )}

            {res?.is_bridge && res.parts.length > 0 && (
              <div className="id-legend">
                {res.parts.map(({ id }) => (
                  <button key={id} type="button" className={selected === id ? 'on' : ''} aria-pressed={selected === id} onClick={() => select(id)}>{name(id)}</button>
                ))}
              </div>
            )}
            {res && (res.is_bridge ? (
              <footer className="id-foot">
                <p><strong>You stood:</strong> {res.where}</p>
                <p className="rm-muted">{res.parts.length ? "Tap a part to learn about it." : "No parts were clear enough to box."} {state.sample ? 'Answered earlier' : 'Seen'} by {res.model}.</p>
                {flyTo && <button className="id-fly" onClick={fly}>Fly to where you stood</button>}
              </footer>
            ) : (
              <footer className="id-foot" role="alert">
                <p><strong>This does not look like Tower Bridge.</strong> {res.where}</p>
                <p className="rm-muted">{state.sample ? 'Answered earlier' : 'Seen'} by {res.model}.</p>
              </footer>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
