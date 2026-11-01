// Architectural detail for the Tower Bridge, in the same NORTH-LOCAL frame as structures.jsx.
// Each builder merges its pieces into one mesh per material and sits inside an existing Part.
import { useMemo } from 'react'
import * as THREE from 'three'
import { beam, box, merge, M } from './geom.js'
import { L } from './structures.jsx'
import { KERB_X, KERB_W, FOOTWAY_H, FOOTWAY_OUT } from './roadway.js'

// Renders { materialKey: [geometries] } as one merged mesh per material.
// materials: optional {key: material} overriding M for some keys (e.g. lantern glass by era)
export function Meshes({ build, deps = [], materials }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => Object.entries(build()).filter(([, gs]) => gs.length).map(([k, gs]) => [k, merge(gs)]), deps)
  return g.map(([k, geo]) => <mesh key={`${k}-${materials?.[k]?.uuid ?? ''}`} geometry={geo} material={materials?.[k] ?? M[k]} castShadow />)
}

const cyl = (rt, rb, h, seg, x, y, z) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z)
const cone = (r, h, seg, x, y, z) => new THREE.ConeGeometry(r, h, seg).rotateY(Math.PI / 4).translate(x, y, z)

// ---- towers: parapet, pinnacles, hood moulds, turret ribs, shields (cladding only) ----
function shieldShape() {
  const s = new THREE.Shape()
  s.moveTo(-0.9, 1.4)
  s.lineTo(0.9, 1.4)
  s.lineTo(0.9, 0)
  s.quadraticCurveTo(0.9, -1, 0, -1.4)
  s.quadraticCurveTo(-0.9, -1, -0.9, 0)
  s.closePath()
  return s
}

export function TowerDetails() {
  return (
    <Meshes
      build={() => {
        const z0 = L.pierZ, hx = L.towerHalfX, hz = L.towerHalfZ, y0 = L.bodyTop + 0.35
        const stone = [], granite = [], glass = [], white = [], gold = []
        const pinnacle = (x, z, big) => {
          const s = big ? 1 : 0.8
          stone.push(box(0.8 * s, 2.2 * s, 0.8 * s, x, y0 + 1.1 * s, z))
          stone.push(cone(0.65 * s, 2.4 * s, 4, x, y0 + 2.2 * s + 1.2 * s, z))
          gold.push(new THREE.SphereGeometry(0.16, 6, 4).translate(x, y0 + 4.7 * s, z))
        }
        // crenellated parapet between the turrets: a low wall with merlons on top
        for (const sz of [-1, 1]) {
          const z = z0 + sz * (hz + 0.25)
          stone.push(box(16.8, 0.65, 0.5, 0, y0 + 0.33, z))
          for (let x = -7.7; x <= 7.7; x += 1.4) stone.push(box(0.8, 0.9, 0.5, x, y0 + 1.1, z))
          for (const x of [-8.4, 0, 8.4]) pinnacle(x, z, x === 0)
        }
        for (const sx of [-1, 1]) {
          const x = sx * (hx + 0.25)
          stone.push(box(0.5, 0.65, 10.8, x, y0 + 0.33, z0))
          for (let dz = -4.9; dz <= 4.9; dz += 1.4) stone.push(box(0.5, 0.9, 0.8, x, y0 + 1.1, z0 + dz))
          for (const dz of [-5.4, 0, 5.4]) pinnacle(x, z0 + dz, dz === 0)
        }
        // pointed hood moulds and lancet heads over every window
        const hood = (p) => {
          const [a, apex, b] = [p(-0.85, 1.55), p(0, 2.55), p(0.85, 1.55)]
          granite.push(beam(a, apex, 0.11, 4), beam(apex, b, 0.11, 4), beam(p(-0.85, 1.0), a, 0.11, 4), beam(p(0.85, 1.0), b, 0.11, 4))
        }
        for (const y of [17.5, 24, 31.5, 37.5]) {
          for (const x of [-6, -2, 2, 6]) for (const sz of [-1, 1]) {
            const z = z0 + sz * (hz + 0.15)
            hood((u, v) => [x + u, y + v, z])
            glass.push(box(0.92, 0.92, 0.3, 0, 0, 0).rotateZ(Math.PI / 4).translate(x, y + 1.7, z0 + sz * (hz + 0.05)))
          }
          for (const dz of [-4, 0, 4]) for (const sx of [-1, 1]) {
            const x = sx * (hx + 0.15)
            hood((u, v) => [x, y + v, z0 + dz + u])
            glass.push(box(0.3, 0.92, 0.92, 0, 0, 0).rotateX(Math.PI / 4).translate(sx * (hx + 0.05), y + 1.7, z0 + dz))
          }
        }
        // buttress ribs on the turret angles, stepping in halfway up
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const cx = sx * 12, cz = z0 + sz * 9
          for (let k = 0; k < 8; k++) {
            const t = (k * Math.PI) / 4, s = Math.sin(t), c = Math.cos(t)
            if (s * sx + c * sz < -0.1) continue // ribs facing into the body are hidden
            stone.push(box(0.75, 20, 0.75, 0, 0, 0).rotateY(t).translate(cx + 3.45 * s, 10, cz + 3.45 * c))
            stone.push(cone(0.55, 1, 4, 0, 0, 0).rotateY(t).translate(cx + 3.45 * s, 20.5, cz + 3.45 * c))
            stone.push(box(0.5, 24, 0.5, 0, 0, 0).rotateY(t).translate(cx + 3.3 * s, 33, cz + 3.3 * c))
          }
        }
        // coat-of-arms shields over the road arch, on both faces the road passes through
        for (const sz of [-1, 1]) {
          const zf = z0 + sz * hz, y = 17.2
          granite.push(box(2.4, 3.4, 0.2, 0, y, zf + sz * 0.1))
          white.push(new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.2, bevelEnabled: false }).translate(0, y, sz > 0 ? zf + 0.2 : zf - 0.4))
          gold.push(box(0.28, 2.4, 0.1, 0, y - 0.1, zf + sz * 0.45), box(1.6, 0.28, 0.1, 0, y + 0.55, zf + sz * 0.45))
        }
        return { stone, granite, glass, white, gold }
      }}
    />
  )
}

