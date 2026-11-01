// Street furniture on the shore abutment and its ramp: kerbs and footways (then lamps and
// railings). NORTH-LOCAL frame, mounted inside the abutment Part so it explodes with the stone.
// Research and sources: ~/hub/projects/strata/bridge-approaches-research.md
import { box } from './geom.js'
import { L, STREET_DROP, RAMP } from './structures.jsx'
import { Meshes, kit, footways } from './details.jsx'
import { KERB_X, KERB_W, FOOTWAY_H } from './roadway.js'

const RAMP_PARAPET = 9 // inner face of the ramp's stone parapet (structures.jsx ROAD_HALF)

// A slab whose top sits `h` above a road falling `drop` from z0 down to z1 (z1 < z0).
const onRamp = (w, h, x, z0, z1, drop) => {
  const len = z0 - z1, a = Math.atan2(drop, len), t = h + 0.3 // reaches into the road so no gap shows
  return box(w, t, Math.hypot(len, drop))
    .translate(0, h - t / 2, 0)
    .rotateX(-a)
    .translate(x, -drop / 2, (z0 + z1) / 2)
}

export function RampDetails({ side = 'north' }) {
  return (
    <Meshes
      deps={[side]}
      build={() => {
        const o = kit(), drop = STREET_DROP[side]
        const z0 = L.spanEnd - 10, z1 = z0 - RAMP, w = RAMP_PARAPET - KERB_X - KERB_W
        footways(o, z0, L.spanEnd) // through the gap between the abutment towers
        for (const sx of [-1, 1]) {
          o.granite.push(onRamp(KERB_W, FOOTWAY_H, sx * (KERB_X + KERB_W / 2), z0, z1, drop))
          o.stone.push(onRamp(w, FOOTWAY_H, sx * (KERB_X + KERB_W + w / 2), z0, z1, drop))
        }
        return o
      }}
    />
  )
}

