// Small river craft (pure, no three). Each craft drifts along x in its own lane z, wrapping at
// ±RANGE, and steers out to YIELD_Z while the big vessel (shipSim + vessels.js footprint) is near.
// RANGE stays inside the big vessel's wait (250) and end (-300) points, so its reset jump is clear.
// status: inferred. Craft sizes and speeds are plausible, not sourced.
export const RANGE = 180
export const YIELD_Z = 24 // m off the channel centreline; the 61 m opening allows ±30
export const CLEAR = 10 // m, the gap small craft must keep from the big vessel's hull
const HALF_BEAM = 5 // big vessel hull half-width at the waterline
const LOOKAHEAD = 60 // m along x at which a craft starts to yield
const LATERAL = 4 // m/s sideways when changing lane

// len/beam in metres; airDraft above the waterline (all must pass under the closed deck)
export const CRAFT = {
  lighter: { len: 20, beam: 6, airDraft: 2 },
  skiff: { len: 6, beam: 1.3, airDraft: 1.4 },
  launch: { len: 12, beam: 3.6, airDraft: 4.2 },
  rib: { len: 9, beam: 2.8, airDraft: 2.2 },
  pontoon: { len: 24, beam: 6, airDraft: 3.4 },
}

// [type, home lane z, direction, speed m/s, fixed x for a moored craft]
const FLEET = {
  early: [['lighter', -9, 1, 0.8], ['lighter', 14, -1, 1.1], ['skiff', -19, -1, 1.6], ['skiff', 19, 1, 2.2], ['skiff', 9, 1, 1.3]],
  late: [['launch', -14, -1, 5.5], ['launch', 19, 1, 4], ['rib', -19, 1, 7], ['rib', 9, -1, 6], ['pontoon', -70, 0, 0, 110]],
}

export const eraForYear = (year) => (year < 1950 ? 'early' : 'late')

export const createRiver = (year) =>
  FLEET[eraForYear(year)].map(([type, home, dir, speed, x], i) => ({
    type, home, z: home, dir, speed, x: x ?? -RANGE + 23 + i * 71,
  }))

// Gap from craft c to the big vessel's hull; ship = { x, bow, stern } (bow/stern are x offsets).
export function gap(c, ship) {
  const nx = Math.min(Math.max(c.x, ship.x + ship.bow), ship.x + ship.stern)
  return Math.hypot(c.x - nx, c.z) - HALF_BEAM
}

export function stepRiver(craft, ship, dt) {
  for (const c of craft) {
    if (!c.speed) continue
    c.x += c.dir * c.speed * dt
    const wrapped = Math.abs(c.x) > RANGE
    if (wrapped) c.x -= Math.sign(c.x) * 2 * RANGE
    const nx = Math.min(Math.max(c.x, ship.x + ship.bow), ship.x + ship.stern)
    const want = Math.abs(c.x - nx) < LOOKAHEAD ? Math.sign(c.home) * Math.max(Math.abs(c.home), YIELD_Z) : c.home
    // a craft re-entering beside the vessel takes the yield lane at once
    c.z = wrapped ? want : c.z + Math.min(LATERAL * dt, Math.max(-LATERAL * dt, want - c.z))
  }
  return craft
}
