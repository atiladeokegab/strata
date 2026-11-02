// The Thames' footprint for Water.jsx: the bare-earth cells below the water line that join up with the river under the
// deck (so a dry sunken bowl like the Scoop, or any low ground cut off from the river, never takes water), grown by
// one cell so the surface runs in under the river walls. Each row's run of cells is one quad: one mesh, ~1-2k triangles.

// t is a decoded terrain tile ({ meta, heights, w, h }, heights in metres OD). Returns the quads as flat positions and
// indices in the grid frame (x east, z south, metres from the deck centre), at y = 0.
export function riverFootprint({ meta, heights, w, h }) {
  const [minE, , maxE, maxN] = meta.bbox_osgb
  const [oE, oN] = meta.origin_osgb
  const res = (maxE - minE) / w
  const wet = (k) => heights[k] < meta.water_h
  const seed = Math.floor((maxN - oN) / res) * w + Math.floor((oE - minE) / res) // the river under the deck
  if (!wet(seed)) throw new Error('riverFootprint: the ground under the deck is above the water line')
  const river = new Uint8Array(w * h)
  river[seed] = 1
  for (const q = [seed]; q.length;) {
    const k = q.pop(), i = Math.floor(k / w), j = k % w
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, n = a * w + b
      if (a >= 0 && a < h && b >= 0 && b < w && !river[n] && wet(n)) { river[n] = 1; q.push(n) }
    }
  }
  const grown = new Uint8Array(w * h)
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    for (let a = Math.max(0, i - 1); a <= Math.min(h - 1, i + 1) && !grown[i * w + j]; a++)
      for (let b = Math.max(0, j - 1); b <= Math.min(w - 1, j + 1); b++) if (river[a * w + b]) { grown[i * w + j] = 1; break }
  }
  const positions = [], index = []
  for (let i = 0; i < h; i++) {
    const z0 = oN - (maxN - i * res), z1 = z0 + res
    for (let j = 0; j < w;) {
      if (!grown[i * w + j]) { j++; continue }
      let e = j
      while (e < w && grown[i * w + e]) e++
      const x0 = minE + j * res - oE, x1 = minE + e * res - oE, v = positions.length / 3
      positions.push(x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z0) // counter-clockwise seen from above: faces +y
      index.push(v, v + 1, v + 2, v, v + 2, v + 3)
      j = e
    }
  }
  return { positions, index }
}
