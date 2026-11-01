// The guided tour: a timed script of camera keyframes and store cues. <Tour /> (scene/Tour.jsx) plays it.
import { create } from 'zustand'
import { useStore, FIRST_YEAR, THIS_YEAR } from '../store.js'

export const useTour = create(() => ({ playing: false, startedAt: 0 }))
export const startTour = () => useTour.setState({ playing: true, startedAt: performance.now() })
export const stopTour = () => useTour.setState({ playing: false })
export const isTourPlaying = () => useTour.getState().playing

const OPENED = 1894

// The opening card over the push-in (0..6 s): the problem, then what Strata is and who it is for.
export const CARD = {
  until: 6,
  problem: "History is text and flat photos. You can't watch a landmark being built.",
  pitch: 'Strata rebuilds famous places from real LiDAR and their own sourced history, for visitors, students and teachers.',
  place: 'Tower Bridge, London',
}
// Card opacity at tour time t: fade in over 0.3..1.3 s, out over the last second.
export const cardOpacity = (t) => Math.min(ease((t - 0.3) / 1), ease(CARD.until - t))
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)))

// Camera keyframes in the scene frame (metres, origin at the deck centre, x east, y up, z south).
// The camera sits at target + r * (cos el sin az, sin el, cos el cos az): az 0 = looking north from the south bank,
// az 90 = from downstream (east), az -90 = from the City side (west). A 'part' key aims at that mesh and fits its
// distance to the mesh's bounds (Tour.jsx), keeping target and r here as the fallback while the mesh is missing.
export const KEYS = [
  { t: 0, target: [-150, 0, -80], r: 950, az: -122, el: 30 }, // 1. high over the City of London (the opening card)
  { t: 10, target: [0, 25, 0], r: 290, az: -100, el: 13 }, //    pushed in on the bridge
  { t: 17, target: [0, 28, 0], r: 230, az: -15, el: 11 }, //    2. golden-hour orbit round to the south bank
  { t: 19, target: [0, 8, 0], r: 175, az: 72, el: 6 }, //      3. low on the river, downstream
  { t: 28, target: [0, 12, 0], r: 150, az: 98, el: 9 }, //        drift while the bascules open and close
  { t: 30.5, part: 'hydraulics', target: [0, -4, -40], r: 80, az: 115, el: 20 }, // 4. the hydraulics
  { t: 34, part: 'hydraulics', fit: 0.85, target: [0, -4, -40], r: 70, az: 132, el: 22 },
  { t: 36, target: [0, 20, 0], r: 200, az: 150, el: 22 }, //   5. exploded view
  { t: 40.5, target: [0, 20, 0], r: 215, az: 178, el: 24 },
  { t: 50, target: [0, 15, 0], r: 285, az: 235, el: 18 }, //   6. back to 1886, rebuilt to 1894
  { t: 53, target: [0, 0, 0], r: 650, az: 250, el: 88 }, //    7. top-down topography
  { t: 56.5, target: [0, 0, 0], r: 540, az: 270, el: 88 },
  { t: 60, target: [0, 22, 0], r: 330, az: 300, el: 10 }, //   8. calm hero shot
  { t: 62, target: [0, 22, 0], r: 318, az: 305, el: 9 },
]
export const DURATION = KEYS[KEYS.length - 1].t

// Store cues: tracks run every frame inside [from, to] with u = eased 0..1, and once more at u = 1 after `to`.
const s = () => useStore.getState()
const yearAt = (a, b) => (u) => s().setYear(Math.round(a + (b - a) * u))
export const TRACKS = [
  { from: 0, to: 0, set: () => { s().setView('orbit'); s().setExploded(false); s().setBascule(0); s().setYear(THIS_YEAR); s().select(null) } },
  { from: 19.5, to: 23, set: (u) => s().setBascule(u) },
  { from: 24.5, to: 28, set: (u) => s().setBascule(1 - u) },
  { from: 29.5, to: 29.5, set: (_, ctx) => s().select(ctx.hydraulics) },
  { from: 34.5, to: 34.5, set: () => s().select(null) },
  { from: 36, to: 36, set: () => s().setExploded(true) },
  { from: 40, to: 40, set: () => s().setExploded(false) },
  { from: 41, to: 43, set: yearAt(THIS_YEAR, FIRST_YEAR) },
  { from: 43.5, to: 49.5, set: yearAt(FIRST_YEAR, OPENED), linear: true }, // one construction year every 0.75 s
  { from: 50.5, to: 50.5, set: () => s().setView('top') },
  { from: 53, to: 56, set: yearAt(OPENED, THIS_YEAR) },
  { from: 57, to: 57, set: () => s().setView('orbit') },
]

// The part the inspector shows in beat 4: a counterweight or hydraulics part, preferring one the place data
// describes, then one the scene has (Hermes names meshes by part id), else a bascule.
export function hydraulicsPart(place, inScene = () => false) {
  const re = /counterweight|hydraul|accumulator|pivot|engine/
  const ids = (place?.parts ?? []).map((p) => p.id)
  return ids.find((id) => re.test(id))
    ?? ['counterweight-north', 'hydraulic-engine-north', 'accumulator'].find(inScene)
    ?? ids.find((id) => /bascule/.test(id)) ?? 'bascule-north'
}

// Camera pose at time t: {pos, target} as plain arrays. resolve(key) may override the key's target and r.
export function poseAt(t, resolve = (k) => k) {
  let i = KEYS.findIndex((k) => k.t > t)
  if (i === -1) i = KEYS.length - 1
  const a = KEYS[Math.max(0, i - 1)], b = KEYS[i]
  const u = b.t === a.t ? 1 : ease((t - a.t) / (b.t - a.t))
  const lerp = (x, y) => x + (y - x) * u
  const ka = resolve(a), kb = resolve(b)
  const target = ka.target.map((v, j) => lerp(v, kb.target[j]))
  const r = lerp(ka.r, kb.r), az = (lerp(a.az, b.az) * Math.PI) / 180, el = (lerp(a.el, b.el) * Math.PI) / 180
  const pos = [target[0] + r * Math.cos(el) * Math.sin(az), target[1] + r * Math.sin(el), target[2] + r * Math.cos(el) * Math.cos(az)]
  return { pos, target }
}

// Applies every track for the frame step prev -> t (start with prev = -1), so each cue fires once and each
// ramp lands on its end value even if a frame skips past it.
export function runTracks(prev, t, ctx) {
  for (const k of TRACKS) {
    if (t < k.from || prev >= k.to) continue
    const raw = k.to === k.from ? 1 : Math.min(1, (t - k.from) / (k.to - k.from))
    k.set(k.linear ? raw : ease(raw), ctx)
  }
}
