// The Gothic shore towers on each abutment (Abutment() in structures.jsx). Plain JS so check.mjs
// can build them under node and test the road clearance.
import * as THREE from 'three'
import { beam, box } from './geom.js'
import { LITE } from '../look/tier.js'

export const ROAD_CLEAR = { halfX: 9.5, belowY: 6 } // nothing of the towers inside this

// Pointed (equilateral) arch opening w wide, h tall, base at y=0, facing +z.
function lancet(w, h, depth = 0.2) {
  const s = new THREE.Shape(), sp = h - w * 0.866
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, sp)
  s.absarc(-w / 2, sp, w, 0, Math.PI / 3, false)
  s.absarc(w / 2, sp, w, (2 * Math.PI) / 3, Math.PI, false)
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 5 })
}
// An opening on a face: n = 'x' or 'z' is the face normal axis, sign which way it faces.
const opening = (w, h, x, y, z, n, sign) =>
  (n === 'x' ? lancet(w, h).rotateY((sign * Math.PI) / 2) : lancet(w, h).rotateY(sign > 0 ? 0 : Math.PI)).translate(x, y, z)

// One Gothic shore tower, after the Tower Hill and south-end abutment towers: granite plinth and
// string courses, a corbel table under the eaves, octagonal corner turrets with slate caps and gilt
// finials, a steep slate pyramid roof with a lantern, lancet windows, a pointed doorway on the road
// face, and the chain anchorage on the river face where the suspension chain (x=±walkX, y=15) ends.
// Kept clear of the road: nothing reaches |x| < 9.5 below 6 m. status: inferred from photos.
const ABUT_TOP = 19 // eaves; the chain's top chord ends at 16.8
// blind: no outer-face windows (the south accumulator tower stands against that face)
export function abutmentTower(sx, z, o, { hw, walkX }, { blind = false, lite = LITE } = {}) {
  const xc = sx * 13, hx = 3, hz = 5, inner = sx * 10, outer = sx * 16, river = z + hz, land = z - hz
  o.stone.push(box(2 * hx, ABUT_TOP - hw, 2 * hz, xc, (ABUT_TOP + hw) / 2, z))
  o.granite.push(box(2 * hx + 0.6, 1.5 - hw, 2 * hz + 0.6, xc, (1.5 + hw) / 2, z)) // plinth
  for (const y of [8.2, 13]) o.granite.push(box(2 * hx + 0.4, 0.45, 2 * hz + 0.4, xc, y, z))
  o.granite.push(box(2 * hx + 0.8, 0.6, 2 * hz + 0.8, xc, ABUT_TOP + 0.3, z)) // cornice
  if (!lite) {
    for (let t = -hz + 0.6; t <= hz - 0.6; t += 0.95) o.stone.push(box(0.5, 0.5, 0.4, outer, ABUT_TOP - 0.6, z + t)) // corbel table
    for (let t = -hx + 0.6; t <= hx - 0.6; t += 0.95) for (const zz of [land, river]) o.stone.push(box(0.4, 0.5, 0.5, xc + t, ABUT_TOP - 0.6, zz))
  }
  // roof: steep slate pyramid, small stone lantern, gilt finial
  o.slate.push(new THREE.ConeGeometry(1, 8, 4).rotateY(Math.PI / 4).scale(hx * 1.414, 1, hz * 1.414).translate(xc, ABUT_TOP + 0.6 + 4, z))
  o.stone.push(new THREE.CylinderGeometry(0.55, 0.65, 1.4, 8).translate(xc, ABUT_TOP + 8.2, z))
  o.slate.push(new THREE.ConeGeometry(0.7, 2.6, 8).translate(xc, ABUT_TOP + 10.2, z))
  o.gold.push(new THREE.SphereGeometry(0.22, 8, 6).translate(xc, ABUT_TOP + 11.6, z))
  // dormer gablet on the outer roof face
  o.stone.push(box(0.8, 2.2, 2.2, outer - sx * 1.2, ABUT_TOP + 1.7, z))
  o.slate.push(new THREE.ConeGeometry(1.5, 1.8, 4).rotateY(Math.PI / 4).scale(0.6, 1, 1).translate(outer - sx * 1.2, ABUT_TOP + 3.7, z))
  o.windows.push(opening(0.9, 1.6, outer - sx * 0.75, ABUT_TOP + 0.9, z, 'x', sx))
  // corner turrets on the outer corners; the inner side is the arch over the road
  const turret = (x, zz, y0) => {
    o.stone.push(new THREE.CylinderGeometry(1.05, 1.05, ABUT_TOP + 3 - y0, 8).translate(x, (ABUT_TOP + 3 + y0) / 2, zz))
    for (const y of [8.2, 13]) o.granite.push(new THREE.CylinderGeometry(1.2, 1.2, 0.45, 8).translate(x, y, zz))
    o.granite.push(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 8).translate(x, ABUT_TOP + 3.25, zz))
    o.slate.push(new THREE.ConeGeometry(1.2, 4.6, 8).translate(x, ABUT_TOP + 5.8, zz))
    o.gold.push(new THREE.ConeGeometry(0.12, 1.4, 6).translate(x, ABUT_TOP + 8.8, zz))
    if (!lite) for (const y of [3, 11, 15.5]) if (y > y0 + 1) o.windows.push(box(0.3, 1.6, 0.3, x + 0.95 * Math.sign(x - xc), y, zz)) // slit
  }
  for (const zz of [land, river]) turret(outer - sx * 0.4, zz + (zz === land ? 0.4 : -0.4), hw)
  // lancet windows: paired on the outer face, single on the ends
  if (!blind) for (const y of [2.2, 9, 14]) for (const t of [-1.6, 1.6]) o.windows.push(opening(0.9, y > 5 ? 2.8 : 2.2, outer + sx * 0.05, y, z + t, 'x', sx))
  for (const y of [2.2, 9]) o.windows.push(opening(1.1, 3, xc + sx * 0.6, y, land - 0.05, 'z', -1))
  o.windows.push(opening(1.1, 3, xc + sx * 0.9, 9, river + 0.05, 'z', 1))
  // pointed doorway on the road face, under the arch, with a granite surround
  o.doors.push(opening(2, 3.8, inner - sx * 0.1, 0, z - 1.2, 'x', -sx))
  o.granite.push(opening(2.6, 4.4, inner - sx * 0.02, -0.1, z - 1.2, 'x', -sx))
  // chain anchorage: granite boss in the river face, iron shoe and pin taking the chain end
  const ax = sx * walkX
  o.granite.push(box(2.6, 5, 0.5, ax, 15.6, river + 0.2))
  o.iron.push(box(1.3, 3.4, 1.2, ax, 15.9, river + 0.5))
  o.iron.push(new THREE.CylinderGeometry(0.28, 0.28, 2, 10).rotateZ(Math.PI / 2).translate(ax, 15.9, river + 0.7))
}

