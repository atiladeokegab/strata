// Road traffic state sim (pure, no three). Each lane is a 1-D queue: u is the distance of a
// vehicle's FRONT along its direction of travel, measured so every lane meets its entry gate
// at u = -GATE_U and leaves the bascules at u = +BASCULE_U. Bridge frame: z = dir * u.
// status: inferred. Speeds and spacing are plausible street figures, not sourced.

export const GATE_U = 37 // barrier line on the fixed deck, just outside each bascule pivot
export const STOP_U = -GATE_U - 1 // vehicles stop 1 m short of the gate
// Barrier post (north-local x, z centre and width): on the footway edge, inside the tower's road arch
// (|x| < L.archHalf 9.5) and clear of the arch's inner column at z -37..-36 (check.mjs asserts both).
export const POST_X = 9.25
export const POST_Z = -GATE_U - 0.4
export const POST_W = 0.4
export const BASCULE_U = 35 // |z| < 35 is on a bascule leaf
// Past each shore abutment a ramp falls to the street (structures.jsx RAMP, STREET_DROP); road users
// arrive and leave out on the level street beyond it, not at the abutment.
export const ABUT_Z = 148.5 // |z| of the shore abutment, where the ramp starts
export const RAMP_LEN = 35 // shortcut: mirrors structures.jsx RAMP (check.mjs asserts they agree)
const STREET_RUN = 30 // m of level street past the ramp foot before a road user appears or leaves
export const START_U = -(ABUT_Z + RAMP_LEN + STREET_RUN)
export const END_U = -START_U
// Road surface height at bridge z (0 = deck level); drop = { north, south } in m, north is -z.
// Past the ramp foot an optional street profile (streetProfile) takes over, eased in over STREET_BLEND.
export const RAMP_FOOT = ABUT_Z + RAMP_LEN
const STREET_BLEND = 10
export function roadY(z, drop, street = null) {
  const d = Math.abs(z) - RAMP_FOOT
  const ramp = -(z < 0 ? drop.north : drop.south) * Math.min(1, Math.max(0, (Math.abs(z) - ABUT_Z) / RAMP_LEN))
  const ys = street && d > 0 ? street[z < 0 ? 'north' : 'south'] : null
  if (!ys) return ramp
  const i = Math.min(d, ys.length - 1.001), k = Math.floor(i)
  const t = ys[k] + (ys[k + 1] - ys[k]) * (i - k)
  if (Number.isNaN(t)) return ramp // off the terrain tile
  const w = Math.min(1, d / STREET_BLEND)
  return ramp + (t - ramp) * w * w * (3 - 2 * w)
}

// Street surface past each ramp foot for a lane at x of half-width `half`, every metre out to the
// spawn point. ground(x, z) is the terrain height in the bridge frame (or null off the tile). The
// LIDAR DSM carries kerbs, bollards, vans and the drops beside the approach viaduct, so samples more
// than STREET_TOL from the flat street level are dropped, each metre is the median of what is left
// across the lane and ±1 m along it, and the profile is then median- and mean-smoothed over 5 m.
const STREET_TOL = 1.5
const median = (a) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : NaN)
export function streetProfile(ground, x, half, drop) {
  const n = Math.ceil(END_U - RAMP_FOOT) + 12
  const side = (sgn, flat) => {
    const raw = Array.from({ length: n }, (_, k) => {
      const s = []
      for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dz of [-1, 0, 1]) {
        const y = ground(x + dx * half, sgn * (RAMP_FOOT + k) + dz)
        if (y != null && Math.abs(y - flat) <= STREET_TOL) s.push(y)
      }
      return s.length >= 5 ? median(s) : NaN
    })
    const win = (a, k, f) => f(a.slice(Math.max(0, k - 2), k + 3).filter((y) => !Number.isNaN(y)))
    const med = raw.map((_, k) => win(raw, k, median))
    return Float32Array.from(med, (_, k) => win(med, k, (a) => (a.length ? a.reduce((p, q) => p + q) / a.length : NaN)))
  }
  return { north: side(-1, -drop.north), south: side(1, -drop.south) }
}
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
  lady: { len: 0.6, vmax: 1.3, gap: 0.5 },
  tram: { len: 10.5, vmax: 4, gap: 0 }, // street only: never in a lane, see tramZ
}

// Street eras. Before 1920 the bridge carried horse traffic; between the wars motor traffic shared
// it with the last brewers' drays and coal carts; period dress until the 1960s.
// status: inferred. Plausible mixes, not counts.
export const eraOf = (year) => (year < 1920 ? 'horse' : year < 1960 ? 'interwar' : 'modern')
const ROAD = { horse: ['cart', 'hansom', 'hansom'], interwar: ['car', 'car', 'taxi', 'bus', 'cart'], modern: ['car', 'car', 'taxi', 'taxi', 'bus'] }
const PEDS = { horse: ['ped', 'lady'], interwar: ['ped', 'lady'], modern: ['ped'] }

// LCC trams ran along Tower Bridge Road to the south approach but never over the bridge (the City
// barred them). One double-ended car shuttles: in to its stop past the south ramp foot, dwell,
// reverse out past the spawn point, away a while. status: inferred, years ~1904-1952.
export const hasTram = (year) => year >= 1904 && year < 1952
export const TRAM_STOP = RAMP_FOOT + 6 // north end of the car at the stop, bridge z
export const TRAM_OUT = END_U + TYPES.tram.len // north end once wholly past the spawn point
const TRAM_RUN = 14, TRAM_DWELL = 25, TRAM_AWAY = 20 // s
export const TRAM_CYCLE = 2 * TRAM_RUN + TRAM_DWELL + TRAM_AWAY
export function tramZ(time) {
  const c = ((time % TRAM_CYCLE) + TRAM_CYCLE) % TRAM_CYCLE
  const ease = (s) => (s = Math.min(1, Math.max(0, s)), s * s * (3 - 2 * s))
  const k = c < TRAM_RUN ? 1 - ease(c / TRAM_RUN) : c < TRAM_RUN + TRAM_DWELL ? 0 : ease((c - TRAM_RUN - TRAM_DWELL) / TRAM_RUN)
  return TRAM_STOP + (TRAM_OUT - TRAM_STOP) * k
}

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
  const era = eraOf(year), road = ROAD[era], peds = PEDS[era]
  const lane = (dir, x, kinds, mean) => ({ dir, x, kinds, mean, list: [], wait: 0 })
  const t = {
    rand: rng(seed),
    nextId: 1,
    tram: hasTram(year) ? { time: 0 } : null,
    lanes: [
      lane(1, 2.5, road, 6),
      lane(-1, -2.5, road, 6),
      lane(1, 8.3, peds, 6),
      lane(-1, -8.3, peds, 6),
    ],
  }
  for (let i = 0; i < 1800; i++) stepTraffic(t, 0.25, false) // pre-fill the road
  return t
}

// Advance dt seconds. closed = signals red: nothing that has not reached its gate may cross it;
// anything already past the gate carries on and clears the bascule. hurry > 1 runs the clock of
// those clearing a leaf that much faster (the film's fast lift); everyone else keeps real time.
export function stepTraffic(t, dt, closed, hurry = 1) {
  if (t.tram) t.tram.time += dt
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

// Walk mode: a vehicle whose body comes within CAM_CLEAR m (ground plan) of the camera is hidden,
// so the walker's eye never ends up inside a bus. cam is {x, z} in the bridge frame, or null.
export const CAM_CLEAR = 4
export const nearCam = (cam, x, z, halfLen = 0) => !!cam && Math.max(0, Math.hypot(x - cam.x, z - cam.z) - halfLen) < CAM_CLEAR
