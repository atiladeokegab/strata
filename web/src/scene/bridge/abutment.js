// The Gothic shore towers on each abutment (Abutment() in structures.jsx). Plain JS so check.mjs
// can build them under node and test the road clearance.
import * as THREE from 'three'
import { box } from './geom.js'

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
export function abutmentTower(sx, z, o, { hw, walkX }) {
  const xc = sx * 13, hx = 3, hz = 5, inner = sx * 10, outer = sx * 16, river = z + hz, land = z - hz
  o.stone.push(box(2 * hx, ABUT_TOP - hw, 2 * hz, xc, (ABUT_TOP + hw) / 2, z))
  o.granite.push(box(2 * hx + 0.6, 1.5 - hw, 2 * hz + 0.6, xc, (1.5 + hw) / 2, z)) // plinth
  for (const y of [8.2, 13]) o.granite.push(box(2 * hx + 0.4, 0.45, 2 * hz + 0.4, xc, y, z))
  o.granite.push(box(2 * hx + 0.8, 0.6, 2 * hz + 0.8, xc, ABUT_TOP + 0.3, z)) // cornice
  for (let t = -hz + 0.6; t <= hz - 0.6; t += 0.95) {
    for (const x of [inner, outer]) o.stone.push(box(0.5, 0.5, 0.4, x, ABUT_TOP - 0.6, z + t)) // corbel table
  }
  for (let t = -hx + 0.6; t <= hx - 0.6; t += 0.95) for (const zz of [land, river]) o.stone.push(box(0.4, 0.5, 0.5, xc + t, ABUT_TOP - 0.6, zz))
  // roof: steep slate pyramid, small stone lantern, gilt finial
  o.slate.push(new THREE.ConeGeometry(1, 8, 4).rotateY(Math.PI / 4).scale(hx * 1.414, 1, hz * 1.414).translate(xc, ABUT_TOP + 0.6 + 4, z))
  o.stone.push(new THREE.CylinderGeometry(0.55, 0.65, 1.4, 8).translate(xc, ABUT_TOP + 8.2, z))
  o.slate.push(new THREE.ConeGeometry(0.7, 2.6, 8).translate(xc, ABUT_TOP + 10.2, z))
  o.gold.push(new THREE.SphereGeometry(0.22, 8, 6).translate(xc, ABUT_TOP + 11.6, z))
  // dormer gablet on the outer roof face
  o.stone.push(box(0.8, 2.2, 2.2, outer - sx * 1.2, ABUT_TOP + 1.7, z))
  o.slate.push(new THREE.ConeGeometry(1.5, 1.8, 4).rotateY(Math.PI / 4).scale(0.6, 1, 1).translate(outer - sx * 1.2, ABUT_TOP + 3.7, z))
  o.windows.push(opening(0.9, 1.6, outer - sx * 0.75, ABUT_TOP + 0.9, z, 'x', sx))
  // corner turrets: full height on the outer corners; on the inner land corner corbelled out above
  // the road (from 6 m); the inner river corner is the chain anchorage instead
  const turret = (x, zz, y0) => {
    o.stone.push(new THREE.CylinderGeometry(1.05, 1.05, ABUT_TOP + 3 - y0, 8).translate(x, (ABUT_TOP + 3 + y0) / 2, zz))
    for (const y of [8.2, 13]) o.granite.push(new THREE.CylinderGeometry(1.2, 1.2, 0.45, 8).translate(x, y, zz))
    o.granite.push(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 8).translate(x, ABUT_TOP + 3.25, zz))
    o.slate.push(new THREE.ConeGeometry(1.2, 4.6, 8).translate(x, ABUT_TOP + 5.8, zz))
    o.gold.push(new THREE.ConeGeometry(0.12, 1.4, 6).translate(x, ABUT_TOP + 8.8, zz))
    for (const y of [3, 11, 15.5]) if (y > y0 + 1) o.windows.push(box(0.3, 1.6, 0.3, x + 0.95 * Math.sign(x - xc), y, zz)) // slit
  }
  for (const zz of [land, river]) turret(outer - sx * 0.4, zz + (zz === land ? 0.4 : -0.4), hw)
  turret(inner + sx * 0.4, land + 0.4, 7.6)
  o.stone.push(new THREE.CylinderGeometry(1.05, 0.05, 1.6, 8).translate(inner + sx * 0.4, 6.8, land + 0.4)) // corbel
  // lancet windows: paired on the outer face, single on the ends, upper lights on the road face
  for (const y of [2.2, 9, 14]) {
    for (const t of [-1.6, 1.6]) o.windows.push(opening(0.9, y > 5 ? 2.8 : 2.2, outer + sx * 0.05, y, z + t, 'x', sx))
    if (y > 5) o.windows.push(opening(1, 3, inner - sx * 0.05, y, z + 1.2, 'x', -sx))
  }
  for (const y of [2.2, 9]) o.windows.push(opening(1.1, 3, xc + sx * 0.6, y, land - 0.05, 'z', -1))
  o.windows.push(opening(1.1, 3, xc + sx * 0.9, 9, river + 0.05, 'z', 1))
  // pointed doorway on the road face, with a granite surround
  o.doors.push(opening(2, 3.8, inner - sx * 0.1, 0, z - 1.2, 'x', -sx))
  o.granite.push(opening(2.6, 4.4, inner - sx * 0.02, -0.1, z - 1.2, 'x', -sx))
  // chain anchorage: granite boss in the river face, iron shoe and pin taking the chain end
  const ax = sx * walkX
  o.granite.push(box(2.6, 5, 0.5, ax, 15.6, river + 0.2))
  o.iron.push(box(1.3, 3.4, 1.2, ax, 15.9, river + 0.5))
  o.iron.push(new THREE.CylinderGeometry(0.28, 0.28, 2, 10).rotateZ(Math.PI / 2).translate(ax, 15.9, river + 0.7))
}