// ---- roadway: lamp standards and centre-line markings ----
// Column and lantern frame are painted with the bridge ironwork (`steel`, tinted by year, so brown
// before 1977 and light blue after). Lantern glass by era: warm gas, blacked out, clear electric.
const glass = (props) => Object.assign(new THREE.MeshStandardMaterial(props), { userData: { kind: 'glass' } })
const LANTERN = {
  gas: glass({ color: '#e0b665', roughness: 0.2, metalness: 0.1 }),
  blackout: glass({ color: '#15191f', roughness: 0.6 }),
  electric: glass({ color: '#e9f0f4', roughness: 0.1, metalness: 0.2 }),
}
export const lanternFor = (era) => ({ lantern: era?.blackout ? LANTERN.blackout : era?.gasLamps ? LANTERN.gas : LANTERN.electric })

export function lamp(out, x, y, z, era) {
  if (era?.blackout) out.white.push(box(0.74, 0.3, 0.74, x, y + 0.35, z)) // white band on the base
  out.steel.push(
    box(0.7, 1, 0.7, x, y + 0.5, z),
    cyl(0.12, 0.17, 4.2, 8, x, y + 3.1, z),
    cyl(0.26, 0.26, 0.2, 8, x, y + 2, z),
    cyl(0.3, 0.14, 0.3, 8, x, y + 5.3, z),
    box(0.62, 0.08, 0.62, x, y + 5.5, z),
  )
  out.lantern.push(box(0.5, 0.75, 0.5, x, y + 5.9, z))
  out.gold.push(cone(0.48, 0.5, 4, x, y + 6.53, z), new THREE.ConeGeometry(0.07, 0.45, 5).translate(x, y + 7, z))
}

