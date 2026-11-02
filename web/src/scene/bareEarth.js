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
  return hideViaducts({ meta, heights, w, h })
}

// Past each ramp's end the DTM's approach viaducts (build.py keep_approaches) go too, so 1886 has no road on arches
// ahead of the bridge: in the corridor (`half` m either side, to `to` m along) the ground is the DTM opened (a min then a
// max over `open` m), which keeps the city's broad ground and drops any ridge narrower than 2 x `open`; and from the
// ramp's floor the ground falls `slope` m a metre to it, so the half-built ramp of 1890-93 ends on a bank, not a drop.
export const VIADUCTS = { to: 360, fade: 20, half: 50, blendX: 10, open: 13, slope: 0.3 }

function hideViaducts({ meta, heights, w, h }) {
  const t = (meta.bridge_axis_deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const [minE, , maxE, maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, res = (maxE - minE) / w, R = RAMP_FLOOR, V = VIADUCTS
  const r = Math.max(1, Math.round(V.open / res))
  for (const side of [-1, 1]) { // north, then south: one box each, not the river between
    const cells = [], corners = [[-V.half, R.to], [V.half, R.to], [-V.half, V.to], [V.half, V.to]].map(([x, z]) => [x * s + z * side * c, x * c - z * side * s]) // grid (gz, gx)
    const ci = corners.map(([gz]) => (gz - oN + maxN) / res - 0.5), cj = corners.map(([, gx]) => (gx + oE - minE) / res - 0.5)
    let i0 = h, i1 = -1, j0 = w, j1 = -1
    for (let i = Math.max(0, Math.floor(Math.min(...ci))); i <= Math.min(h - 1, Math.ceil(Math.max(...ci))); i++) {
      const gz = oN - (maxN - (i + 0.5) * res)
      for (let j = Math.max(0, Math.floor(Math.min(...cj))); j <= Math.min(w - 1, Math.ceil(Math.max(...cj))); j++) {
        const gx = minE + (j + 0.5) * res - oE, x = gx * c + gz * s, z = (-gx * s + gz * c) * side
        if (z < R.to || z > V.to || Math.abs(x) > V.half) continue
        const k = smooth(R.to, R.to + R.blend, z) * (1 - smooth(V.to - V.fade, V.to, z)) * (1 - smooth(V.half - V.blendX, V.half, Math.abs(x)))
        if (k <= 0) continue
        cells.push(i, j, k, Math.hypot(Math.max(0, Math.abs(x) - R.half), z - R.to)) // weight, m from the ramp's end
        i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j)
      }
    }
    if (i1 < 0) continue
    // the opening over the box grown by 2r: min along rows then columns, then max the same way
    const bi = Math.max(0, i0 - 2 * r), bj = Math.max(0, j0 - 2 * r), bh = Math.min(h - 1, i1 + 2 * r) - bi + 1, bw = Math.min(w - 1, j1 + 2 * r) - bj + 1
    let box = new Float32Array(bw * bh)
    for (let i = 0; i < bh; i++) box.set(heights.subarray((bi + i) * w + bj, (bi + i) * w + bj + bw), i * bw)
    const pass = (src, max, di, dj) => {
      const out = new Float32Array(bw * bh)
      for (let i = 0; i < bh; i++) for (let j = 0; j < bw; j++) {
        let v = src[i * bw + j]
        for (let q = -r; q <= r; q++) {
          const ii = i + q * di, jj = j + q * dj
          if (ii < 0 || ii >= bh || jj < 0 || jj >= bw) continue
          const u = src[ii * bw + jj]
          if (max ? u > v : u < v) v = u
        }
        out[i * bw + j] = v
      }
      return out
    }
    box = pass(pass(pass(pass(box, false, 0, 1), false, 1, 0), true, 0, 1), true, 1, 0)
    const top = meta.origin_h + (side < 0 ? STREETS.north : STREETS.south)[0] - R.below
    for (let q = 0; q < cells.length; q += 4) {
      const [i, j, k, d] = [cells[q], cells[q + 1], cells[q + 2], cells[q + 3]], g = i * w + j
      const y = Math.max(box[(i - bi) * bw + j - bj], top - V.slope * d)
      if (heights[g] > y) heights[g] += (y - heights[g]) * k
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

// St Katharine's basins. The DTM's dock walls wander a few metres either side of OSM's outline (surfaces.png R), and
// beside them it dips in a jagged fringe, below the river in places, that the drape shows as the marina's white boats
// and green trees. Snapped to the outline: the basin a flat sheet at its median level, a wall on the outline (R's soft
// edge places it between cells), and the ground within `reach` m outside brought up to the quay around it (the highest
// ground within `look` m among cells `from`-`reach` m out, and never under `rise` m above the basin: the east basin's
// DTM is low for 25 m out, under seven blocks that should stand on the quay), tapering back to the DTM from `taper` m. Run after sinkShelves, so the river's sunk
// foreshore at the lock is bed and stays. The channels between basins (outside the outline, with a basin within `gap` m on
// two opposite sides, under `water` m above the basin, in a sheet of `pool` m² or more) are water: flat at the basin's level, never raised; so is any sliver
// under `sliver` m each side of which is a basin, whatever its height (the DTM keeps a footbridge's deck).
export const DOCK_EDGE = { reach: 20, taper: 12, from: 3, look: 6, rise: 2, gap: 20, water: 1, pool: 40, sliver: 2 }

/** Snaps the docks in a tile's bare earth ({ meta, heights, w, h }, m OD) to their outline (mask: { data, w, h }, R of
 * surfaces.png, 4 bytes a pixel, over the same bbox). Mutates and returns heights. */
export function snapDocks({ meta, heights, w, h }, mask) {
  const E = DOCK_EDGE, res = (meta.bbox_osgb[2] - meta.bbox_osgb[0]) / w, n = w * h
  const r = new Float32Array(n), dist = new Float32Array(n).fill(Infinity), queue = new Int32Array(n)
  let tail = 0
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) { // R at the cell centre, nearest mask pixel
    const k = i * w + j, mi = Math.min(mask.h - 1, Math.floor(((i + 0.5) * mask.h) / h)), mj = Math.min(mask.w - 1, Math.floor(((j + 0.5) * mask.w) / w))
    r[k] = mask.data[(mi * mask.w + mj) * 4] / 255
    if (r[k] >= 0.5) { dist[k] = 0; queue[tail++] = k }
  }
  if (!tail) return heights
  const inside = []
  for (let q = 0; q < tail; q++) if (r[queue[q]] > 0.99) inside.push(heights[queue[q]])
  inside.sort((a, b) => a - b)
  const basin = inside.length ? inside[inside.length >> 1] : null
  for (let head = 0; head < tail; head++) { // metres out from the outline, 4-neighbour, as far as `reach`
    const k = queue[head], d = dist[k] + res, i = Math.floor(k / w), j = k % w
    if (d > E.reach) continue
    const visit = (m) => { if (dist[m] === Infinity) { dist[m] = d; queue[tail++] = m } }
    if (i > 0) visit(k - w)
    if (i < h - 1) visit(k + w)
    if (j > 0) visit(k - 1)
    if (j < w - 1) visit(k + 1)
  }
  // the quay: separable max over `look` m of the ground `from`-`reach` m out, past the fringe (the river's carved bed
  // never counts, nor is it raised: the lock opens onto it)
  const bed = meta.water_h - 1, L = Math.max(1, Math.round(E.look / res)), src = new Float32Array(n).fill(-Infinity), row = new Float32Array(n).fill(-Infinity)
  for (let q = 0; q < tail; q++) { const k = queue[q]; if (dist[k] >= E.from && heights[k] >= bed) src[k] = heights[k] }
  for (let q = 0; q < tail; q++) { const k = queue[q], j = k % w; if (src[k] > -Infinity) for (let t = Math.max(0, j - L); t <= Math.min(w - 1, j + L); t++) row[k - j + t] = Math.max(row[k - j + t], src[k]) }
  const quay = (k) => { const i = Math.floor(k / w); let v = -Infinity; for (let t = Math.max(0, i - L); t <= Math.min(h - 1, i + L); t++) v = Math.max(v, row[k + (t - i) * w]); return v }
  // cells between two basins: metres to the nearest dock cell each way along the row and the column
  const G = Math.round(E.gap / res), run = (start, step, count, back) => { // fills back[] with cells since the last dock, capped
    let c = G + 1
    for (let t = 0; t < count; t++) { const k = start + t * step; c = r[k] >= 0.5 ? 0 : Math.min(G + 1, c + 1); back[k] = c }
  }
  const a = new Uint8Array(n), b = new Uint8Array(n), c = new Uint8Array(n), e = new Uint8Array(n)
  for (let i = 0; i < h; i++) { run(i * w, 1, w, a); run(i * w + w - 1, -1, w, b) }
  for (let j = 0; j < w; j++) { run(j, w, h, c); run((h - 1) * w + j, -w, h, e) }
  const wet = new Uint8Array(n) // 1 a candidate, 2 kept: only a sheet of `pool` m² or more, never the fringe's odd low cell
  const T = Math.max(1, Math.round(E.sliver / res))
  for (let q = 0; q < tail; q++) {
    const k = queue[q]
    if (basin === null || r[k] >= 0.5) continue
    if ((a[k] <= T && b[k] <= T) || (c[k] <= T && e[k] <= T)) wet[k] = 2 // a sliver between two outlines (a footbridge's deck the DTM kept): water
    else if (heights[k] < basin + E.water && ((a[k] <= G && b[k] <= G) || (c[k] <= G && e[k] <= G))) wet[k] = 1
  }
  const part = new Int32Array(n)
  for (let q = 0; q < tail; q++) {
    if (wet[queue[q]] !== 1) continue
    let size = 0
    part[size++] = queue[q]; wet[queue[q]] = 3
    for (let p = 0; p < size; p++) {
      const k = part[p], i = Math.floor(k / w), j = k % w
      for (const m of [i > 0 ? k - w : -1, i < h - 1 ? k + w : -1, j > 0 ? k - 1 : -1, j < w - 1 ? k + 1 : -1]) if (m >= 0 && wet[m] === 1) { wet[m] = 3; part[size++] = m }
    }
    const keep = size * res * res >= E.pool ? 2 : 4
    for (let p = 0; p < size; p++) wet[part[p]] = keep
  }
  const out = new Float32Array(tail)
  for (let q = 0; q < tail; q++) {
    if (wet[queue[q]] === 2) { out[q] = basin; continue }
    const k = queue[q], top = Math.max(quay(k), basin === null ? -Infinity : basin + E.rise), d = dist[k]
    let y = heights[k]
    if (top > -Infinity && y >= bed) y += (Math.max(y, top) - y) * (1 - smooth(E.taper, E.reach, d))
    out[q] = basin === null ? y : y + (basin - y) * smooth(0.25, 0.75, r[k])
  }
  for (let q = 0; q < tail; q++) heights[queue[q]] = out[q]
  return heights
}

// The docks' granite coping: a strip `width` m wide along each outline (docks.json, scripts/terrain/surfaces.py), from
// `inset` m inside it, its top `proud` m above the quay snapDocks made (sampled `quay` m out), its back down into the
// quay, and the wall under it battered out to `batter` m inside the outline, past the basin: the 1 m DTM's drop between
// a quay cell and a basin cell spans up to 1.4 m, so a plumb face left its sawtooth standing in front. None where the
// other side is another basin (their shared edges), a channel's water or the river (the lock's mouth).
export const COPING = { width: 0.6, inset: 0.35, proud: 0.3, quay: 2, piece: 2, below: 0.5, smooth: 3, batter: 2 }

/** The coping's triangles (positions, scene frame, flat: one normal a face) for docks.json `rings` over a tile's
 * snapped ground ({ meta, heights, w, h }, m OD) and surfaces.png's pixels (`mask`, R the docks). */
export function dockCoping(rings, { meta, heights, w, h }, mask) {
  const C = COPING, [minE, , maxE, maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb, span = maxE - minE
  const ground = (x, z) => { // m OD, bilinear, clamped to the tile
    const j = Math.min(w - 1.001, Math.max(0, ((x + oE - minE) * w) / span - 0.5)), i = Math.min(h - 1.001, Math.max(0, ((z - oN + maxN) * h) / span - 0.5))
    const j0 = Math.floor(j), i0 = Math.floor(i), fj = j - j0, fi = i - i0, k = i0 * w + j0
    return (heights[k] * (1 - fj) + heights[k + 1] * fj) * (1 - fi) + (heights[k + w] * (1 - fj) + heights[k + w + 1] * fj) * fi
  }
  const dock = (x, z) => { const j = Math.floor(((x + oE - minE) * mask.w) / span), i = Math.floor(((z - oN + maxN) * mask.h) / span); return i >= 0 && j >= 0 && i < mask.h && j < mask.w ? mask.data[(i * mask.w + j) * 4] / 255 : 0 }
  const out = []
  let flip = false // a ring's winding turns its pieces, so their quads turn with it
  const quad = (a, b, c, d) => (flip ? out.push(...a, ...c, ...b, ...a, ...d, ...c) : out.push(...a, ...b, ...c, ...a, ...c, ...d))
  const tri = (a, b, c) => (flip ? out.push(...a, ...c, ...b) : out.push(...a, ...b, ...c))
  for (const flat of rings) {
    let p = []
    for (let q = 0; q < flat.length; q += 2) p.push([flat[q], flat[q + 1]])
    if (p.length > 2 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p.pop()
    let area = 0
    p.forEach(([x, z], q) => { const [x1, z1] = p[(q + 1) % p.length]; area += x * z1 - x1 * z })
    const sign = area > 0 ? 1 : -1
    flip = sign > 0
    // the ring cut into pieces of at most `piece` m, each with its outward normal and whether it gets coping
    const pts = [], nrm = []
    p.forEach(([x0, z0], q) => {
      const [x1, z1] = p[(q + 1) % p.length], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / C.piece))
      if (!len) return
      for (let t = 0; t < n; t++) { pts.push([x0 + ((x1 - x0) * t) / n, z0 + ((z1 - z0) * t) / n]); nrm.push([(sign * (z1 - z0)) / len, (-sign * (x1 - x0)) / len]) }
    })
    const N = pts.length, at = (q) => pts[(q + N) % N]
    // each point: the mitred outward normal of its two pieces, and the quay's level there, smoothed along the ring
    const miter = pts.map((_, q) => {
      const a = nrm[(q - 1 + N) % N], b = nrm[q], m = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(...m) || 1, cos = Math.max(0.5, (m[0] * b[0] + m[1] * b[1]) / l)
      return [m[0] / l / cos, m[1] / l / cos]
    })
    const basin = [...pts.map(([x, z], q) => ground(x - miter[q][0] * 3, z - miter[q][1] * 3))].sort((a, b) => a - b)[N >> 1]
    const on = nrm.map((n, q) => {
      const [x0, z0] = at(q), [x1, z1] = at(q + 1), mx = (x0 + x1) / 2 + n[0] * C.quay, mz = (z0 + z1) / 2 + n[1] * C.quay
      return dock(mx, mz) < 0.5 && ground(mx, mz) > Math.max(meta.water_h, basin + 0.5)
    })
    const quay = pts.map(([x, z], q) => ground(x + miter[q][0] * C.quay, z + miter[q][1] * C.quay))
    const top = quay.map((y, q) => { // the mean over the coped pieces near, so a channel's water never pulls it down
      let v = 0, c = 0
      for (let d = -C.smooth; d <= C.smooth; d++) if (on[(q + d + N) % N]) { v += quay[(q + d + N) % N]; c++ }
      return (c ? v / c : y) + C.proud
    })
    // the batter's foot, held back at a corner it turns into so it never folds over (each end eats at most 0.45 of a piece)
    const foot = pts.map((_, q) => {
      let b = C.batter
      for (const s of [q - 1, q]) {
        const [x0, z0] = at(s), [x1, z1] = at(s + 1), len = Math.hypot(x1 - x0, z1 - z0), dot = (miter[q][0] * (x1 - x0) + miter[q][1] * (z1 - z0)) / len
        const rate = s === q ? -dot : dot // how fast pushing this point in shortens that piece's foot
        if (rate > 1e-6) b = Math.min(b, (0.45 * len) / rate)
      }
      return Math.max(C.inset, b) // plumb at worst, never leaning over the water
    })
    const y0 = meta.origin_h, V = (q, d, y) => [at(q)[0] + miter[(q + N) % N][0] * d, y - y0, at(q)[1] + miter[(q + N) % N][1] * d]
    const inn = -C.inset, outr = C.width - C.inset
    for (let q = 0; q < N; q++) {
      if (!on[q]) continue
      const r = (q + 1) % N, tq = top[q], tr = top[r]
      quad(V(q, inn, tq), V(q, outr, tq), V(r, outr, tr), V(r, inn, tr)) // the top
      quad(V(q, -foot[q], basin - C.below), V(q, inn, tq), V(r, inn, tr), V(r, -foot[r], basin - C.below)) // the wall, battered out past the water
      quad(V(q, outr, tq), V(q, outr, quay[q] - C.below), V(r, outr, quay[r] - C.below), V(r, outr, tr)) // the back, into the quay
      if (!on[(q - 1 + N) % N]) { // ends where it stops: the block's, then the batter's triangle
        quad(V(q, outr, tq), V(q, inn, tq), V(q, inn, basin - C.below), V(q, outr, quay[q] - C.below))
        tri(V(q, inn, tq), V(q, -foot[q], basin - C.below), V(q, inn, basin - C.below))
      }
      if (!on[r]) {
        quad(V(r, inn, tr), V(r, outr, tr), V(r, outr, quay[r] - C.below), V(r, inn, basin - C.below))
        tri(V(r, inn, tr), V(r, inn, basin - C.below), V(r, -foot[r], basin - C.below))
      }
    }
  }
  return new Float32Array(out)
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
