// Architectural detail for the Tower Bridge, in the same NORTH-LOCAL frame as structures.jsx.
// Each builder merges its pieces into one mesh per material and sits inside an existing Part.
import { useMemo } from 'react'
import * as THREE from 'three'
import { beam, box, merge, M } from './geom.js'
import { L } from './structures.jsx'
import { KERB_X, KERB_W, FOOTWAY_H, FOOTWAY_OUT } from './roadway.js'
import { balustrade, BAL_X, BAL_Y } from './balustrade.js'
import { LITE } from '../look/tier.js'
import { walkwayKnees, walkwayLamps } from './walkway.js'
import { POST_X, POST_Z } from './trafficSim.js'

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
      build={() => towerDetailsKit()}
    />
  )
}

export function towerDetailsKit() {
  const z0 = L.pierZ, hx = L.towerHalfX, hz = L.towerHalfZ, y0 = L.bodyTop + 0.35
  const stone = [], granite = [], glass = [], white = [], gold = []
  // slender crocketed pinnacles: shaft, gabletted cap, tall needle with crockets up its angles
  const pinnacle = (x, z, big) => {
    const s = big ? 1 : 0.8, h = 2.6 * s, n = 4.2 * s
    stone.push(box(0.7 * s, h, 0.7 * s, x, y0 + h / 2, z))
    granite.push(box(0.9 * s, 0.2, 0.9 * s, x, y0 + h, z))
    stone.push(cone(0.5 * s, n, 4, x, y0 + h + n / 2, z))
    if (!LITE) for (const f of [0.25, 0.5, 0.75]) {
      const r = 0.5 * s * (1 - f) * Math.SQRT1_2 + 0.08 // a cone corner sits on the axis-aligned diagonal after its π/4 turn
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) stone.push(box(0.16, 0.16, 0.16, x + dx * r, y0 + h + n * f, z + dz * r))
    }
    gold.push(new THREE.SphereGeometry(0.14, 6, 4).translate(x, y0 + h + n + 0.1, z))
  }
  // string courses between the window tiers, and a corbel table under the parapet
  for (const y of [20.8, 34.6]) granite.push(box(2 * hx + 0.5, 0.3, 2 * hz + 0.5, 0, y, z0))
  if (!LITE) {
    for (let x = -9.8; x <= 9.8; x += 1.4) for (const sz of [-1, 1]) granite.push(box(0.3, 0.45, 0.4, x, L.bodyTop - 0.6, z0 + sz * (hz + 0.35)))
    for (let dz = -5.6; dz <= 5.6; dz += 1.4) for (const sx of [-1, 1]) granite.push(box(0.4, 0.45, 0.3, sx * (hx + 0.35), L.bodyTop - 0.6, z0 + dz))
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
      // tracery: mullion, transom and a projecting sill
      granite.push(box(0.14, 3.4, 0.12, x, y, z0 + sz * (hz + 0.26)), box(1.3, 0.12, 0.12, x, y + 0.5, z0 + sz * (hz + 0.26)), box(1.7, 0.18, 0.4, x, y - 1.8, z0 + sz * (hz + 0.2)))
    }
    for (const dz of [-4, 0, 4]) for (const sx of [-1, 1]) {
      const x = sx * (hx + 0.15)
      hood((u, v) => [x, y + v, z0 + dz + u])
      glass.push(box(0.3, 0.92, 0.92, 0, 0, 0).rotateX(Math.PI / 4).translate(sx * (hx + 0.05), y + 1.7, z0 + dz))
      granite.push(box(0.12, 3.4, 0.14, sx * (hx + 0.26), y, z0 + dz), box(0.12, 0.12, 1.3, sx * (hx + 0.26), y + 0.5, z0 + dz), box(0.4, 0.18, 1.7, sx * (hx + 0.2), y - 1.8, z0 + dz))
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
      stone.push(box(0.5, 23, 0.5, 0, 0, 0).rotateY(t).translate(cx + 3.3 * s, 32.5, cz + 3.3 * c)) // stops under the turret ring
    }
  }
  // coat-of-arms shields over the road arch, on both faces the road passes through
  for (const sz of [-1, 1]) {
    const zf = z0 + sz * hz, y = 17.2
    granite.push(box(2.4, 3.4, 0.2, 0, y, zf + sz * 0.1))
    white.push(new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.2, bevelEnabled: false }).translate(0, y, sz > 0 ? zf + 0.2 : zf - 0.4))
    gold.push(box(0.28, 2.4, 0.1, 0, y - 0.1, zf + sz * 0.45), box(1.6, 0.28, 0.1, 0, y + 0.55, zf + sz * 0.45))
  }
  // gold leaf: shields on the turrets' river faces, cresting up the roof hips, gilt dormer finials
  const crest = new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.08, bevelEnabled: false }).scale(0.6, 0.6, 1)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const t = sx * (sz > 0 ? Math.PI / 8 : (7 * Math.PI) / 8) // the octagon face nearest the river
    gold.push(crest.clone().rotateY(t).translate(sx * 12 + 3.03 * Math.sin(t), 30, z0 + sz * 9 + 3.03 * Math.cos(t)))
    if (!LITE) for (let f = 0.15; f < 0.9; f += 0.1) gold.push(cone(0.1, 0.45, 4, sx * hx * (1 - f), L.bodyTop + 7 * f + 0.2, z0 + sz * hz * (1 - f)))
  }
  for (const sz of [-1, 1]) for (const x of [-5, 5]) gold.push(new THREE.SphereGeometry(0.13, 6, 4).translate(x, L.bodyTop + 6.5, z0 + sz * (hz - 2.2)))
  return { stone, granite, glass, white, gold }
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
// Blackout white paint: brighter than lit white (colour > 1) and untextured (no kind), so the bands still read at
// 640x360. Not emissive: Part owns emissive for the selection glow.
const BAND = new THREE.MeshStandardMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), roughness: 1, metalness: 0 })
export const lanternFor = (era) => ({ lantern: era?.blackout ? LANTERN.blackout : era?.gasLamps ? LANTERN.gas : LANTERN.electric, ...(era?.blackout && { white: BAND }) })

