// Street furniture on the shore abutment and its ramp: kerbs, footways, granite coping and lamp
// standards on the parapets, and the north approach's chimney disguised as a lamp post.
// NORTH-LOCAL frame, mounted inside the abutment Part so it explodes with the stone.
// Research and sources: ~/hub/projects/strata/bridge-approaches-research.md
import * as THREE from 'three'
import { box } from './geom.js'
import { L, STREET_DROP, RAMP } from './structures.jsx'
import { Meshes, kit, footways, lamp, lanternFor } from './details.jsx'
import { KERB_X, KERB_W, FOOTWAY_H } from './roadway.js'

const RAMP_PARAPET = 9 // inner face of the ramp's stone parapet (structures.jsx ROAD_HALF)
const WALL_TOP = 1.1 // parapet top above the ramp road
const LAMP_EVERY = 12 // m, as on the approach span

// A slab whose top sits `h` above a road whose surface is y0 at z0 and falls `drop` to z1 (z1 < z0).
const onRamp = (w, h, x, z0, z1, drop, y0 = 0) => {
  const len = z0 - z1, a = Math.atan2(drop, len), t = h + 0.3 // reaches into the road so no gap shows
  return box(w, t, Math.hypot(len, drop))
    .translate(0, h - t / 2, 0)
    .rotateX(-a)
    .translate(x, y0 - drop / 2, (z0 + z1) / 2)
}

export function RampDetails({ side = 'north', era }) {
  return (
    <Meshes
      deps={[side, era?.blackout]}
      materials={lanternFor(era)}
      build={() => {
        const o = kit(), drop = STREET_DROP[side]
        const z0 = L.spanEnd - 10, z1 = z0 - RAMP, w = RAMP_PARAPET - KERB_X - KERB_W
        const roadY = (z) => (-drop * (z0 - z)) / RAMP
        footways(o, z0, L.spanEnd, era) // through the gap between the abutment towers
        for (const sx of [-1, 1]) {
          const kx = sx * (KERB_X + KERB_W / 2)
          o.granite.push(onRamp(KERB_W, FOOTWAY_H, kx, z0, z1, drop))
          o.stone.push(onRamp(w, FOOTWAY_H, sx * (KERB_X + KERB_W + w / 2), z0, z1, drop))
          // granite coping along the parapet top, a little proud of the wall each side
          o.granite.push(onRamp(0.8, 0.12, sx * (RAMP_PARAPET + 0.3), z0, z1, drop, WALL_TOP))
          for (let z = z0 - 6; z > z1 + 3; z -= LAMP_EVERY) lamp(o, sx * (RAMP_PARAPET + 0.3), roadY(z) + WALL_TOP + 0.12, z, era)
          if (era?.blackout)
            for (let z = z0; z - 1 >= z1; z -= 2) o.white.push(onRamp(KERB_W + 0.02, FOOTWAY_H + 0.01, kx, z, z - 1, drop / RAMP, roadY(z)))
        }
        // North only: the cast-iron chimney (Durham Bros., 1894) for the guardroom fire below the road,
        // made to look like a lamp post. Which side and how far along is inferred.
        if (side === 'north') {
          const x = RAMP_PARAPET + 0.3, z = z0 - 12, y = roadY(z) + WALL_TOP + 0.12
          o.steel.push(
            box(0.7, 1, 0.7, x, y + 0.5, z),
            new THREE.CylinderGeometry(0.14, 0.18, 4.4, 8).translate(x, y + 3.2, z),
            new THREE.CylinderGeometry(0.3, 0.16, 0.5, 8).translate(x, y + 5.6, z), // cowl where a lantern would be
            new THREE.CylinderGeometry(0.34, 0.34, 0.08, 8).translate(x, y + 6.05, z),
          )
        }
        return o
      }}
    />
  )
}
