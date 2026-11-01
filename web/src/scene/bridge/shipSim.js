// Ship passage logic, pure so check.mjs can run it. x is metres east of the bridge centre; the ship
// sails west. It waits at WAIT_X for the leaves, and if they drop below OPEN_FRACTION while it is
// still heading in, it brakes to a stop at HOLD_X (bow clear of the piers) until they are back up.
// Once past HOLD_X it is committed and keeps going.
export const WAIT_X = 250
export const HOLD_X = 60
export const END_X = -300
export const CRUISE = 9 // m/s; shortcut: brisk for the film (a real barque under the bridge did ~2-3 m/s)
const ACCEL = 0.6 // m/s²
const DECEL = 1 // m/s², braking towards the hold point
export const OPEN_FRACTION = 0.8

export const createShip = () => ({ x: WAIT_X, v: 0, sailing: false })

// Advance ship `s` by dt seconds; `open` is the leaf angle as a fraction of max. Mutates and returns s.
export function stepShip(s, open, dt) {
  const clear = open > OPEN_FRACTION
  if (!s.sailing && clear) s.sailing = true
  if (!s.sailing) return s
  s.v = Math.min(CRUISE, s.v + ACCEL * dt)
  if (!clear && s.x >= HOLD_X) {
    // brake so we come to rest at the hold point, never past it
    s.v = Math.min(s.v, Math.sqrt(2 * DECEL * (s.x - HOLD_X)))
    s.x = Math.max(HOLD_X, s.x - s.v * dt)
    if (s.x === HOLD_X) s.v = 0
  } else s.x -= s.v * dt
  if (s.x < END_X) Object.assign(s, createShip()) // off-screen: back to the queue
  return s
}
