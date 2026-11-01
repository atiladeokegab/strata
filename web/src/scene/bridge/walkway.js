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


// Deck, roof, the 1982 glazing and the 2014 glass floor, one geometry list per material.
// The floor's walking surface is y0 + FLOOR_TOP (WalkwayPeople stand on it). The glass floor is the
// middle GLASS_FLOOR.len of the span, GLASS_FLOOR.w wide, so the timber floor around it is cut away there.
export const FLOOR_TOP = 0.275
export const GLASS_FLOOR = { len: 11, w: 1.8, panes: 4 }
export function walkwayInfill(x, ze, y0, y1) {
  const { w, panels: n, boom } = WALK, len = 2 * ze, top = y0 + FLOOR_TOP, gl = GLASS_FLOOR
  const deck = (z0, z1, x0, x1) => box(x1 - x0, 0.3, z1 - z0, x + (x0 + x1) / 2, top - 0.15, (z0 + z1) / 2)
  const side = (w - gl.w / 2) // timber either side of the glass
  const o = {
    roof: [box(2 * w + 0.6, 0.3, len, x, y1 + 0.2, 0)],
    floor: [deck(-ze, ze, -w, w)],
    floorGap: [deck(-ze, -gl.len / 2, -w, w), deck(gl.len / 2, ze, -w, w), deck(-gl.len / 2, gl.len / 2, -w, -w + side), deck(-gl.len / 2, gl.len / 2, w - side, w)],
    glassFloor: [box(gl.w, 0.08, gl.len, x, top - 0.04, 0)],
    glassFrames: [],
    glazing: [],
    frames: [],
  }
  // glass floor: steel frames round and between the panes, flush with the walking surface
  for (let i = 0; i <= gl.panes; i++) o.glassFrames.push(box(gl.w + 0.1, 0.1, 0.08, x, top - 0.05, -gl.len / 2 + (gl.len * i) / gl.panes))
  for (const s of [-1, 1]) o.glassFrames.push(box(0.08, 0.1, gl.len, x + s * (gl.w / 2 + 0.01), top - 0.05, 0))
  // 1982 glazing: a glass sheet inside each lattice, framed per panel in three lights with a transom
  const gy0 = top, gy1 = y1 - boom, gx = w - 0.16
  for (const s of [-1, 1]) {
    const px = x + s * gx
    o.glazing.push(box(0.02, gy1 - gy0, len, px, (gy0 + gy1) / 2, 0))
    o.frames.push(box(0.1, 0.12, len, px, gy0 + 0.06, 0), box(0.1, 0.1, len, px, gy1 - 0.05, 0), box(0.07, 0.06, len, px, gy0 + (gy1 - gy0) * 0.7, 0))
    for (let i = 0; i < n * 3; i++) {
      if (i % 3 === 0) continue // the panel posts already frame these
      const z = -ze + (len * i) / (n * 3)
      o.frames.push(box(0.07, gy1 - gy0, 0.06, px, (gy0 + gy1) / 2, z))
    }
  }
  return o
}
