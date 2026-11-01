// Self-check for the pure bridge logic: `node web/src/scene/bridge/check.mjs`
import assert from 'node:assert/strict'
import { createHydraulics, stepHydraulics, OPEN_TIME_S, SIM_SPEED, BOLT_SETTLE_S, BOLT_TRAVEL_S, DRAW_UP, LIFT_DRAW, createCars, stepCars, carHeight, gaugePsi, PRESSURE_PSI } from './hydraulics.js'
import { stageForYear, shown, STAGES, ERAS, eraFor, resolveYears } from './stages.js'
import { readFileSync, readdirSync } from 'node:fs'
import { containersOf, clickThrough } from './xray.js'
import * as THREE from 'three'
import { PART_IDS } from './parts.js'
import { createShip, stepShip, WAIT_X, HOLD_X, CRUISE } from './shipSim.js'
import { vesselForYear, needsLift, leafInput, CLEARANCE } from './vessels.js'
import { createRiver, stepRiver, gap, CRAFT, CLEAR } from './riverSim.js'
import { createTraffic, stepTraffic, onLeaves, TYPES, STOP_U, BASCULE_U } from './trafficSim.js'
import { createLift, liftForShip, stepLift, liftSpeed, setLiftTimeScale, applyShipWarp, gatesClosed, heldLever, PASSED_X, FILM_SCALE } from './liftSequence.js'

