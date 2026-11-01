// High walkway girders, kept out of JSX so check.mjs can measure them.
import * as THREE from 'three'
import { beam, box, merge } from './geom.js'

// Each walkway is a pair of riveted lattice girders: T-section booms, paired-angle posts at the panel points,
// and a close multiple lattice of flat bars at 45° (riveted where they cross, so the two directions sit
// either side of the girder plane). Cross girders and diagonal bracing tie the pair in the floor and roof planes.
// Flat bar in the girder plane (x fixed): `wd` wide in the plane, `t` thick across it.
const bar = (x, [ya, za], [yb, zb], wd, t = 0.035) =>
  box(t, wd, Math.hypot(yb - ya, zb - za)).rotateX(-Math.atan2(yb - ya, zb - za)).translate(x, (ya + yb) / 2, (za + zb) / 2)
export const WALK = { w: 1.6, panels: 20, pitch: 0.9, boom: 0.3 } // half width, panels per span, lattice bar spacing, boom depth

// x: walkway centre line; ze: half span (tower face to tower face); y0, y1: floor and roof booms.
// lite (phones): half the lattice bars, at twice the pitch.
export function walkwayTruss(x, ze, y0, y1, lite = false) {
  const { w, panels: n, boom } = WALK, pitch = WALK.pitch * (lite ? 2 : 1), len = 2 * ze
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

// Where a walkway meets a tower: under each girder end a pierced knee bracket (a plate in the girder plane,
// its free edge a curved flange) carries the bottom boom down onto a bearing plate on the tower face.
// inner: the inboard girders sit over the raised leaves' edge girders, so their knees stay shallow (>= 1 m clear)
export const KNEE = { reach: 3.2, drop: 2.4, inner: 0.5, t: 0.05 }
function kneeShape(H) {
  const { reach: D } = KNEE, s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(D, 0)
  s.quadraticCurveTo(0.3 * D, -0.3 * H, 0, -H) // free edge bows towards the corner
  s.closePath()
  if (H === KNEE.drop) for (const [u, v, r] of [[0.55, -0.35, 0.28], [1.35, -0.28, 0.2], [0.42, -1.1, 0.22]]) s.holes.push(new THREE.Path().absarc(u, v, r, 0, Math.PI * 2, true))
  return s
}
export function walkwayKnees(x, ze, y0) {
  const { w } = WALK, { reach: D, t } = KNEE, steel = []
  for (const end of [1, -1]) // +ze: u runs towards -z; -ze: towards +z (basis kept right-handed so faces point out)
    for (const sx of [-1, 1]) {
      const gx = x + sx * w, H = Math.abs(gx) < Math.abs(x) ? KNEE.inner : KNEE.drop
      const plate = new THREE.ExtrudeGeometry(kneeShape(H), { depth: t, bevelEnabled: false, curveSegments: 8 })
      const edge = new THREE.QuadraticBezierCurve(new THREE.Vector2(D, 0), new THREE.Vector2(0.3 * D, -0.3 * H), new THREE.Vector2(0, -H)).getPoints(8)
      // columns: shape u, shape v, extrusion; u x v = extrusion keeps the winding
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -end), new THREE.Vector3(0, 1, 0), new THREE.Vector3(end, 0, 0)).setPosition(gx - (end * t) / 2, y0, end * ze)
      steel.push(plate.applyMatrix4(m))
      for (let i = 0; i < edge.length - 1; i++) {
        const a = new THREE.Vector3(edge[i].x, edge[i].y, 0).applyMatrix4(m), b = new THREE.Vector3(edge[i + 1].x, edge[i + 1].y, 0).applyMatrix4(m)
        steel.push(beam([gx, a.y, a.z], [gx, b.y, b.z], 0.06, 5))
      }
      const ph = Math.min(0.8, H - 0.1)
      steel.push(box(0.6, ph, 0.1, gx, y0 - H + 0.1 + ph / 2, end * (ze - 0.05))) // bearing plate on the tower face
    }
  return steel
}

// Tower junctions: where each walkway enters a tower face, an arched doorway (cast-iron architrave around a dark
// opening) inside a landing frame (stanchions, head and haunches against the face, threshold plate on the deck).
// Lists per material, merged into the walkway's own steel and slate meshes.
export const DOOR = { half: 0.95, spring: 2.3, frame: 0.16, depth: 0.12 }
const archShape = (half, spring) => {
  const s = new THREE.Shape()
  s.moveTo(-half, 0)
  s.lineTo(half, 0)
  s.lineTo(half, spring)
  s.absarc(0, spring, half, 0, Math.PI, false)
  s.closePath()
  return s
}
export function walkwayJunctions(x, ze, y0, y1) {
  const { w } = WALK, { half, spring, frame, depth } = DOOR, yf = y0 + FLOOR_TOP
  const steel = [], slate = []
  for (const sz of [-1, 1]) {
    const face = sz * ze, at = (g, d) => g.rotateY(sz > 0 ? Math.PI : 0).translate(x, yf, face - sz * d)
    const ring = archShape(half + frame, spring)
    ring.holes.push(archShape(half, spring))
    steel.push(at(new THREE.ExtrudeGeometry(ring, { depth, bevelEnabled: false, curveSegments: 10 }), 0))
    slate.push(at(new THREE.ShapeGeometry(archShape(half, spring), 10), 0.01)) // the dark opening, facing into the walkway
    const zf = face - sz * 0.12, ys = y1 - 0.3 // landing frame against the face, up to the roof cross girder
    for (const sx of [-1, 1]) {
      steel.push(box(0.16, ys - yf, 0.16, x + sx * (w - 0.2), (yf + ys) / 2, zf))
      steel.push(beam([x + sx * (w - 0.2), ys - 0.7, zf], [x + sx * (w - 0.9), ys - 0.08, zf], 0.05, 4)) // haunch
    }
    steel.push(box(2 * (w - 0.12), 0.24, 0.16, x, ys - 0.12, zf))
    steel.push(box(2 * (w - 0.2), 0.03, 0.7, x, yf + 0.015, face - sz * 0.35)) // threshold plate
  }
  return { steel, slate }
}

// Interior lamps hung from the roof cross girders: square gas lanterns until ERAS.electricLamps, then shaded
// electric globes. Glass goes on the `lantern` key (lanternFor(era) picks warm gas, blackout or clear electric).
export const WALK_LAMPS = { step: 7.5, drop: 0.75 }
export function walkwayLamps(x, ze, y1, gas) {
  const steel = [], lantern = [], top = y1 - 0.3, y = top - WALK_LAMPS.drop
  for (let z = -ze + 3.5; z <= ze - 3.5 + 1e-6; z += (2 * ze - 7) / Math.round((2 * ze - 7) / WALK_LAMPS.step)) {
    steel.push(box(0.03, WALK_LAMPS.drop, 0.03, x, top - WALK_LAMPS.drop / 2, z))
    if (gas) {
      lantern.push(box(0.26, 0.34, 0.26, x, y - 0.17, z))
      steel.push(new THREE.ConeGeometry(0.22, 0.16, 4).rotateY(Math.PI / 4).translate(x, y + 0.06, z), box(0.3, 0.03, 0.3, x, y - 0.35, z))
    } else {
      steel.push(new THREE.ConeGeometry(0.26, 0.14, 12).translate(x, y - 0.07, z)) // shade
      lantern.push(new THREE.SphereGeometry(0.12, 12, 8).translate(x, y - 0.2, z))
    }
  }
  return { steel, lantern }
}
