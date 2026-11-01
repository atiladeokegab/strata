// Self-check for the pure bridge logic: `node web/src/scene/bridge/check.mjs`
import assert from 'node:assert/strict'
import { createHydraulics, stepHydraulics, OPEN_TIME_S } from './hydraulics.js'
import { stageForYear, shown } from './stages.js'
import { createShip, stepShip, WAIT_X, HOLD_X } from './shipSim.js'

const MAX = (86 * Math.PI) / 180
const run = (s, target, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) {
    stepHydraulics(s, target, 0.05, MAX)
    assert.ok(s.angle >= 0 && s.angle <= MAX, 'angle within stops')
    assert.ok(s.stored >= 0 && s.stored <= 1, 'stored within 0..1')
  }
  return s
}

const s = run(createHydraulics(), 1, OPEN_TIME_S * 2)
assert.ok(Math.abs(s.angle - MAX) < 0.01, `opens to max angle, got ${s.angle}`)
assert.ok(s.stored < 1, 'raising draws on the accumulators')
const half = run(createHydraulics(), 1, OPEN_TIME_S / 2)
assert.ok(half.angle > 0.2 * MAX && half.angle < 0.8 * MAX, 'opening takes about OPEN_TIME_S')
run(s, 0, OPEN_TIME_S * 2)
assert.ok(s.angle < 0.01, 'closes again')
const dry = run(Object.assign(createHydraulics(), { stored: 0 }), 1, 10)
const full = run(createHydraulics(), 1, 10)
assert.ok(dry.angle < full.angle, 'an empty accumulator slows the lift')

assert.equal(stageForYear(1885).stage, -1)
assert.equal(stageForYear(1886).stage, 0)
assert.equal(stageForYear(1888).progress, 0.5)
assert.equal(stageForYear(1894).stage, 5)
assert.equal(stageForYear(2026).stage, 5)
assert.ok(shown('cofferdam', 0) && !shown('cofferdam', 1))
assert.ok(!shown('cladding', 3) && shown('cladding', 5))
assert.ok(!shown('engine', 4) && shown('engine', 5))
console.log('bridge checks ok')

// Ship: waits for the leaves, holds short of the bridge if they drop, but a committed ship keeps going.
const sail = (sh, open, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) stepShip(sh, open, 0.05)
  return sh
}
const ship = sail(createShip(), 0, 30)
assert.ok(ship.x === WAIT_X && !ship.sailing, 'ship waits while the bascules are closed')
sail(ship, 1, 10)
assert.ok(ship.sailing && ship.x < WAIT_X && ship.x > HOLD_X, 'ship sets off once the bascules are up')
sail(ship, 0.5, 120)
assert.ok(ship.x === HOLD_X && ship.v === 0, `ship holds short of the bridge when the leaves drop, at ${ship.x}`)
sail(ship, 1, 5)
assert.ok(ship.x < HOLD_X, 'ship resumes once the leaves are back up')
sail(ship, 0, 5)
assert.ok(ship.x < HOLD_X - 20, 'a ship already past the hold point keeps going')
console.log('ship checks ok')
