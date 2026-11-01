// "Through your own eyes": snap or upload a photo of the real bridge; the server names the parts it can see,
// boxes them on the photo, and estimates where you stood so the 3D camera can fly there.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import './reimagine/reimagine.css'
import './identify/identify.css'

const MAX_SIDE = 1600 // downscale before upload: phone photos are big, the model needs far less

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
  const [state, setState] = useState(null) // null | {photo, status: 'busy'|'done'|'error', result?, error?}

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
      <label className="rm-open id-open">
        Your own eyes
        <input type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" onChange={pick} hidden />
      </label>
      {state && (
        <div className="rm-backdrop" onClick={() => setState(null)}>
          <div className="rm-modal" role="dialog" aria-modal="true" aria-label="Your photo of the bridge" onClick={(e) => e.stopPropagation()}>
            <header className="rm-head">
              <h2>Through your own eyes</h2>
              <button className="rm-close" onClick={() => setState(null)} aria-label="Close">×</button>
            </header>

            <div className="id-stage">
              {state.photo && <img className="id-photo" src={state.photo} alt="Your photo" />}
              {res?.is_bridge && res.parts.map(({ id, box }) => (
                <button
                  key={id}
                  className={`id-box${selected === id ? ' id-on' : ''}`}
                  style={{ left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`, width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%` }}
                  onClick={() => select(id)}
                  aria-pressed={selected === id}
                >
                  <span>{name(id)}</span>
                </button>
              ))}
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
            </div>

            {res && (res.is_bridge ? (
              <footer className="id-foot">
                <p><strong>You stood:</strong> {res.where}</p>
                <p className="rm-muted">{res.parts.length ? "Tap a part to learn about it." : "No parts were clear enough to box."} Seen by {res.model}.</p>
                {flyTo && <button className="id-fly" onClick={fly}>Fly to where you stood</button>}
              </footer>
            ) : (
              <footer className="id-foot" role="alert">
                <p><strong>This does not look like Tower Bridge.</strong> {res.where}</p>
              </footer>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