// The same tower during construction (stages 0-3): the brick pier up to the plinth, and from stage 1 its steel
// superstructure, four octagonal corner columns (towerbridge.me.uk, Design) tied at the string-course levels
// and cross-braced on each face. Into o.stone and o.steel; same footprint, so the road stays clear.
export function abutmentFrame(sx, z, o, { hw }, { steel = true } = {}) {
  const xc = sx * 13, hx = 3, hz = 5
  o.stone.push(box(2 * hx + 0.6, 1.5 - hw, 2 * hz + 0.6, xc, (1.5 + hw) / 2, z))
  if (!steel) return
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [xc + a * (hx - 0.4), z + b * (hz - 0.4)])
  for (const [x, zz] of pts) o.steel.push(beam([x, 1.5, zz], [x, ABUT_TOP, zz], 0.35, 8))
  for (const [y0, y1] of [[1.5, 8.2], [8.2, 13], [13, ABUT_TOP]]) for (let i = 0; i < 4; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4]
    o.steel.push(beam([ax, y1, az], [bx, y1, bz], 0.25, 4), beam([ax, y0, az], [bx, y1, bz], 0.12, 4), beam([bx, y0, bz], [ax, y1, az], 0.12, 4))
  }
}

// The arch block joining the two towers over the road: listed as "a large elliptical archway
// spanning the road" (Historic England 1385980, south; the north tower is its twin). Springs at 6 m
// so the road stays clear; granite voussoir ring on both faces, hipped slate roof, lancets above.
export const ARCH = { half: 10, spring: 6, rise: 5 }
export function abutmentArch(z, o, { lite = LITE } = {}) {
  const { half: a, spring: ys, rise: b } = ARCH, hz = 5, seg = lite ? 10 : 20
  const blk = new THREE.Shape()
  blk.moveTo(-a, ABUT_TOP)
  blk.lineTo(-a, ys)
  blk.absellipse(0, ys, a, b, Math.PI, 0, true)
  blk.lineTo(a, ABUT_TOP)
  o.stone.push(new THREE.ExtrudeGeometry(blk, { depth: 2 * hz, bevelEnabled: false, curveSegments: seg }).translate(0, 0, z - hz))
  const ring = new THREE.Shape(), r = 0.7
  ring.moveTo(-a - r, ys)
  ring.absellipse(0, ys, a + r, b + r, Math.PI, 0, true)
  ring.lineTo(a, ys)
  ring.absellipse(0, ys, a, b, 0, Math.PI, false)
  for (const zz of [z - hz - 0.15, z + hz - 0.15]) o.granite.push(new THREE.ExtrudeGeometry(ring, { depth: 0.3, bevelEnabled: false, curveSegments: seg }).translate(0, 0, zz))
  o.granite.push(box(2 * a, 0.45, 2 * hz + 0.4, 0, 13, z)) // string course carried across
  o.granite.push(box(2 * a, 0.6, 2 * hz + 0.8, 0, ABUT_TOP + 0.3, z)) // cornice
  o.slate.push(new THREE.ConeGeometry(1, 5, 4).rotateY(Math.PI / 4).scale(a * 1.414, 1, hz * 1.414).translate(0, ABUT_TOP + 0.6 + 2.5, z))
  for (const x of [-4.5, 0, 4.5]) for (const s of [-1, 1]) o.windows.push(opening(1.1, 3, x, 14.6, z + s * (hz + 0.05), 'z', s))
}
