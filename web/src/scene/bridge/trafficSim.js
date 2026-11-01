// Road traffic state sim (pure, no three). Each lane is a 1-D queue: u is the distance of a
// vehicle's FRONT along its direction of travel, measured so every lane meets its entry gate
// at u = -GATE_U and leaves the bascules at u = +BASCULE_U. Bridge frame: z = dir * u.
// status: inferred. Speeds and spacing are plausible street figures, not sourced.

export const GATE_U = 37 // barrier line on the fixed deck, just outside each bascule pivot
export const STOP_U = -GATE_U - 1 // vehicles stop 1 m short of the gate
export const BASCULE_U = 35 // |z| < 35 is on a bascule leaf
export const START_U = -140
export const END_U = 140
const ACCEL = 2 // m/s²
const BRAKE = 3 // m/s², comfortable deceleration used to plan the stop

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
  for (let i = 0; i < 1200; i++) stepTraffic(t, 0.25, false) // pre-fill the road
  return t
}

// Advance dt seconds. closed = signals red: nothing that has not reached its gate may cross it;
// anything already past the gate carries on and clears the bascule.
export function stepTraffic(t, dt, closed) {
  for (const L of t.lanes) {
    let lead = null
    for (const v of L.list) {
      const ty = TYPES[v.type]
      let limit = lead ? lead.u - TYPES[lead.type].len - ty.gap : Infinity
      if (closed && v.u <= STOP_U) limit = Math.min(limit, STOP_U)
      const hurry = closed && v.u > -BASCULE_U && v.u - ty.len < BASCULE_U ? 1.5 : 1
      const want = Math.min(ty.vmax * v.pace * hurry, Math.sqrt(2 * BRAKE * Math.max(0, limit - v.u)))
      v.v = want > v.v ? Math.min(want, v.v + ACCEL * dt) : want
      // hard constraint on top of the braking curve: never into the vehicle ahead or past a closed gate
      v.u = Math.max(v.u, Math.min(v.u + v.v * dt, limit))
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
