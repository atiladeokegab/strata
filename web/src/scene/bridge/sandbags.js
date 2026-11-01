// 1939-45 sandbags (inferred: ARP practice; no Tower Bridge photo of them yet). Plain JS so check.mjs can
// build it. Rounded sacks, not blocks: a squashed low-poly ball reads as a filled bag from the river.
import * as THREE from 'three'
import { LITE } from '../look/tier.js'

const SACK = new THREE.SphereGeometry(0.5, 6, 3) // 24 triangles
export const sack = (w, h, d, x, y, z) => SACK.clone().scale(w, h, d).translate(x, y, z)

// A battered wall of staggered courses from a to b along `axis`, centred on c across it, standing on y.
// The lower half is two sacks deep. Each course sits a little into the one below, so the seams show as dark creases.
export function sackWall(out, axis, a, b, c, y, courses, lite = LITE) {
  const w = lite ? 1.4 : 0.9, h = 0.34, d = 0.62, len = b - a, n = Math.max(1, Math.round(len / w)), s = len / n
  for (let k = 0; k < courses; k++) {
    const rows = k < courses / 2 ? 2 : 1, yy = y + h / 2 + k * h * 0.82
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n - (k % 2); i++) {
        const t = a + ((i + 0.5 + (k % 2) / 2) * len) / n, u = c + (j - (rows - 1) / 2) * d * 0.9
        out.sand.push(axis === 'z' ? sack(d, h, s * 1.08, u, yy, t) : sack(s * 1.08, h, d, t, yy, u))
      }
  }
}

// On the pier ledge: a wall along each tower's outer face, in front of the corner turrets (r 3.4 at x ±12,
// so x 15.4), and a U-shaped emplacement out on each cutwater (pier corners at x ±21 and ±28).
export function sandbagWalls(out, { pierTop, pierZ }, lite = LITE) {
  for (const sx of [-1, 1]) {
    sackWall(out, 'z', pierZ - 11, pierZ + 11, sx * 16.5, pierTop, 7, lite)
    for (const sz of [-1, 1]) sackWall(out, 'x', sx > 0 ? 19.5 : -24.5, sx > 0 ? 24.5 : -19.5, pierZ + sz * 3, pierTop, 4, lite)
    sackWall(out, 'z', pierZ - 2.4, pierZ + 2.4, sx * 24.5, pierTop, 4, lite)
  }
}