const MAX = (86 * Math.PI) / 180
const run = (s, target, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) {
    stepHydraulics(s, target, 0.05, MAX)
    assert.ok(s.angle === 0 || s.bolts === 0, `leaf off its seat only with the bolts fully drawn (bolts ${s.bolts})`)
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

// bolts: drawn before the leaf moves, home only after it has sat closed for BOLT_SETTLE_S
const b = createHydraulics()
assert.ok(b.locked && b.bolts === 1, 'starts bolted')
stepHydraulics(b, 1, 0.05, MAX)
assert.ok(!b.locked, 'lever up unlocks at once')
run(b, 1, BOLT_TRAVEL_S + 0.1)
assert.ok(b.bolts === 0, 'bolts fully drawn')
run(b, 0, OPEN_TIME_S * 2)
assert.ok(b.angle < 0.001 && b.locked, 'closed leaf re-bolts')
const c = run(createHydraulics(), 1, OPEN_TIME_S * 2)
for (let t = 0; c.angle > 0.001; t += 0.05) stepHydraulics(c, 0, 0.05, MAX)
run(c, 0, BOLT_SETTLE_S - 0.1)
assert.ok(c.bolts === 0 && !c.locked, 'bolts wait while the leaf settles')
run(c, 0, 0.1 + BOLT_TRAVEL_S + 0.05)
assert.ok(c.bolts === 1 && c.locked, 'then drive home')

assert.equal(stageForYear(1885).stage, -1)
assert.equal(stageForYear(1886).stage, 0)
assert.equal(stageForYear(1888).progress, 0.5)
assert.equal(stageForYear(1894).stage, 5)
assert.equal(stageForYear(2026).stage, 5)
assert.ok(shown('cofferdam', 0) && !shown('cofferdam', 1))
assert.ok(!shown('cladding', 3) && shown('cladding', 5))
assert.ok(!shown('engine', 4) && shown('engine', 5))
// later history: thresholds in order, each flag flips exactly at its year
const yrs = Object.values(ERAS)
assert.ok(yrs.every((y, i) => y > 1894 && (!i || y > yrs[i - 1])), 'eras after opening, in order')
assert.ok(eraFor(1900).walkwayOpen && !eraFor(1950).walkwayOpen && eraFor(1982).walkwayOpen && !eraFor(1981).glazed)
assert.ok(eraFor(1975).steam && !eraFor(1976).steam)
assert.ok(!eraFor(1989).nightLighting && eraFor(1990).nightLighting)
assert.ok(eraFor(2012).olympics && !eraFor(2011).olympics && !eraFor(2013).olympics)
assert.ok(!eraFor(2013).glassFloor && eraFor(2014).glassFloor)
// data is law: a sourced event year overrides the constant; no event, or an inferred one, falls back
const src = ['s']
const fake = resolveYears([
  { year: 1911, title: 'High-level walkways close', sources: src },
  { year: 1975, title: 'Electric power replaces steam', sources: src },
  { year: 2015, title: 'Glass floor panels installed', sources: src },
  { year: 1885, title: 'Stage 1: river foundations begin', sources: src },
  { year: 1895, title: 'Stage 9: tested and opened', sources: src },
  { year: 1989, title: 'Floodlighting installed', sources: src, status: 'inferred' },
  { year: 2011, title: 'Olympic rings hung', sources: [] },
])
assert.deepEqual(fake.eras.walkwaysClosed, { year: 1911, status: 'sourced' })
assert.ok(eraFor(1910, fake.eras).walkwayOpen && !eraFor(1911, fake.eras).walkwayOpen)
assert.ok(eraFor(1975, fake.eras).steam === false && !eraFor(2014, fake.eras).glassFloor && eraFor(2015, fake.eras).glassFloor)
assert.deepEqual(fake.eras.nightLighting, { year: ERAS.nightLighting, status: 'inferred' }, 'inferred event is not law')
assert.deepEqual(fake.eras.olympics, { year: ERAS.olympics, status: 'inferred' }, 'unsourced event is not law')
assert.deepEqual(fake.eras.walkwaysReopened, { year: ERAS.walkwaysReopened, status: 'inferred' })
assert.ok(fake.stages[0].from === 1885 && fake.stages[0].status === 'sourced' && fake.stages[1].status === 'inferred')
assert.ok(fake.stages[5].from === 1895 && fake.stages[4].to === 1894 && stageForYear(1894, fake.stages).stage === 4)
// an out-of-order sourced stage year is refused, so stageForYear stays monotonic
assert.equal(resolveYears([{ year: 1900, title: 'river foundations begin', sources: src }]).stages[0].status, 'inferred')
// the real data: every threshold it dates is sourced and agrees with the year it gives
const tb = JSON.parse(readFileSync(new URL('../../../../data/places/tower-bridge.json', import.meta.url)))
const real = resolveYears(tb.events)
for (const k of ['walkwaysClosed', 'electricDrive', 'walkwaysReopened']) assert.equal(real.eras[k].status, 'sourced', k)
assert.ok(real.stages[0].status === 'sourced' && real.stages[5].status === 'sourced')
// film freeze: the data may confirm years but must not move any; a mismatch goes to the lead as a note
real.stages.forEach((s, i) => assert.ok(s.from === STAGES[i].from && s.to === STAGES[i].to, `data moves stage ${i} to ${s.from}`))
for (const [k, e] of Object.entries(real.eras)) assert.equal(e.year, ERAS[k], `data moves ${k} to ${e.year}`)
assert.deepEqual(resolveYears(null).eras.glassFloor, { year: ERAS.glassFloor, status: 'inferred' })
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
assert.deepEqual(containersOf('lift-north'), ['north-tower'])
assert.deepEqual(containersOf('stairs-south'), ['south-tower'])
assert.deepEqual(containersOf('hydraulic-engine-south'), ['pier-south'])
assert.deepEqual(containersOf('pivot-north'), ['pier-north'])
assert.deepEqual(containersOf('engine-room'), ['engine-room'])
assert.deepEqual(containersOf('north-tower'), ['north-tower'])
assert.deepEqual(containersOf('bascule-north'), [])
assert.deepEqual(containersOf(null), [])
assert.deepEqual(containersOf('pier-north'), ['pier-north'])
// lifts: draw a little from the accumulators while running, wait when they are empty
assert.ok(LIFT_DRAW < DRAW_UP / 10)
{
  const sim = createHydraulics(), l = createCars()
  for (let t = 0; t < 30; t += 0.05) stepCars(l, sim, 0.05)
  assert.ok(sim.stored < 1 && sim.stored > 0.95, `lifts draw a little, stored ${sim.stored}`)
  assert.ok(carHeight(l, 0) > 0.3 && Math.abs(carHeight(l, 0) + carHeight(l, 1) - 1) < 1e-9, 'cars move, counter-phase')
  sim.stored = 0
  const phase = l.phase
  stepCars(l, sim, 1)
  assert.equal(l.phase, phase, 'lifts pause on an empty accumulator')
}
assert.deepEqual(containersOf('cabin-north'), ['cabin-north'])
assert.deepEqual(containersOf('cabin-controls-south'), ['cabin-south'])
// cabin gauge: full pressure on the accumulator, sags to pump-only flow when it is empty and raising
assert.equal(gaugePsi(createHydraulics()), PRESSURE_PSI)
const sag = gaugePsi({ stored: 0, valve: 1 })
assert.ok(sag > 0 && sag < PRESSURE_PSI / 2, `empty accumulator sags the gauge, got ${sag}`)
// negative control for click-through: a shell in front of an inner part catches the ray until faded
{
  const box = (z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), new THREE.MeshBasicMaterial())
    m.name = name
    m.position.z = z
    return m
  }
  const scene = new THREE.Scene().add(box(0, 'shell'), box(-3, 'inner'))
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1))
  const first = () => ray.intersectObjects(scene.children, true)[0]?.object.name
  const shell = scene.getObjectByName('shell')
  clickThrough(shell, false)
  assert.equal(first(), 'shell', 'an opaque shell catches the click')
  clickThrough(shell, true)
  assert.equal(first(), 'inner', 'a faded shell lets the click through')
  clickThrough(shell, false)
  assert.equal(first(), 'shell', 'un-fading restores the shell')
}
// every <Part id> rendered in bridge/*.jsx is listed in PART_IDS
{
  const dir = new URL('.', import.meta.url)
  const has = (x) => assert.ok(PART_IDS.includes(x), `PART_IDS is missing ${x}`)
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.jsx'))) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    const parts = src.match(/<Part\b[^>]*?\bid=(\{[^}]*\}|"[^"]*")/g) ?? []
    assert.equal(parts.length, (src.match(/<Part\b/g) ?? []).length, `${f}: a <Part> without a scannable id`)
    for (const m of parts) {
      const v = m.slice(m.indexOf('id=') + 3)
      let lit
      if ((lit = v.match(/^"(.*)"$/))) has(lit[1])
      else if ((lit = v.match(/^\{id\('([^']+)'\)\}$/))) [`${lit[1]}-north`, `${lit[1]}-south`].forEach(has)
      else if ((lit = v.match(/^\{`([^$`]*)\$\{/))) assert.ok(PART_IDS.some((p) => p.startsWith(lit[1])), `PART_IDS has no ${lit[1]}*`)
      else {
        const q = (x) => [...x.matchAll(/'([^']+)'/g)].map((a) => a[1])
        const name = v.match(/^\{(\w+)\}$/)?.[1]
        const ids = name ? q(src.match(new RegExp(`const ${name} = (.*)`))?.[1] ?? '') : q(v)
        assert.ok(ids.length, `${f}: cannot resolve ${m}`)
        ids.forEach(has)
      }
    }
  }
}
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

// Vessel by year: only a vessel taller than the closed deck's clearance waits for the leaves.
assert.equal(vesselForYear(1894).kind, 'barque')
assert.equal(vesselForYear(1950).kind, 'tug')
assert.equal(vesselForYear(1985).kind, 'coaster')
assert.equal(vesselForYear(2026).kind, 'clipper')
for (const y of [1894, 1950, 1985]) assert.ok(needsLift(vesselForYear(y)), `${y} vessel needs the bascules up`)
const clipper = vesselForYear(2026)
assert.ok(!needsLift(clipper) && clipper.airDraft < CLEARANCE, 'the clipper fits under the closed deck')
const cat = sail(createShip(), 0, 0)
for (let t = 0; t < 120; t += 0.05) stepShip(cat, leafInput(clipper, 0), 0.05)
assert.ok(cat.x < HOLD_X - 100, `the clipper passes with the bascules closed, at ${cat.x}`)
const tall = createShip()
for (let t = 0; t < 120; t += 0.05) stepShip(tall, leafInput(vesselForYear(1950), 0), 0.05)
assert.ok(tall.x === WAIT_X, 'the tug waits for the bascules')

// River craft: all fit under the closed deck, and none comes within CLEAR of the big vessel,
// whatever the year's vessel and with the bascules cycling open and shut.
for (const k in CRAFT) assert.ok(CRAFT[k].airDraft < CLEARANCE, `${k} fits under the closed deck`)
for (const y of [1900, 1940, 1960, 1985, 2026]) {
  const v = vesselForYear(y)
  const big = createShip()
  const river = createRiver(y)
  const foot = { x: 0, bow: v.bow, stern: v.stern }
  let moved = 0
  for (let t = 0; t < 900; t += 0.05) {
    stepShip(big, leafInput(v, (t % 140) < 90 ? 1 : 0), 0.05)
    foot.x = big.x
    stepRiver(river, foot, 0.05)
    for (const c of river) assert.ok(gap(c, foot) >= CLEAR, `${y} ${c.type} at ${c.x.toFixed(1)},${c.z.toFixed(1)} is within ${CLEAR} m of the ${v.kind} at ${big.x.toFixed(1)}`)
    moved = Math.max(moved, big.x < 0 ? 1 : 0)
  }
  assert.ok(moved, `${y}: the ${v.kind} actually passed the craft`)
}
console.log('ship checks ok')

import { placeLabels, labelSize, CALLOUTS, crosses, buildDone } from './callouts.js'
const lab = (id, x, y) => ({ id, x, y, ...labelSize('North tower') })
const pl = placeLabels([lab('a', 500, 400), lab('b', 502, 401), lab('c', 900, 400), lab('off', -5, 400)], 1400, 900)
assert.ok(pl.a && pl.b && pl.c && !pl.off, 'labels for on-screen anchors, none for off-screen')
const box = (id) => ({ x: (id === 'c' ? 900 : id === 'b' ? 502 : 500) + pl[id].dx, y: 400 + pl[id].dy })
assert.ok(Math.abs(box('a').x - box('b').x) >= labelSize('North tower').w || Math.abs(box('a').y - box('b').y) >= 22, 'overlapping anchors get separate label spots')
const crowd = placeLabels(Array.from({ length: 20 }, (_, i) => lab(`k${i}`, 700, 450)), 1400, 900)
assert.ok(Object.keys(crowd).length <= 8 && Object.keys(crowd).length >= 3, 'a crowd keeps only labels that fit')
assert.equal(new Set(CALLOUTS.map((c) => c.id)).size, CALLOUTS.length)
assert.ok(crosses(0, 0, 10, 10, { x: 4, y: 4, w: 2, h: 2 }) && !crosses(0, 0, 10, 0, { x: 4, y: 4, w: 2, h: 2 }))
// no leader line may cross another label, on a crowded column of anchors like the top view's
const col = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, x: 700 + (i % 2) * 26, y: 150 + i * 40, ...labelSize('South bascule') }))
const cp = placeLabels(col, 1400, 900)
const rects = Object.entries(cp).map(([id, o]) => { const it = col.find((c) => c.id === id); return { id, x: it.x + o.dx - it.w / 2, y: it.y + o.dy - it.h / 2, w: it.w, h: it.h, ax: it.x, ay: it.y, ex: it.x + o.dx * 0.7, ey: it.y + o.dy * 0.7 } })
for (const a of rects) for (const b of rects) if (a !== b) assert.ok(!crosses(a.ax, a.ay, a.ex, a.ey, b), `leader of ${a.id} crosses label ${b.id}`)
assert.ok(Object.keys(cp).length >= 5, 'most of the column still gets labels')
{
  // the footprint fill grows every construction year and is full from opening
  assert.equal(buildDone(stageForYear(1885)), 0)
  let prev = 0
  for (let y = 1886; y <= 1893; y++) {
    const d = buildDone(stageForYear(y))
    assert.ok(d > prev && d < 1, `build share grows in ${y}`)
    prev = d
  }
  assert.equal(buildDone(stageForYear(1894)), 1)
}
console.log('callout checks ok')
// lift for a ship: the full cycle over the real hydraulic, ship and traffic sims, wired as in the app
const liftCycle = (scale, fast = false) => {
  setLiftTimeScale(scale)
  const h = createHydraulics(), ship = createShip(), t = createTraffic(2026, 3), s = createLift()
  let lever = 0, phases = ['idle'], dt = 0.05, still = 0
  liftForShip({ fast }, s)
  assert.equal(s.caption, 'Signals to red')
  let i = 0
  for (; i < 20 * 60 * 4 && !(s.phase === 'idle' && phases.length > 1); i++) {
    const io = { dt, onLeaves: onLeaves(t), angle: h.angle, maxAngle: MAX, locked: h.locked, shipX: ship.x, shipSailing: ship.sailing }
    const prev = s.phase
    const next = stepLift(s, io)
    if (next === 1 && lever === 0) assert.equal(io.onLeaves, 0, 'lever only goes up once the leaves are empty')
    if (next === 0 && lever === 1) assert.ok(ship.x < PASSED_X, 'lever only comes down once the ship is through')
    if (prev === 'lowering' && s.phase === 'resume') assert.ok(h.angle < 0.001 && h.locked && h.bolts === 1, 'gates open only with the leaves down and bolted')
    if (next !== null) lever = next
    if (s.phase !== phases.at(-1)) phases.push(s.phase)
    const k = liftSpeed(s)
    const closed = gatesClosed(h, lever, s)
    assert.equal(closed, s.red || lever > 0 || h.angle > 0.001 || !h.locked, 'one gate rule for road and top view')
    if (!closed) assert.ok(h.locked, 'gates never open on an unbolted leaf')
    stepTraffic(t, dt, closed, k)
    s.clear = closed && onLeaves(t) === 0
    if (h.angle > 0.001) assert.equal(onLeaves(t), 0, 'no road user on a moving leaf')
    stepHydraulics(h, heldLever(lever, h, s), dt * SIM_SPEED * k, MAX)
    assert.ok(h.angle === 0 || h.bolts === 0, `leaves rise only with the nose bolts fully drawn (bolts ${h.bolts})`)
    applyShipWarp(s, ship, CRUISE)
    stepShip(ship, h.angle / MAX, dt * k)
    if (['raising', 'passing'].includes(s.phase) && ship.x > PASSED_X && ship.v < 0.5) still += dt
  }
  assert.deepEqual(phases, ['idle', 'red', 'raising', 'passing', 'lowering', 'resume', 'idle'], `lift phases ${phases}`)
  assert.equal(lever, 0)
  for (let j = 0; j < 200; j++) stepTraffic(t, dt, false)
  assert.ok(t.lanes.every((l) => l.list.some((v) => v.u > STOP_U + 5)), 'traffic moves again after the lift')
  setLiftTimeScale(1)
  return { secs: i * dt, still }
}
const slow = liftCycle(1), film = liftCycle(FILM_SCALE), fast = liftCycle(1, true)
assert.ok(film.secs < 50, `film lift completes in under 50 s of sim time, took ${film.secs.toFixed(1)} s`)
assert.ok(fast.secs <= 22, `fast lift completes within 22 s of sim time, took ${fast.secs.toFixed(1)} s`)
assert.ok(fast.still <= 3, `in a fast lift the ship waits at most 3 s, waited ${fast.still.toFixed(1)} s`)
console.log(`lift checks ok (cycle ${slow.secs.toFixed(0)} s at scale 1, ${film.secs.toFixed(0)} s at FILM_SCALE, ${fast.secs.toFixed(1)} s fast, ship still ${fast.still.toFixed(1)} s)`)
// top view and road read the same gate rule: no file draws gates from its own condition
for (const f of ['traffic.jsx', 'topview.jsx'])
  assert.ok(readFileSync(new URL(f, import.meta.url), 'utf8').includes('gatesClosed(sim, '), `${f} gates follow gatesClosed`)
