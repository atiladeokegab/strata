// Fixed camera views with pre-generated photographs (web/public/reimagine). Same frame as the tour: x east, y up, z south.
import { _roots } from '@react-three/fiber'
import { useStore } from '../../store'

const rad = Math.PI / 180
const orbit = (target, r, az, el) => ({
  target,
  pos: [target[0] + r * Math.cos(el * rad) * Math.sin(az * rad), target[1] + r * Math.sin(el * rad), target[2] + r * Math.cos(el * rad) * Math.cos(az * rad)],
})

export const VIEWS = {
  hero: { label: 'Hero shot', ...orbit([0, 24, 0], 225, 306, 8) }, // where the tour comes to rest
  'south-bank': { label: 'South bank', ...orbit([0, 28, 0], 230, -15, 11) },
  aerial: { label: 'Aerial', ...orbit([0, 10, 0], 480, -55, 38) },
}

export function three() {
  const canvas = document.querySelector('canvas[data-engine]') || document.querySelector('canvas')
  return canvas && _roots.get(canvas)?.store.getState()
}

// Render a fresh frame and read it straight back, so the canvas needs no preserveDrawingBuffer.
export function capture() {
  const s = three()
  if (!s) throw new Error('There is no 3D view to capture yet.')
  s.gl.render(s.scene, s.camera)
  const c = s.gl.domElement
  return { image: c.toDataURL('image/jpeg', 0.92), aspect: c.width / c.height }
}

// The cached view the camera is standing at, if any.
export function nearView() {
  const s = three()
  if (!s) return null
  const cam = s.camera.position.toArray()
  const fwd = s.camera.getWorldDirection(s.camera.position.clone()).toArray()
  for (const [id, v] of Object.entries(VIEWS)) {
    const d = v.target.map((t, i) => t - v.pos[i])
    const len = Math.hypot(...d)
    const off = Math.hypot(...cam.map((c, i) => c - v.pos[i]))
    const dot = d.reduce((a, x, i) => a + (x / len) * fwd[i], 0)
    if (off < len * 0.08 && dot > 0.996) return id
  }
  return null
}

export function goto(id) {
  const s = three(), v = VIEWS[id]
  if (!s || !v) return
  s.camera.position.set(...v.pos)
  if (s.controls?.target) { s.controls.target.set(...v.target); s.controls.update() } else s.camera.lookAt(...v.target)
}

if (typeof window !== 'undefined') window.strataReimagine = { goto, nearView, capture, setYear: (y) => useStore.getState().setYear(y) } // for the cache script and the demo console