export function lamp(out, x, y, z, era) {
  // blackout: base painted white, then three 0.6 m white bands up the column, wide enough to read from afar
  if (era?.blackout) out.white.push(box(0.74, 0.6, 0.74, x, y + 0.5, z), ...[1.6, 2.8, 4.0].map((h) => cyl(0.2, 0.21, 0.6, 8, x, y + h, z)))
  out.steel.push(
    box(0.7, 1, 0.7, x, y + 0.5, z),
    cyl(0.12, 0.17, 4.2, 8, x, y + 3.1, z),
    cyl(0.26, 0.26, 0.2, 8, x, y + 2, z),
    cyl(0.3, 0.14, 0.3, 8, x, y + 5.3, z),
    box(0.62, 0.08, 0.62, x, y + 5.5, z),
  )
  lampHead(out, x, y + 5.54, z, era?.gasLamps)
}

// Lantern heads by era. Shapes are inferred: no photo or drawing of the Tower Bridge lanterns found yet.
// Gas (to 1949): a square lantern flaring to the top, corner glazing bars, a ladder bar for the lamplighter,
// and a vented crown. Electric: a straight hexagonal lantern under a plain crown, no ladder bar or vent.
// LITE keeps the glass and the crown only. All existing kit keys: +0 draw calls.
function lampHead(out, x, y, z, gas) {
  const h = 0.75, top = y + h
  if (gas) {
    out.lantern.push(new THREE.CylinderGeometry(0.36, 0.24, h, 4).rotateY(Math.PI / 4).translate(x, y + h / 2, z))
    out.gold.push(cone(0.5, 0.42, 4, x, top + 0.21, z), cyl(0.06, 0.08, 0.22, 6, x, top + 0.5, z), new THREE.ConeGeometry(0.1, 0.12, 6).translate(x, top + 0.66, z)) // crown, vent, cowl
    if (LITE) return
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.steel.push(beam([x + cx * 0.17, y, z + cz * 0.17], [x + cx * 0.255, top, z + cz * 0.255], 0.018, 4))
    out.steel.push(box(0.9, 0.05, 0.05, x, y - 0.55, z)) // ladder bar across the column
  } else {
    out.lantern.push(new THREE.CylinderGeometry(0.27, 0.24, h, 6).translate(x, y + h / 2, z))
    out.gold.push(new THREE.ConeGeometry(0.36, 0.34, 6).translate(x, top + 0.17, z), new THREE.ConeGeometry(0.06, 0.3, 5).translate(x, top + 0.48, z))
    if (LITE) return
    out.steel.push(cyl(0.29, 0.29, 0.05, 6, x, top, z), cyl(0.26, 0.26, 0.05, 6, x, y, z)) // top and bottom rings
  }
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

// LITE merges: concatenate kits ({ key: geometries[] }) so <Meshes> draws one mesh per material across them
export const join = (...ks) => ks.reduce((o, k) => (Object.entries(k).forEach(([n, gs]) => (o[n] ??= []).push(...gs)), o), {})
export const kit = () => ({ iron: [], glass: [], gold: [], white: [], stone: [], granite: [], steel: [], lantern: [], sand: [] })

// Wartime sandbags (inferred: general ARP practice, no Tower Bridge photo of them yet). One merged
// mesh per tower Part, so 1939-44 costs two draw calls; skipped on the lite tier.
const SAND = new THREE.MeshStandardMaterial({ color: '#9b8b67', roughness: 0.95 })
function sandbags(out, x, z, w, d, courses) {
  const along = w >= d, len = along ? w : d, n = Math.max(1, Math.round(len / 0.6))
  for (let c = 0; c < courses; c++) {
    const k = n - (c % 2), l = len - (c % 2) * (len / n), cross = (along ? d : w) - c * 0.06 // stagger every other course
    for (let i = 0; i < k; i++) {
      const t = -l / 2 + ((i + 0.5) * l) / k, size = l / k - 0.04
      out.sand.push(along ? box(size, 0.2, cross, x + t, 0.1 + c * 0.21, z) : box(cross, 0.2, size, x, 0.1 + c * 0.21, z + t))
    }
  }
}

export function ApproachDetails({ era }) {
  return (
    <Meshes
      deps={[era?.blackout, era?.woodBlocks, era?.gasLamps]}
      materials={lanternFor(era)}
      build={() => {
        const o = kit()
        const lamps = []
        for (let z = L.spanEnd + 6; z < L.pierZ - L.towerHalfZ - 3; z += 12) lamps.push(z)
        balustrade(o, L.spanEnd, L.pierZ - L.towerHalfZ, lamps, LITE)
        for (const z of lamps) for (const x of [-BAL_X, BAL_X]) lamp(o, x, BAL_Y, z, era) // its 1 m base stands in the balustrade as a pedestal
        if (!era?.woodBlocks) dashes(o, L.spanEnd + 1, L.pierZ - L.towerHalfZ - 1) // no painted lines on the wood blocks
        footways(o, L.spanEnd, L.pierZ - L.towerHalfZ, era)
        return o
      }}
    />
  )
}

// Fixed deck through the tower arch.
export function DeckMarkings({ era }) {
  return (
    <Meshes
      deps={[era?.blackout, era?.woodBlocks, era?.gasLamps]}
      materials={{ sand: SAND, ...lanternFor(era) }}
      build={() => deckMarkingsKit(era)}
    />
  )
}

export function deckMarkingsKit(era) {
  const o = kit()
  if (!era?.woodBlocks) dashes(o, L.pierZ - 9.5, L.pierZ + 9.5)
  footways(o, L.pierZ - L.towerHalfZ, L.pierZ + L.towerHalfZ, era)
  if (era?.blackout && !LITE) {
    for (const sx of [-1, 1]) sandbags(o, sx * 8.65, L.pierZ - L.towerHalfZ + 0.7, 0.9, 1.2, 5) // against the tower's shore-side jambs
    sandbags(o, POST_X - 0.15, POST_Z, 0.9, 1.0, 3) // round the foot of the gate post
  }
  return o
}

// Built in north-local coordinates, then moved into the leaf frame so it rides on <PivotFrame>.
export function BasculeDetails({ era }) {
  return (
    <Meshes
      deps={[era?.blackout, era?.woodBlocks, era?.gasLamps]}
      materials={lanternFor(era)}
      build={() => {
        const o = kit()
        for (const z of [-31, -21, -11]) for (const x of [-9, 9]) lamp(o, x, 0.05, z, era)
        if (!era?.woodBlocks) dashes(o, L.pivotZ + 0.5, -0.5)
        footways(o, L.pierZ + L.towerHalfZ, 0, era)
        for (const gs of Object.values(o)) gs.forEach((g) => g.translate(0, -L.pivotY, -L.pivotZ))
        return o
      }}
    />
  )
}

// ---- high walkways: pointed portal frames at the tower faces, finials on the roof ----
export function WalkwayDetails({ x, era }) {
  const gas = !!era?.gasLamps
  return (
    <Meshes
      deps={[x, gas]}
      materials={lanternFor(era)}
      build={() => walkwayDetailsKit(x, gas)}
    />
  )
}

export function walkwayDetailsKit(x, gas) {
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
  steel.push(...walkwayKnees(x, -(L.pierZ + L.towerHalfZ), y0))
  if (LITE) return { steel, gold } // phones: no interior lamps
  const lamps = walkwayLamps(x, -(L.pierZ + L.towerHalfZ), y1, gas)
  steel.push(...lamps.steel)
  return { steel, gold, lantern: lamps.lantern }
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
