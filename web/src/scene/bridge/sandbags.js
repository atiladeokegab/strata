// 1939-45 sandbag walls on the pier ledge along each tower's outer face (inferred: ARP practice; no
// Tower Bridge photo of them yet). In front of the corner turrets (r 3.4 at x ±12, so x 15.4) and on
// the pier (|x| < 21): 2 m of staggered bags so they read from the river at ~150 m. Plain JS so
// check.mjs can build it. LITE: one slab per course.
import { box } from './geom.js'
import { LITE } from '../look/tier.js'

export function sandbagWalls(out, { pierTop, pierZ }, lite = LITE) {
  const z0 = pierZ - 11, z1 = pierZ + 11, len = z1 - z0, n = Math.round(len / 0.7)
  for (const sx of [-1, 1])
    for (let c = 0; c < 8; c++) {
      const x = sx * (16.4 - c * 0.04), y = pierTop + 0.125 + c * 0.25, d = 1.4 - c * 0.08 // battered: each course a little narrower
      if (lite) out.sand.push(box(d, 0.24, len, x, y, (z0 + z1) / 2))
      else for (let i = 0; i < n - (c % 2); i++) out.sand.push(box(d, 0.24, len / n - 0.05, x, y, z0 + ((i + 0.5 + (c % 2) / 2) * len) / n))
    }
}
