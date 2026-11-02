// What changes after opening, by year (thresholds: ERAS in stages.js). NORTH-LOCAL frame, like
// structures.jsx; walkway pieces take the walkway's x.
import { useMemo } from 'react'
import * as THREE from 'three'
import { box, merge, M } from './geom.js'
import { L } from './structures.jsx'
import { Meshes } from './details.jsx'

// Floodlight housings (geometry only, no light sources): on the pier aimed at the river faces,
// on the granite band aimed at the upper storeys, and on the turret rings aimed at the spires.
export function TowerLights() {
  return (
    <Meshes
      build={() => towerLightsKit()}
    />
  )
}

export function towerLightsKit() {
  const iron = [], glass = [], z0 = L.pierZ, hx = L.towerHalfX, hz = L.towerHalfZ
  const flood = (x, y, z) => {
    iron.push(box(0.8, 0.45, 0.8, x, y + 0.22, z), box(0.2, 0.3, 0.2, x, y - 0.1, z))
    glass.push(box(0.65, 0.06, 0.65, x, y + 0.47, z))
  }
  for (const sx of [-1, 1]) for (const dz of [-6, 0, 6]) flood(sx * (hx + 1.6), 0.1, z0 + dz)
  for (const sz of [-1, 1]) for (const x of [-4, 4]) flood(x, 28.4, z0 + sz * (hz + 0.1))
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
    for (const a of [0, Math.PI / 2]) flood(sx * 12 + sx * 3.3 * Math.cos(a), 46.85, z0 + sz * 9 + sz * 3.3 * Math.sin(a))
  return { iron, glass }
}

// A few visitors at the walkway windows, in ones and twos against the glazing so the aisle stays
// clear: legs, a coat that flares to the knee, shoulders and a head, so they read as people.
export const WALK_PEOPLE = [[-26, 1], [-25.3, 1], [-15, -1], [2.4, -1], [3.1, -1], [13.5, 1], [24, -1], [24.6, -1]] // [z, side]
export function WalkwayPeople({ x }) {
  return (
    <Meshes
      deps={[x]}
      build={() => {
        const coat = [], face = [], y = L.walkY + 0.28
        for (const [z, side] of WALK_PEOPLE) {
          const px = x + side * 1.05
          for (const lz of [-0.09, 0.09]) coat.push(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6).translate(px, y + 0.25, z + lz))
          coat.push(new THREE.CylinderGeometry(0.17, 0.25, 0.85, 8).translate(px, y + 0.9, z))
          coat.push(new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1.25).translate(px, y + 1.32, z))
          face.push(new THREE.SphereGeometry(0.11, 8, 6).translate(px, y + 1.52, z))
        }
        return { iron: coat, stone: face }
      }}
    />
  )
}

// London 2012: one set of five rings hung under the downstream walkway, facing the river.
// Blue sits at +z so the set reads left to right from downstream (+x).
const RINGS = [
  ['#0081c8', 9.6, 28.4], ['#000000', 0, 28.4], ['#ee334e', -9.6, 28.4],
  ['#fcb131', 4.8, 24.2], ['#00a651', -4.8, 24.2],
]
export function OlympicRings({ x }) {
  const g = useMemo(
    () => ({
      rings: RINGS.map(([c, z, y]) => [c, new THREE.TorusGeometry(4.3, 0.5, 8, 40).rotateY(Math.PI / 2).translate(x, y, z)]),
      cables: merge([-9.6, 0, 9.6].map((z) => new THREE.CylinderGeometry(0.05, 0.05, 2.5, 4).translate(x, L.walkY - 1.25, z))),
    }),
    [x],
  )
  const mats = useMemo(() => RINGS.map(([c]) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })), [])
  return (
    <>
      {g.rings.map(([c, geo], i) => <mesh key={c} geometry={geo} material={mats[i]} />)}
      <mesh geometry={g.cables} material={M.iron} />
    </>
  )
}
