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
// buildings and sinks ~7 m, leaving the bridge's ramp ends in mid-air. Keep the DSM along both approaches.
export const APPROACH = { from: 133, to: 320, half: 20 } // m along / either side of the bridge axis

export function keepApproaches(old, heights, w, meta) {
  const t = (meta.bridge_axis_deg * Math.PI) / 180, ae = Math.sin(t), an = Math.cos(t)
  const [minE, , , maxN] = meta.bbox_osgb, [oE, oN] = meta.origin_osgb
  const res = (meta.bbox_osgb[2] - minE) / w
  for (let k = 0; k < old.length; k++) {
    const dE = minE + ((k % w) + 0.5) * res - oE, dN = maxN - (Math.floor(k / w) + 0.5) * res - oN
    const along = Math.abs(dE * ae + dN * an), across = Math.abs(dE * an - dN * ae)
    if (along >= APPROACH.from && along < APPROACH.to && across < APPROACH.half) old[k] = heights[k]
  }
  return old
}
