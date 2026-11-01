// High walkway girders, kept out of JSX so check.mjs can measure them.
import { beam, box, merge } from './geom.js'

// Each walkway is a pair of riveted lattice girders: T-section booms, paired-angle posts at the panel points,
// and a close multiple lattice of flat bars at 45° (riveted where they cross, so the two directions sit
// either side of the girder plane). Cross girders and diagonal bracing tie the pair in the floor and roof planes.
// Flat bar in the girder plane (x fixed): `wd` wide in the plane, `t` thick across it.
const bar = (x, [ya, za], [yb, zb], wd, t = 0.035) =>
  box(t, wd, Math.hypot(yb - ya, zb - za)).rotateX(-Math.atan2(yb - ya, zb - za)).translate(x, (ya + yb) / 2, (za + zb) / 2)
export const WALK = { w: 1.6, panels: 20, pitch: 0.9, boom: 0.3 } // half width, panels per span, lattice bar spacing, boom depth

// x: walkway centre line; ze: half span (tower face to tower face); y0, y1: floor and roof booms.
export function walkwayTruss(x, ze, y0, y1) {
  const { w, panels: n, pitch, boom } = WALK, len = 2 * ze
  const gs = []
  for (const sx of [-1, 1]) {
    const gx = x + sx * w
    for (const [y, up] of [[y0, 1], [y1, -1]]) {
      gs.push(box(0.5, 0.05, len, gx, y + (up * 0.05) / 2, 0)) // boom flange
      gs.push(box(0.08, boom, len, gx, y + (up * boom) / 2, 0)) // boom web
    }
    // lattice between the booms, clipped to the span
    const lo = y0 + boom, hi = y1 - boom, h = hi - lo
    for (const dir of [1, -1])
      for (let z = -ze - h; z < ze; z += pitch) {
        let [za, zb] = dir > 0 ? [z, z + h] : [z + h, z]
        let ya = lo, yb = hi
        const clip = (zv) => Math.min(ze - 0.15, Math.max(-ze + 0.15, zv))
        const ca = clip(za), cb = clip(zb)
        ya = lo + (h * (ca - za)) / (zb - za)
        yb = hi - (h * (zb - cb)) / (zb - za)
        if (yb - ya < 0.3) continue
        gs.push(bar(gx + dir * 0.025, [ya, ca], [yb, cb], 0.11))
      }
    // paired-angle posts at the panel points
    for (let i = 0; i <= n; i++) {
      const z = -ze + (len * i) / n
      for (const dz of [-0.09, 0.09]) gs.push(box(0.26, y1 - y0, 0.06, gx, (y0 + y1) / 2, Math.max(-ze + 0.03, Math.min(ze - 0.03, z + dz))))
    }
  }
  // cross girders under the floor and over the roof at each post, diagonal bracing in both planes
  for (let i = 0; i <= n; i++) {
    const z = -ze + (len * i) / n
    const zc = Math.max(-ze + 0.07, Math.min(ze - 0.07, z)) // end girders bear against the tower faces
    gs.push(box(2 * w, 0.32, 0.14, x, y0 - 0.16, zc), box(2 * w, 0.2, 0.12, x, y1 - 0.1, zc))
    if (i < n) {
      const zn = z + len / n
      for (const y of [y0 - 0.3, y1 - 0.15]) gs.push(beam([x - w, y, z], [x + w, y, zn], 0.035, 4), beam([x + w, y, z], [x - w, y, zn], 0.035, 4))
    }
  }
  return merge(gs)
}

