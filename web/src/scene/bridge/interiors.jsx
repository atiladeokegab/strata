// Victorian tower interiors (north-local frame, like structures.jsx): spiral stone stairs in two
// corner turrets from the road to the walkways, and the hydraulic passenger lifts either side of
// the roadway. Only seen when the cladding is x-rayed. status: inferred (wiki-tb), not in data.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beam, box, merge, M } from './geom.js'
import { L } from './structures.jsx'
import { createCars, stepCars, carHeight } from './hydraulics.js'

const STAIR_TURRETS = [[-12, L.pierZ - 9], [12, L.pierZ + 9]]
const LIFTS = [-11, 11] // shaft x, between the arch columns and the outer wall, at the tower's mid z
const RISE = 0.25
const PER_TURN = 16

export function Stairs() {
  const g = useMemo(() => {
    const stone = [], iron = []
    for (const [x, z] of STAIR_TURRETS) {
      const n = Math.round(L.walkY / RISE)
      const rail = []
      for (let i = 0; i <= n; i++) {
        const a = (i / PER_TURN) * Math.PI * 2, y = i * RISE
        stone.push(box(1.9, 0.2, 0.9, 1.95, 0, 0).rotateY(-a).translate(x, y, z))
        rail.push([x + 2.75 * Math.cos(a), y + 1, z + 2.75 * Math.sin(a)])
      }
      for (let i = 1; i < rail.length; i++) iron.push(beam(rail[i - 1], rail[i], 0.04, 4))
      iron.push(new THREE.CylinderGeometry(1.05, 1.05, L.walkY, 10).translate(x, L.walkY / 2, z)) // newel round the column
    }
    return { stone: merge(stone), iron: merge(iron) }
  }, [])
  return (
    <>
      <mesh geometry={g.stone} material={M.stone} castShadow />
      <mesh geometry={g.iron} material={M.iron} />
    </>
  )
}

const TOP = L.walkY // the cars serve road level and the walkway
export function Lifts({ sim }) {
  const cars = useRef(), weights = useRef(), lift = useRef(createCars())
  const g = useMemo(() => {
    const iron = [], z = L.pierZ, hx = 1.2, hz = 1.5
    for (const x of LIFTS) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) iron.push(box(0.2, L.bodyTop, 0.2, x + sx * hx, L.bodyTop / 2, z + sz * hz))
      for (let y = 0; y <= L.bodyTop; y += 4) iron.push(box(2 * hx, 0.15, 0.15, x, y, z - hz), box(2 * hx, 0.15, 0.15, x, y, z + hz))
      for (const sz of [-1, 1]) iron.push(box(0.12, L.bodyTop, 0.25, x, L.bodyTop / 2, z + sz * (hz - 0.15))) // guide rails
      iron.push(box(2 * hx + 0.4, 0.6, 2 * hz + 0.4, x, L.bodyTop + 0.3, z)) // sheave head
    }
    const car = merge([box(1.6, 2.6, 2.4, 0, 1.3, 0), box(1.7, 0.2, 2.5, 0, 2.7, 0)])
    const weight = box(0.3, 2, 0.9, 0, 0, 0)
    return { iron: merge(iron), car, weight, glass: box(1.62, 1.1, 1.6, 0, 1.7, 0) }
  }, [])
  useFrame((_, dt) => {
    stepCars(lift.current, sim, Math.min(dt, 0.1))
    cars.current.children.forEach((c, i) => {
      const y = TOP * carHeight(lift.current, i)
      c.position.y = y
      weights.current.children[i].position.y = TOP + 3 - y
    })
  })
  return (
    <>
      <mesh geometry={g.iron} material={M.iron} castShadow />
      <group ref={cars}>
        {LIFTS.map((x) => (
          <group key={x} position={[x, 0, L.pierZ]}>
            <mesh geometry={g.car} material={M.timber} castShadow />
            <mesh geometry={g.glass} material={M.glass} />
          </group>
        ))}
      </group>
      <group ref={weights}>
        {LIFTS.map((x) => (
          <mesh key={x} geometry={g.weight} material={M.iron} position={[x + Math.sign(x) * 1.0, 0, L.pierZ]} />
        ))}
      </group>
    </>
  )
}