const dashes = (out, z0, z1) => {
  for (let z = z0; z + 3 <= z1; z += 6) out.white.push(box(0.18, 0.03, 3, 0, 0.02, z + 1.5))
  for (const x of [-KERB_X + 0.5, KERB_X - 0.5]) out.white.push(box(0.15, 0.03, z1 - z0, x, 0.02, (z0 + z1) / 2))
}

// granite kerb and paved footway on both sides, flat, from z0 to z1 (z0 < z1)
export const footways = (out, z0, z1, era) => {
  const len = z1 - z0, zc = (z0 + z1) / 2, w = FOOTWAY_OUT - KERB_X - KERB_W
  for (const sx of [-1, 1]) {
    out.granite.push(box(KERB_W, FOOTWAY_H, len, sx * (KERB_X + KERB_W / 2), FOOTWAY_H / 2, zc))
    out.stone.push(box(w, FOOTWAY_H, len, sx * (KERB_X + KERB_W + w / 2), FOOTWAY_H / 2, zc))
    // blackout: kerb painted in white bands, 1 m on, 1 m off
    if (era?.blackout) for (let z = z0; z + 1 <= z1; z += 2) out.white.push(box(KERB_W + 0.02, FOOTWAY_H + 0.01, 1, sx * (KERB_X + KERB_W / 2), FOOTWAY_H / 2, z + 0.5))
  }
}

export const kit = () => ({ iron: [], glass: [], gold: [], white: [], stone: [], granite: [], steel: [], lantern: [] })

// Cast-iron parapet made to look like a classical balustrade (sremg struct 88; Historic England
// 1065833), standing on the side-span girders: plinth rail, turned balusters and a moulded
// handrail, broken by the lamp bases. Painted with the ironwork, so it takes the year's colour.
// Baluster profile and spacing are inferred from the "classical balustrade" description, not a drawing.
const BALUSTER = new THREE.LatheGeometry(
  [[0.07, 0], [0.045, 0.1], [0.085, 0.36], [0.04, 0.6], [0.05, 0.7]].map(([r, y]) => new THREE.Vector2(r, y)),
  6,
)
const BAL_X = 9.4, BAL_Y = 0.3 // centre line and foot: on top of the girder
function balustrade(out, z0, z1, pedestals) {
  const len = z1 - z0, zc = (z0 + z1) / 2
  for (const sx of [-1, 1]) {
    const x = sx * BAL_X
    out.steel.push(
      box(0.34, 0.16, len, x, BAL_Y + 0.08, zc), // plinth rail
      box(0.22, 0.06, len, x, BAL_Y + 0.19, zc),
      box(0.26, 0.08, len, x, BAL_Y + 0.93, zc), // handrail with a moulded cap
      box(0.34, 0.06, len, x, BAL_Y + 1.0, zc),
    )
    for (let z = z0 + 0.2; z < z1 - 0.1; z += 0.4) {
      if (pedestals.some((p) => Math.abs(p - z) < 0.45)) continue // the lamp's own base is the pedestal
      out.steel.push(BALUSTER.clone().translate(x, BAL_Y + 0.22, z))
    }
  }
}

export function ApproachDetails({ era }) {
  return (
    <Meshes
      deps={[era?.blackout]}
      materials={lanternFor(era)}
      build={() => {
        const o = kit()
        const lamps = []
        for (let z = L.spanEnd + 6; z < L.pierZ - L.towerHalfZ - 3; z += 12) lamps.push(z)
        balustrade(o, L.spanEnd, L.pierZ - L.towerHalfZ, lamps)
        for (const z of lamps) for (const x of [-BAL_X, BAL_X]) lamp(o, x, BAL_Y, z, era) // its 1 m base stands in the balustrade as a pedestal
        dashes(o, L.spanEnd + 1, L.pierZ - L.towerHalfZ - 1)
        footways(o, L.spanEnd, L.pierZ - L.towerHalfZ, era)
        return o
      }}
    />
  )
}

