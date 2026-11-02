// Bare earth from a DSM: a morphological opening (min, then max, over a square window) removes anything
// narrower than the window (buildings, cranes, trees) and keeps streets, slopes and the river channel.
// Before 1950 the terrain draws min(DSM, bare + LIFT), so modern buildings in the LiDAR vanish.

// Sliding min/max over [i-r, i+r] along one row or column, O(n) (van Herk / Gil-Werman).
// shortcut: at the array ends the window widens to the end of the first/last block; fine for terrain edges.
function pass(src, dst, start, stride, n, r, op, g, h) {
  const k = 2 * r + 1
  for (let b = 0; b < n; b += k) {
    const e = Math.min(b + k, n) - 1
    g[b] = src[start + b * stride]
    for (let j = b + 1; j <= e; j++) g[j] = op(g[j - 1], src[start + j * stride])
    h[e] = src[start + e * stride]
    for (let j = e - 1; j >= b; j--) h[j] = op(h[j + 1], src[start + j * stride])
  }
  for (let i = 0; i < n; i++) dst[start + i * stride] = op(h[Math.max(i - r, 0)], g[Math.min(i + r, n - 1)])
}

function filter(src, w, h, r, op) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length)
  const g = new Float32Array(Math.max(w, h)), hh = new Float32Array(Math.max(w, h))
  for (let y = 0; y < h; y++) pass(src, tmp, y * w, 1, w, r, op, g, hh)
  for (let x = 0; x < w; x++) pass(tmp, out, x, w, h, r, op, g, hh)
  return out
}

export const LIFT = 1.5 // m of the DSM kept above bare earth: kerbs and embankment walls, not buildings

export function bareEarth(heights, w, h, r = 30) {
  const open = filter(filter(heights, w, h, r, Math.min), w, h, r, Math.max)
  for (let i = 0; i < open.length; i++) open[i] = Math.min(heights[i], open[i] + LIFT)
  return open
}

// The approach roads are raised on viaducts and embankments (1894 onwards), which the opening above takes for
// buildings and sinks ~7 m, leaving the bridge's ramp ends in mid-air. Keep the DSM along both approaches, but
// no higher than the road itself (the lowest point within APPROACH.road of the centre line, bin by bin): the roofs
// and trees lining the corridor otherwise stand as cliffs and spikes draped with the map.
export const APPROACH = { from: 133, to: 320, half: 20, road: 6 } // m along / either side of the axis / road half-width

export function keepApproaches(old, heights, w, meta) {
  const t = (meta.bridge_axis_deg * Math.PI) / 180, ae = Math.sin(t), an = Math.cos(t)
  const [minE, , , maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb
  const res = (meta.bbox_osgb[2] - minE) / w, bs = 2 * res // bin length along: every bin holds carriageway pixels
  const at = (k) => {
    const dE = minE + ((k % w) + 0.5) * res - oE, dN = maxN - (Math.floor(k / w) + 0.5) * res - oN
    const along = dE * ae + dN * an, across = Math.abs(dE * an - dN * ae)
    const a = Math.abs(along)
    return a >= APPROACH.from && a < APPROACH.to && across < APPROACH.half ? { bin: Math.floor((along + APPROACH.to) / bs), across } : null
  }
  const road = new Float32Array(Math.ceil((2 * APPROACH.to) / bs)).fill(Infinity) // lowest DSM on the carriageway, per bin
  for (let k = 0; k < old.length; k++) {
    const c = at(k)
    if (c && c.across < APPROACH.road) road[c.bin] = Math.min(road[c.bin], heights[k])
  }
  // the ramps only descend away from the bridge: where the straight axis runs under a building past the road's
  // bend, its roof is not the road, so no bin may stand above the one nearer the bridge
  const mid = Math.floor(APPROACH.to / bs)
  for (let b = mid + 1; b < road.length; b++) road[b] = Math.min(road[b], road[b - 1])
  for (let b = mid - 1; b >= 0; b--) road[b] = Math.min(road[b], road[b + 1])
  for (let k = 0; k < old.length; k++) {
    const c = at(k)
    if (c) old[k] = Math.max(old[k], Math.min(heights[k], road[c.bin]))
  }
  return old
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
