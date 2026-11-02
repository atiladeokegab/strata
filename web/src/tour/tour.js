// The guided tour: a timed script of camera keyframes and store cues. <Tour /> (scene/Tour.jsx) plays it.
import { create } from 'zustand'
import { useStore, FIRST_YEAR, THIS_YEAR } from '../store.js'
import { liftForShip } from '../scene/bridge/liftSequence.js'

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
  { t: 0, target: [-150, 0, -80], r: 950, az: -122, el: 30 }, // high over the City of London (the opening card)
  { t: 8, target: [0, 25, 0], r: 300, az: -100, el: 14 }, //     pushed in on the bridge
  { t: 19, target: [0, 22, 0], r: 280, az: -132, el: 16 }, //   timeline: 1886, built to 1894, back to today
  { t: 20.5, target: [0, 20, 0], r: 210, az: -125, el: 20 }, // exploded view
  { t: 24, target: [0, 20, 0], r: 220, az: -108, el: 22 },
  { t: 26, target: [0, 8, 0], r: 190, az: -88, el: 6 }, //       the fast lift, low on the river upstream: the ship comes through
  { t: 33, target: [0, 12, 0], r: 170, az: -70, el: 9 },
  { t: 36, target: [0, 0, 0], r: 650, az: -60, el: 88 }, //      top-down LiDAR topography (the lift finishes below)
  { t: 39, target: [0, 0, 0], r: 560, az: -45, el: 88 },
  { t: 41.5, part: 'hydraulics', target: [0, -4, -40], r: 80, az: -50, el: 20 }, // tap a part: the inspector
  { t: 45, part: 'hydraulics', fit: 0.9, target: [0, -4, -40], r: 72, az: -32, el: 22 },
  { t: 52, part: 'hydraulics', fit: 1.05, target: [0, -4, -40], r: 82, az: -15, el: 20 }, // the docent answers
  { t: 56.5, target: [0, 22, 0], r: 330, az: -60, el: 10 }, //    hand back: calm hero shot
  { t: 59.5, target: [0, 22, 0], r: 320, az: -66, el: 9 },
]
export const DURATION = KEYS[KEYS.length - 1].t

// Store cues: tracks run every frame inside [from, to] with u = eased 0..1, and once more at u = 1 after `to`.
const s = () => useStore.getState()
const yearAt = (a, b) => (u) => s().setYear(Math.round(a + (b - a) * u))
export const TRACKS = [
  { from: 0, to: 0, set: () => { s().setView('orbit'); s().setExploded(false); s().setBascule(0); s().setYear(THIS_YEAR); s().select(null); s().setLidar?.(false) } },
  { from: 8, to: 10, set: yearAt(THIS_YEAR, FIRST_YEAR) },
  { from: 10.5, to: 16.5, set: yearAt(FIRST_YEAR, OPENED), linear: true }, // one construction year every 0.75 s
  { from: 17, to: 19, set: yearAt(OPENED, THIS_YEAR) },
  { from: 20.5, to: 20.5, set: () => s().setExploded(true) },
  { from: 24, to: 24, set: () => s().setExploded(false) },
  { from: 22, to: 22, set: () => liftForShip({ fast: true }) }, // Hermes's fast lift (lift-timeline.md, 1 Nov): leaves move at +4.4 s = 26.4 as the river shot lands, full open 30.5, ship mid-span 32.1, lowering 33.7
  { from: 33.5, to: 33.5, set: () => { s().setView('top'); s().setLidar?.(true) } },
  { from: 39.5, to: 39.5, set: () => { s().setView('orbit'); s().setLidar?.(false) } },
  { from: 40.5, to: 40.5, set: (_, ctx) => s().select(ctx.hydraulics) },
  { from: 53, to: 53, set: () => s().select(null) },
]

// On-screen captions, one per beat (the stage area, above the dock). The docent beat shows its live answer.
export const BEATS = [
  { from: 8, to: 19, label: 'Timeline', text: 'Scrub back to 1886 and watch it being built, stage by stage, then return to today.' },
  { from: 20.5, to: 24.5, label: 'Exploded view', text: 'Take the machine apart, piece by piece.' },
  { from: 25.5, to: 33, label: 'Watch it work', text: 'Signals to red, bascules up, a ship through: driven by simulated hydraulics.' },
  { from: 34, to: 39.5, label: 'Top-down', text: 'The real ground: Environment Agency 1 m LiDAR, shown as a point cloud.' },
  { from: 41, to: 45, label: 'Tap any part', text: 'Every number has a source and a status.' },
  { from: 45, to: 53, label: 'Ask the docent', docent: true },
]
// The docent's question for the tapped part, asked of the live API when the tour starts.
export const DOCENT_Q = 'How do the counterweights help the bascules open?'
// The hand-back: control returns to the viewer.
export const HANDOFF = { from: 54, label: 'Now you try', text: 'Tap any part.' }

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