// Fixed deck through the tower arch.
export function DeckMarkings({ era }) {
  return <Meshes deps={[era?.blackout]} build={() => { const o = kit(); dashes(o, L.pierZ - 9.5, L.pierZ + 9.5); footways(o, L.pierZ - L.towerHalfZ, L.pierZ + L.towerHalfZ, era); return o }} />
}

// Built in north-local coordinates, then moved into the leaf frame so it rides on <PivotFrame>.
export function BasculeDetails({ era }) {
  return (
    <Meshes
      deps={[era?.blackout]}
      materials={lanternFor(era)}
      build={() => {
        const o = kit()
        for (const z of [-31, -21, -11]) for (const x of [-9, 9]) lamp(o, x, 0.05, z, era)
        dashes(o, L.pivotZ + 0.5, -0.5)
        footways(o, L.pierZ + L.towerHalfZ, 0, era)
        for (const gs of Object.values(o)) gs.forEach((g) => g.translate(0, -L.pivotY, -L.pivotZ))
        return o
      }}
    />
  )
}

// ---- high walkways: pointed portal frames at the tower faces, finials on the roof ----
export function WalkwayDetails({ x }) {
  return (
    <Meshes
      deps={[x]}
      build={() => {
        const steel = [], gold = [], w = 1.6 + 0.35, y0 = L.walkY, y1 = L.walkY + L.walkH
        const ze = -(L.pierZ + L.towerHalfZ) - 0.3
        for (const z of [-ze, ze]) {
          for (const sx of [-w, w]) steel.push(box(0.5, L.walkH + 1.2, 0.5, x + sx, y0 + (L.walkH + 1.2) / 2 - 0.3, z))
          steel.push(box(2 * w + 0.5, 0.4, 0.5, x, y1 + 0.7, z))
          steel.push(beam([x - w, y1 + 0.85, z], [x, y1 + 2.1, z], 0.2, 4), beam([x + w, y1 + 0.85, z], [x, y1 + 2.1, z], 0.2, 4))
          steel.push(beam([x, y1 + 0.9, z], [x, y1 + 2.1, z], 0.12, 4))
          gold.push(new THREE.ConeGeometry(0.16, 0.9, 6).translate(x, y1 + 2.6, z))
        }
        for (let z = ze + 5; z <= -ze - 5; z += 7.5) {
          steel.push(box(0.35, 0.3, 0.35, x, y1 + 0.5, z))
          gold.push(new THREE.ConeGeometry(0.12, 0.8, 6).translate(x, y1 + 1.05, z))
        }
        return { steel, gold }
      }}
    />
  )
}

// ---- suspension chains: pin joints at the lattice nodes, anchor plates at both ends ----
export function SuspensionDetails() {
  return (
    <Meshes
      build={() => {
        // same curve as Suspension() in structures.jsx; keep the two in step
        const curve = new THREE.QuadraticBezierCurve(
          new THREE.Vector2(L.pierZ - L.towerHalfZ, L.walkY - 1),
          new THREE.Vector2((L.pierZ - L.towerHalfZ + L.spanEnd) / 2, -12),
          new THREE.Vector2(L.spanEnd, 15),
        )
        const pts = curve.getPoints(28), dt = 1.8, iron = []
        for (const x of [-L.walkX, L.walkX]) {
          for (const p of pts) for (const y of [p.y, p.y + dt]) iron.push(cyl(0.32, 0.32, 0.95, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(x, y, p.x))
          for (const [p, sz] of [[pts[0], 1], [pts[28], -1]]) {
            const z = p.x - sz * 0.25, yc = p.y + dt / 2
            iron.push(box(2.6, 3.6, 0.3, x, yc, z))
            for (const bx of [-1, 1]) for (const by of [-1, 1]) iron.push(cyl(0.16, 0.16, 0.3, 6, 0, 0, 0).rotateX(Math.PI / 2).translate(x + bx, yc + by * 1.4, z - sz * 0.25))
          }
        }
        return { iron }
      }}
    />
  )
}
