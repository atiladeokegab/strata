// The approach corridor, shared with scripts/terrain/build.py (APPROACH there), which keeps the approach viaducts in
// the terrain's bare earth (bare.png, the EA LiDAR DTM). Here it bounds the bridge's own ground below.
export const APPROACH = { from: 133, to: 320, half: 20, road: 6 } // m along / either side of the axis / road half-width

// The approach streets. The DTM keeps only the viaduct roads themselves (build.py keep_approaches): ridges 6-12 m wide
// with 6-8 m drops either side, so before Google's tiles both approaches ran in a trench of walls and the deck ends
// stood over a step. Here the ground either side of the axis comes up to a street at the deck end's level (y, m from
// the deck: structures.jsx STREET_DROP, north 2.6, south 4.0), falling evenly to where each approach meets the city at
// APPROACH.to, and blends back into the ground from `half` to `edge` across (a slope of 1 in 10 or gentler, so the
// street never stands on a plateau) and along over `fade`. The
// city's buildings beside it keep their bases on the old ground, so the street buries their lowest storey, as the
// viaducts' own walls did.
// It starts under the ramp's last metres (`from`), where the ground is already at road level, so the ends meet.
// It hands back to the ground over `fade` (along, m) on each side: the south at the city's level; the north goes on
// level past APPROACH.to, over the DTM's 4 m hollow at 330-380 m (in the 1971 end-out the street ended at its lip in a
// ragged crest), to where the ground comes back up to it.
export const STREETS = { half: 30, edge: 90, from: 172, deckEnd: 183.5, fade: { north: [385, 420], south: [APPROACH.to, 345] }, north: [-2.6, -3.3], south: [-4.0, -7.4] }

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Levels the approach streets into a tile's bare earth ({ meta, heights, w, h }, heights in m OD). Mutates heights. */
export function levelStreets({ meta, heights, w, h }) {
  const t = (meta.bridge_axis_deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const [minE, , maxE, maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, res = (maxE - minE) / w
  const S = STREETS, span = APPROACH.to - S.deckEnd
  for (let i = 0; i < h; i++) {
    const gz = oN - (maxN - (i + 0.5) * res)
    for (let j = 0; j < w; j++) {
      const gx = minE + (j + 0.5) * res - oE
      const x = gx * c + gz * s, z = -gx * s + gz * c // grid to bridge frame, as three.js rotation-y turns it
      const a = Math.abs(z), k = smooth(S.from, S.deckEnd, a) * (1 - smooth(...S.fade[z < 0 ? 'north' : 'south'], a)) * (1 - smooth(S.half, S.edge, Math.abs(x)))
      if (k <= 0) continue
      const [y0, y1] = z < 0 ? S.north : S.south
      const y = meta.origin_h + y0 + (y1 - y0) * Math.min(1, Math.max(0, (a - S.deckEnd) / span))
      heights[i * w + j] += (y - heights[i * w + j]) * k
    }
  }
  return heights
}

// Before the bridge opened (1894) there was no street at the deck ends: the ground there is the DTM as surveyed, except
// under each ramp (Abutment's bank, z 148.5 to 183.5, |x| to ROAD_HALF and its parapets), which goes just below the
// ramp's foot (the streets' deck-end level): the bank scales up out of that level while it is built, and the finished
// viaduct the DTM surveyed there would cut through it.
export const RAMP_FLOOR = { from: 140, to: STREETS.deckEnd, blend: 2.5, half: 10, blendX: 2, below: 0.15 }

/** The ground before the bridge opened: bare earth ({ meta, heights, w, h }, m OD) with the ramps' footprints no higher
 * than their foot. Mutates and returns heights. */
export function rampFloor({ meta, heights, w, h }) {
  const t = (meta.bridge_axis_deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const [minE, , maxE, maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, res = (maxE - minE) / w, R = RAMP_FLOOR
  for (let i = 0; i < h; i++) {
    const gz = oN - (maxN - (i + 0.5) * res)
    for (let j = 0; j < w; j++) {
      const gx = minE + (j + 0.5) * res - oE
      const x = gx * c + gz * s, z = -gx * s + gz * c, a = Math.abs(z) // grid to bridge frame, as levelStreets
      const k = smooth(R.from - R.blend, R.from, a) * (1 - smooth(R.to, R.to + R.blend, a)) * (1 - smooth(R.half, R.half + R.blendX, Math.abs(x)))
      if (k <= 0) continue
      const top = meta.origin_h + (z < 0 ? STREETS.north : STREETS.south)[0] - R.below, g = i * w + j
      if (heights[g] > top) heights[g] += (top - heights[g]) * k
    }
  }
  return heights
}

// The river's shelves. Moored barges, houseboats and foreshore read in the LiDAR as flat ground a little above the
// water (build.py only carves the flat, open river), and a sheet draped there stood in the river as a tan island.
// Ground under `shelf` m above the water, joined to the river under the deck and within `reach` m of open water, goes
// down to the bed (build.py's bed, 2 m under), so the water covers it to the real bank walls, which stand higher.
export const SHELVES = { shelf: 1.5, reach: 60 }

/** Sinks the river's shelves in a tile's bare earth ({ meta, heights, w, h }, m OD). Mutates and returns heights. */
export function sinkShelves({ meta, heights, w, h }) {
  const [minE, , maxE, maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, res = (maxE - minE) / w
  const water = meta.water_h, top = water + SHELVES.shelf, bed = water - 2
  const dist = new Float32Array(w * h).fill(Infinity), queue = new Int32Array(w * h)
  // 1. the open river: wet cells joined to the cell under the deck
  const seed = Math.round((maxN - oN) / res - 0.5) * w + Math.round((oE - minE) / res - 0.5)
  if (!(heights[seed] < water)) return heights // no river under the deck (a test tile): nothing to sink
  let head = 0, tail = 0
  dist[seed] = 0; queue[tail++] = seed
  const step = (k, d, ok) => {
    const i = Math.floor(k / w), j = k % w
    for (const n of [i > 0 ? k - w : -1, i < h - 1 ? k + w : -1, j > 0 ? k - 1 : -1, j < w - 1 ? k + 1 : -1]) {
      if (n >= 0 && dist[n] === Infinity && ok(n)) { dist[n] = d; queue[tail++] = n }
    }
  }
  while (head < tail) step(queue[head++], 0, (n) => heights[n] < water)
  // 2. out from it over the shelves, breadth first, as far as `reach`
  for (head = 0; head < tail; head++) {
    const k = queue[head], d = dist[k] + res
    if (d <= SHELVES.reach) step(k, d, (n) => heights[n] < top)
  }
  for (let k = 0; k < w * h; k++) if (dist[k] > 0 && dist[k] < Infinity) heights[k] = bed
  return heights
}

// The bridge's own ground, in the scene frame (u downstream, v along the bridge, south +): the towers, piers and side
// spans to the abutments, the approach roadway either side of the axis, and the south-east engine house and
// accumulator (bridge/engineRoom.jsx: house x 20-44, z 146-166; accumulator at 18.9, 143.8). No city building may
// stand on any of it. The box stops at x 41, Anchor Brewhouse's west wall: the real landmark stays, and its corner
// shares 5 m2 with the house's north-east corner (x 41-44, z 146-150).
export const BRIDGE_GROUND = [[-32, -145, 32, 145], [-10, -APPROACH.to, 10, APPROACH.to], [15.5, 140.5, 41, 166.5]]

// True when a footprint (flat [x0, z0, x1, z1, ...] in the grid frame, turned by axisDeg into the scene) touches it.
export function onBridgeGround(o, axisDeg) {
  const t = (axisDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), n = o.length / 2
  const u = (i) => o[2 * i] * c + o[2 * i + 1] * s, v = (i) => -o[2 * i] * s + o[2 * i + 1] * c // three.js rotation-y
  return BRIDGE_GROUND.some(([u0, v0, u1, v1]) => {
    let inside = false // the rect's centre inside the footprint (a footprint wrapping the rect)
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [ua, va, ub, vb] = [u(i), v(i), u(j), v(j)]
      if ((va > cv) !== (vb > cv) && cu < ((ub - ua) * (cv - va)) / (vb - va) + ua) inside = !inside
      // Liang-Barsky: does edge a-b reach the rect?
      let lo = 0, hi = 1
      const clip = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r); return lo <= hi }
      const du = ub - ua, dv = vb - va
      if (clip(-du, ua - u0) && clip(du, u1 - ua) && clip(-dv, va - v0) && clip(dv, v1 - va)) return true
    }
    return inside
  })
}
