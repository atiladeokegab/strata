// Bascule leaf structure seen from the river and the side when raised: cross-girders, lateral
// bracing, ribbed white soffit, riveted stiffeners, panelled blue fascias, nose locks and teeth,
// tail locks and buffers. LEAF-LOCAL frame (mount inside <S.PivotFrame>): origin on the pivot
// axis, leaf runs +z to the tip at z=LEN, deck top at y=1.5. One merged mesh per material.
// status: inferred layout; spacing follows the main girders in structures.jsx, not drawings.
import { useMemo } from 'react'
import * as THREE from 'three'
import { beam, box, merge } from './geom.js'
import { pbr } from '../look/textures.js'
import { L } from './structures.jsx'

const LEN = -L.pivotZ
const TOP = -L.pivotY // deck top
const PLATE = TOP - 0.47 // underside of the road plate
const GIRDERS = [-7.5, -3, 3, 7.5]
// Main girder bottom, tapering 4.4 m deep at the pivot to 1 m at the tip (structures.jsx shape).
const bottom = (z) => TOP - 0.06 - 4.4 + (3.4 * Math.max(0, z)) / LEN

const mat = (kind, variant, repeat, props) =>
  Object.assign(new THREE.MeshStandardMaterial({ ...pbr(variant, repeat), ...props }), { userData: { kind } })
let MATS
// steel:white map tinted by the 'steel' kind, so Part's year colour shows true rather than doubly blue.
const mats = () =>
  (MATS ??= {
    soffit: mat('trim', 'steel:white', 6),
    fascia: mat('steel', 'steel:white', 4),
    iron: mat('iron', 'iron:cast', 2),
  })

function build() {
  const soffit = [], fascia = [], iron = []

  // ribbed soffit: thin plate under the road with longitudinal stringers between the girders
  soffit.push(box(17.6, 0.04, LEN, 0, PLATE, LEN / 2))
  for (let x = -8.25; x <= 8.25; x += 1.5) {
    if (GIRDERS.some((g) => Math.abs(g - x) < 0.6)) continue
    soffit.push(box(0.12, 0.3, LEN - 0.4, x, PLATE - 0.15, LEN / 2))
  }

  // cross-girders every 3 m, tied to the edge girders; X bracing in the bays below
  const bays = []
  for (let z = 1.5; z < LEN - 0.5; z += 3) {
    const d = Math.min(1.4, (TOP - bottom(z)) * 0.6)
    soffit.push(box(15, d, 0.3, 0, PLATE - d / 2, z), box(0.12, d + 0.1, 0.5, 0, PLATE - d / 2 - 0.05, z)) // web + splice
    soffit.push(box(15, 0.06, 0.6, 0, PLATE - d, z)) // bottom flange
    for (const s of [-1, 1]) soffit.push(box(1.1, 0.8, 0.25, s * 8.35, PLATE - 0.4, z))
    bays.push([z, PLATE - d + 0.05])
  }
  for (let i = 0; i + 1 < bays.length; i++) {
    const [za, ya] = bays[i], [zb, yb] = bays[i + 1]
    for (const [x0, x1] of [[-7.15, -3.35], [-2.65, 2.65], [3.35, 7.15]]) {
      soffit.push(beam([x0, ya, za], [x1, yb, zb], 0.07, 4), beam([x1, ya, za], [x0, yb, zb], 0.07, 4))
    }
  }

  // stiffeners and rivet rows on the outer faces of the outer main girders
  for (const s of [-1, 1]) {
    const fx = s * 7.87
    for (let z = 0.75; z < LEN; z += 1.5) {
      const h = TOP - 0.06 - bottom(z)
      fascia.push(box(0.05, h, 0.22, fx, TOP - 0.06 - h / 2, z))
    }
    for (let z = 0.3; z < LEN; z += 0.5) {
      for (const y of [TOP - 0.25, bottom(z) + 0.18]) fascia.push(box(0.05, 0.07, 0.07, fx + s * 0.03, y, z))
    }
  }

  // decorative fascia on the outer edges: top and bottom mouldings, panel ribs, rivet rows
  for (const s of [-1, 1]) {
    const fx = s * 9.2
    fascia.push(box(0.12, 0.16, LEN, fx + s * 0.03, TOP - 0.1, LEN / 2), box(0.12, 0.14, LEN, fx + s * 0.03, TOP - 1.3, LEN / 2))
    fascia.push(box(0.06, 0.06, LEN, fx + s * 0.02, TOP - 0.7, LEN / 2))
    for (let z = 0.2; z <= LEN; z += 1.75) fascia.push(box(0.14, 1.15, 0.14, fx + s * 0.04, TOP - 0.7, z))
    for (let z = 0.6; z < LEN; z += 0.45) fascia.push(box(0.04, 0.06, 0.06, fx + s * 0.08, TOP - 0.3, z))
  }

  // nose: lock housings and bolts under the tip, interlocking teeth on the meeting edge.
  // Teeth at -8.5 + 2k: the opposite leaf (turned 180 deg) puts its own in the gaps.
  for (const x of [-5.25, 0, 5.25]) {
    iron.push(box(1.6, 0.7, 1.6, x, PLATE - 0.35, LEN - 0.9))
    iron.push(beam([x, PLATE - 0.35, LEN - 0.1], [x, PLATE - 0.35, LEN + 0.35], 0.16, 8))
    iron.push(box(1.8, 0.12, 1.8, x, PLATE - 0.75, LEN - 0.9))
  }
  for (let x = -8.5; x <= 8.5; x += 2) iron.push(box(0.9, 0.35, 0.3, x, PLATE - 0.2, LEN + 0.1))
  iron.push(box(18, 0.2, 0.15, 0, PLATE - 0.45, LEN - 0.08))

  // tail: lock bars and buffers at the end of the tail, under the counterweight arm
  const tz = -14
  for (const x of GIRDERS) {
    iron.push(box(0.5, 0.5, 1.6, x, bottom(0) + 0.6, tz - 0.4))
    iron.push(box(1.2, 1.2, 0.3, x, bottom(0) + 0.6, tz - 1.2))
  }
  for (const x of [-5.25, 0, 5.25]) {
    iron.push(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10).rotateX(Math.PI / 2).translate(x, bottom(0) + 0.9, tz - 0.45))
    iron.push(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12).rotateX(Math.PI / 2).translate(x, bottom(0) + 0.9, tz - 0.95))
  }
  iron.push(box(17, 0.3, 0.3, 0, bottom(0) + 0.6, tz - 0.15))

  return { soffit: merge(soffit), fascia: merge(fascia), iron: merge(iron) }
}

export function BasculeLeafDetail() {
  const g = useMemo(build, [])
  const m = mats()
  return Object.entries(g).map(([k, geo]) => <mesh key={k} geometry={geo} material={m[k]} castShadow receiveShadow />)
}
