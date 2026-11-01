// Self-check for the pure bridge logic: `node web/src/scene/bridge/check.mjs`
import assert from 'node:assert/strict'
import { createHydraulics, stepHydraulics, OPEN_TIME_S } from './hydraulics.js'
import { stageForYear, shown } from './stages.js'
import { createShip, stepShip, WAIT_X, HOLD_X } from './shipSim.js'
import { createTraffic, stepTraffic, TYPES, STOP_U, BASCULE_U } from './trafficSim.js'

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
// traffic: gates hold the queue, spacing holds, the bascules clear, the queue moves on green
for (const year of [1900, 2026]) {
  const t = createTraffic(year, 7)
  const behind = new Set(t.lanes.flatMap((l) => l.list.filter((v) => v.u <= STOP_U).map((v) => v.id)))
  const spaced = () =>
    t.lanes.forEach((l) =>
      l.list.forEach((v, i) => {
        if (i) assert.ok(l.list[i - 1].u - TYPES[l.list[i - 1].type].len - v.u >= TYPES[v.type].gap - 1e-6, 'min spacing')
      }),
    )
  for (let i = 0; i < 1600; i++) {
    stepTraffic(t, 0.05, true)
    spaced()
    for (const l of t.lanes) for (const v of l.list) if (v.u > STOP_U) assert.ok(!behind.has(v.id), `${year}: vehicle ${v.id} ran a closed gate`)
    for (const l of t.lanes) for (const v of l.list) if (v.u <= STOP_U) behind.add(v.id)
  }
  const onLeaf = t.lanes.flatMap((l) => l.list.filter((v) => v.u > -BASCULE_U && v.u - TYPES[v.type].len < BASCULE_U))
  assert.equal(onLeaf.length, 0, `${year}: bascules cleared while closed`)
  assert.ok(t.lanes.every((l) => l.list.some((v) => Math.abs(v.u - STOP_U) < 0.01)), `${year}: every lane queues at its gate`)
  for (let i = 0; i < 400; i++) stepTraffic(t, 0.05, false), spaced()
  assert.ok(t.lanes.every((l) => l.list.some((v) => v.u > STOP_U + 5)), `${year}: queue moves on green`)
}
assert.ok(createTraffic(1900).lanes[0].list.every((v) => v.type === 'cart' || v.type === 'hansom'), 'horse era')
assert.ok(createTraffic(2026).lanes[0].list.every((v) => ['car', 'taxi', 'bus'].includes(v.type)), 'motor era')
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
