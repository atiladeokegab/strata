// "Lift for a ship": the full sequence as a small pure state machine. liftForShip() starts it;
// stepLift() is called every frame (traffic.jsx drives it) with the live sims and returns the
// lever the operator should hold, or null to leave the lever alone. `lift` is the state a UI reads:
// phase, caption, and red (signals held red by the sequence, before the lever moves).
// Phases: red → raising → passing → lowering → resume → idle. 'resume' (gates open) waits for the
// nose bolts to be home (hydraulics `locked`), not just for the leaves to be down.
// Fast mode (liftForShip({ fast: true }), or ?film=1 in the URL) plays the whole cycle in ~20 s:
// every clock in the lift runs FAST_SCALE times faster (hydraulics and bolts, the ship, road users
// clearing a leaf, the resume caption) and, as the leaves start up, warpShip asks the driver to put
// the ship at FAST_SHIP_X already under way (applyShipWarp), so it meets the opening without a wait.
export const PASSED_X = -60 // ship's x once it is clear of the opening, heading west
const RESUME_S = 6 // how long the "Traffic resumes" caption stays up
// Multiplies SIM_SPEED (hydraulics) and the ship's clock while a lift runs. The film sets FILM_SCALE
// so the whole sequence plays in about 45 s; 1 keeps the normal demo pace.
export const FILM_SCALE = 3
export const FAST_SCALE = 4
// Fast lift, call to leaves moving: at most this many seconds (road users clear the leaves first). 4.4 s in 1894,
// 4.6 s with 2026 traffic (lift-timeline.md); check.mjs holds the ceiling, and the story's opening shot counts on it.
export const FAST_LEAVES_S = 5
export const FAST_SHIP_X = 160 // shortcut: fast lift only; the ship jumps here under way as the leaves start up
export let liftTimeScale = 1
export const setLiftTimeScale = (k) => (liftTimeScale = k)
// Clock time, not frame count: a long frame is split into steps of at most `max` s, so the lift
// runs at the same pace at any fps. Capped at `cap` s so a tab coming back does not replay minutes.
export function substep(dt, fn, max = 0.1, cap = 1) {
  for (let left = Math.min(dt, cap); left > 1e-6; left -= max) fn(Math.min(left, max))
}
export const liftSpeed = (s = lift) => (s.phase === 'idle' ? 1 : s.fast ? FAST_SCALE : liftTimeScale)
// read once: ?film=1 makes every liftForShip() fast
const FILM_URL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('film') === '1'

export const CAPTIONS = {
  idle: '',
  red: 'Signals to red',
  raising: 'Raising the bascules',
  passing: 'Ship passing',
  lowering: 'Lowering',
  resume: 'Traffic resumes',
}

export const createLift = () => ({ phase: 'idle', caption: '', red: false, t: 0, seenEast: false, fast: false, warpShip: false, clear: false })
export const lift = createLift()

const go = (s, phase) => Object.assign(s, { phase, caption: CAPTIONS[phase], red: phase === 'red', t: 0 })

// Start (or restart after "Traffic resumes") the sequence. Returns the live state object.
export function liftForShip({ fast = FILM_URL } = {}, s = lift) {
  if (s.phase === 'idle' || s.phase === 'resume') {
    go(s, 'red')
    Object.assign(s, { seenEast: false, fast, warpShip: false })
  }
  return s
}

// The one rule for the road gates (road barriers, signals and the top view all read it): shut while
// the lift holds the signals red, the lever is up, a leaf is off its seat, or the bolts are not home.
export const gatesClosed = (sim, lever, s = lift) => s.red || lever > 0 || sim.angle > 0.001 || !sim.locked

// The interlock on the lever, however it is moved (liftForShip, Dock slider, ?bascule=1): leaves at
// rest stay down until the traffic driver reports the gates shut and every leaf empty (s.clear).
export const heldLever = (lever, sim, s = lift) => (lever > 0 && sim.angle <= 0.001 && !s.clear ? 0 : lever)

// The driver calls this with the live ship state each frame before stepping it.
export function applyShipWarp(s, ship, cruise) {
  if (!s.warpShip) return
  Object.assign(ship, { x: FAST_SHIP_X, v: cruise, sailing: true })
  s.warpShip = false
}

// io: { dt, onLeaves (count of road users on a leaf), angle, maxAngle, locked, shipX, shipSailing }
export function stepLift(s, io) {
  s.t += io.dt
  if (s.phase !== 'idle' && io.shipX > PASSED_X) s.seenEast = true
  switch (s.phase) {
    case 'red':
      if (io.onLeaves === 0) go(s, 'raising'), (s.warpShip = s.fast)
      return s.phase === 'raising' ? 1 : 0
    case 'raising':
      if (io.shipSailing && io.angle > 0.8 * io.maxAngle) go(s, 'passing')
      return 1
    case 'passing':
      // seenEast: a ship still leaving from an earlier lift does not count as this one passing
      if (s.seenEast && io.shipX < PASSED_X) go(s, 'lowering')
      return s.phase === 'lowering' ? 0 : 1
    case 'lowering':
      if (io.locked) go(s, 'resume')
      return 0
    case 'resume':
      if (s.t > RESUME_S / liftSpeed(s)) go(s, 'idle'), (s.fast = false)
      return null
    default:
      return null
  }
}

// Shot scripts (?capture=1): window.__strataLift() starts the fast lift at once, no 90 s wait for the tour cue.
if (globalThis.location?.search.includes('capture=1')) globalThis.__strataLift = (opts = { fast: true }) => liftForShip(opts)