// A lever moved directly (Dock slider, ?bascule=1) with traffic on the leaves: signals go red, the
// leaves stay down until the road is clear, and nobody is ever on a leaf that has moved.
let worstHold = 0
for (const year of [1900, 2026])
  for (let seed = 1; seed <= 20; seed++) {
    const h = createHydraulics(), t = createTraffic(year, seed), s = createLift(), dt = 0.05
    for (let j = 0; j < 400 && onLeaves(t) === 0; j++) stepTraffic(t, dt, false) // get someone on a leaf
    assert.ok(onLeaves(t) > 0, 'traffic on the leaves before the lever moves')
    let i = 0
    for (; i < 60 / dt && h.angle <= 0.001; i++) {
      const closed = gatesClosed(h, 1, s)
      assert.ok(closed, 'a raised lever drives the gates shut')
      stepHydraulics(h, heldLever(1, h, s), dt * SIM_SPEED, MAX)
      if (h.angle > 0.001) assert.ok(s.clear && onLeaves(t) === 0, 'leaves only move once clear')
      stepTraffic(t, dt, closed)
      s.clear = closed && onLeaves(t) === 0
    }
    assert.ok(h.angle > 0.001, `manual lever raises the leaves once clear (${year}, seed ${seed})`)
    worstHold = Math.max(worstHold, i * dt)
    for (let j = 0; j < 30 / dt; j++) {
      stepTraffic(t, dt, gatesClosed(h, 1, s))
      stepHydraulics(h, heldLever(1, h, s), dt * SIM_SPEED, MAX)
      assert.equal(onLeaves(t), 0, 'nobody on a raised leaf')
    }
  }
console.log(`manual lever interlock ok (leaves held at most ${worstHold.toFixed(1)} s)`)
