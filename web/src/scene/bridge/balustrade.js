// Cast-iron parapet made to look like a classical balustrade (sremg struct 88; Historic England
// 1065833), standing on the side-span girders: plinth rail, turned balusters and a moulded
// handrail, broken by the lamp bases. Painted with the ironwork (`steel`), so it takes the year's colour.
// Baluster profile and spacing are inferred from the "classical balustrade" description, not a drawing.
// Plain .js so check.mjs can measure it.
import * as THREE from 'three'
import { box } from './geom.js'

const BALUSTER = new THREE.LatheGeometry(
  [[0.07, 0], [0.045, 0.1], [0.085, 0.36], [0.04, 0.6], [0.05, 0.7]].map(([r, y]) => new THREE.Vector2(r, y)),
  6,
)
export const BAL_X = 9.4, BAL_Y = 0.3 // centre line and foot: on top of the girder

// lite (phones): plinth, handrail and a square post every 4 m instead of ~400 turned balusters per side
export function balustrade(out, z0, z1, pedestals, lite = false) {
  const len = z1 - z0, zc = (z0 + z1) / 2
  const step = lite ? 4 : 0.4
  for (const sx of [-1, 1]) {
    const x = sx * BAL_X
    out.steel.push(box(0.34, 0.16, len, x, BAL_Y + 0.08, zc), box(0.34, 0.06, len, x, BAL_Y + 1.0, zc)) // plinth rail, handrail cap
    if (!lite) out.steel.push(box(0.22, 0.06, len, x, BAL_Y + 0.19, zc), box(0.26, 0.08, len, x, BAL_Y + 0.93, zc)) // mouldings
    for (let z = z0 + step / 2; z < z1 - 0.1; z += step) {
      if (pedestals.some((p) => Math.abs(p - z) < 0.45)) continue // the lamp's own base is the pedestal
      out.steel.push(lite ? box(0.1, 0.8, 0.1, x, BAL_Y + 0.565, z) : BALUSTER.clone().translate(x, BAL_Y + 0.22, z))
    }
  }
}
