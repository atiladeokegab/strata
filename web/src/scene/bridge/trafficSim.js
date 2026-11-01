// Road traffic state sim (pure, no three). Each lane is a 1-D queue: u is the distance of a
// vehicle's FRONT along its direction of travel, measured so every lane meets its entry gate
// at u = -GATE_U and leaves the bascules at u = +BASCULE_U. Bridge frame: z = dir * u.
// status: inferred. Speeds and spacing are plausible street figures, not sourced.

export const GATE_U = 37 // barrier line on the fixed deck, just outside each bascule pivot
export const STOP_U = -GATE_U - 1 // vehicles stop 1 m short of the gate
export const BASCULE_U = 35 // |z| < 35 is on a bascule leaf
// Past each shore abutment a ramp falls to the street (structures.jsx RAMP, STREET_DROP); road users
// arrive and leave out on the level street beyond it, not at the abutment.
export const ABUT_Z = 148.5 // |z| of the shore abutment, where the ramp starts
export const RAMP_LEN = 35 // shortcut: mirrors structures.jsx RAMP (check.mjs asserts they agree)
const STREET_RUN = 30 // m of level street past the ramp foot before a road user appears or leaves
export const START_U = -(ABUT_Z + RAMP_LEN + STREET_RUN)
export const END_U = -START_U
// Road surface height at bridge z (0 = deck level); drop = { north, south } in m, north is -z.
export const roadY = (z, drop) => -(z < 0 ? drop.north : drop.south) * Math.min(1, Math.max(0, (Math.abs(z) - ABUT_Z) / RAMP_LEN))
const ACCEL = 2 // m/s²
const BRAKE = 3 // m/s², comfortable deceleration used to plan the stop
const CLEAR_RUN = 40 // m beyond the leaf over which road users keep hurrying
const CLEAR_V = 5 // m/s; shortcut: everyone on a leaf hurries off at least this fast so a lift starts within ~15 s (time-compressed like SIM_SPEED)

// len (m), vmax (m/s), gap = minimum bumper-to-bumper spacing (m)
export const TYPES = {
  cart: { len: 6.5, vmax: 3, gap: 1.5 },
  hansom: { len: 5.5, vmax: 4.5, gap: 1.5 },
  car: { len: 4.2, vmax: 11, gap: 2 },
  bus: { len: 8.4, vmax: 8, gap: 2 },
  taxi: { len: 4.5, vmax: 10, gap: 2 },
  ped: { len: 0.6, vmax: 1.4, gap: 0.5 },
}

// Before 1920 the bridge carried horse traffic; motor traffic after.
const ROAD = (year) => (year < 1920 ? ['cart', 'hansom', 'hansom'] : ['car', 'car', 'taxi', 'taxi', 'bus'])

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// UK traffic keeps left: facing south (+z) that is the east side (+x).
export function createTraffic(year, seed = 1) {
  const road = ROAD(year)
  const lane = (dir, x, kinds, mean) => ({ dir, x, kinds, mean, list: [], wait: 0 })
  const t = {
    rand: rng(seed),
    nextId: 1,
    lanes: [
      lane(1, 2.5, road, 6),
      lane(-1, -2.5, road, 6),
      lane(1, 8.3, ['ped'], 6),
      lane(-1, -8.3, ['ped'], 6),
    ],
  }
  for (let i = 0; i < 1800; i++) stepTraffic(t, 0.25, false) // pre-fill the road
  return t
}

// Advance dt seconds. closed = signals red: nothing that has not reached its gate may cross it;
// anything already past the gate carries on and clears the bascule. hurry > 1 runs the clock of
// those clearing a leaf that much faster (the film's fast lift); everyone else keeps real time.
export function stepTraffic(t, dt, closed, hurry = 1) {
  for (const L of t.lanes) {
    let lead = null
    for (const v of L.list) {
      const ty = TYPES[v.type]
      let limit = lead ? lead.u - TYPES[lead.type].len - ty.gap : Infinity
      if (closed && v.u <= STOP_U) limit = Math.min(limit, STOP_U)
      // past the gate and not yet clear of the far tower: hurry, so a slow cart ahead never holds a leaf
      const clearing = closed && v.u > STOP_U && v.u - ty.len < BASCULE_U + CLEAR_RUN
      const vdt = clearing ? dt * hurry : dt
      const want = Math.min(clearing ? Math.max(ty.vmax * 1.5, CLEAR_V) : ty.vmax * v.pace, Math.sqrt(2 * BRAKE * Math.max(0, limit - v.u)))
      v.v = want > v.v ? Math.min(want, v.v + ACCEL * vdt) : want
      // hard constraint on top of the braking curve: never into the vehicle ahead or past a closed gate
      v.u = Math.max(v.u, Math.min(v.u + v.v * vdt, limit))
      lead = v
    }
    while (L.list.length && L.list[0].u - TYPES[L.list[0].type].len > END_U) L.list.shift()
    L.wait -= dt
    const last = L.list[L.list.length - 1]
    const type = L.kinds[Math.floor(t.rand() * L.kinds.length)]
    const room = last ? last.u - TYPES[last.type].len - TYPES[type].gap - START_U : Infinity
    if (L.wait <= 0 && room > 0) {
      const pace = 0.8 + 0.3 * t.rand()
      L.list.push({ id: t.nextId++, type, u: START_U, v: Math.min(TYPES[type].vmax * pace, Math.sqrt(2 * BRAKE * room)), pace })
      L.wait = L.mean * (0.4 + 1.2 * t.rand())
    }
  }
  return t
}

// Vehicles and pedestrians on a bascule leaf or past the stop line and committed to one.
export const onLeaves = (t) =>
  t.lanes.reduce((n, L) => n + L.list.filter((v) => v.u > STOP_U && v.u - TYPES[v.type].len < BASCULE_U).length, 0)
