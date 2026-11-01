// Road traffic, barriers and signals. The queue logic lives in trafficSim.js; this file only
// draws it: one InstancedMesh per body type (vertex-coloured, so one draw call each), plus a
// swinging barrier and red/green signal at each entry gate.
// The gates close when the lever is pulled or a leaf is off its seat; vehicles never enter a
// bascule while it is raised, so nothing here follows the leaf rotation.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { Part } from './Part.jsx'
import { box, merge, M } from './geom.js'
import { createTraffic, stepTraffic, onLeaves, roadY, streetProfile, eraOf, hasTram, tramZ, END_U, RAMP_FOOT, TYPES, GATE_U, POST_X, POST_Z, POST_W } from './trafficSim.js'
import { LITE } from '../look/tier.js'
import { STREET_DROP } from './structures.jsx'
import { FOOTWAY_H } from './roadway.js'
import { lift, stepLift, liftSpeed, gatesClosed } from './liftSequence.js'
import { shipState } from './ship.jsx'

// ---- low-poly bodies: origin at the centre, ground at y=0, facing +z ----
const paint = (g, hex) => {
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c.toArray()[i % 3]), 3))
  return g
}
const cyl = (r, h, x, y, z) => new THREE.CylinderGeometry(r, r, h, 10).rotateZ(Math.PI / 2).translate(x, y, z)
const wheels = (r, half, zs, hex = '#1a1a1a') => zs.flatMap((z) => [-half, half].map((x) => paint(cyl(r, 0.25, x, r, z), hex)))
const horse = (z) => [
  paint(box(0.6, 0.8, 1.9, 0, 1.45, z), '#4a3020'),
  paint(box(0.35, 0.9, 0.5, 0, 2, z + 1).rotateX(0), '#4a3020'),
  paint(box(0.3, 0.3, 0.6, 0, 2.35, z + 1.3), '#3a2418'),
  ...[-0.2, 0.2].flatMap((x) => [-0.7, 0.7].map((dz) => paint(box(0.14, 1.1, 0.14, x, 0.55, z + dz), '#2e1d12'))),
]

export const BODIES = {
  cart: () => [
    ...horse(2.1),
    paint(box(0.08, 0.08, 1.8, -0.5, 1.1, 0.9), '#5a4128'),
    paint(box(0.08, 0.08, 1.8, 0.5, 1.1, 0.9), '#5a4128'),
    paint(box(1.9, 0.5, 3, 0, 1.15, -1.6), '#7a5a36'),
    paint(box(1.7, 0.7, 2.6, 0, 1.75, -1.6), '#8f8a72'),
    ...wheels(0.7, 1.05, [-1.6], '#3b2a1a'),
  ],
  hansom: () => [
    ...horse(1.6),
    paint(box(0.08, 0.08, 1.6, -0.5, 1.2, 0.5), '#222'),
    paint(box(0.08, 0.08, 1.6, 0.5, 1.2, 0.5), '#222'),
    paint(box(1.4, 1.5, 1.6, 0, 1.75, -1.3), '#1c1c20'),
    paint(box(1.3, 0.1, 1.5, 0, 2.55, -1.4), '#111'),
    paint(box(0.4, 0.5, 0.4, 0, 2.85, -2.2), '#1c1c20'), // driver's perch behind
    ...wheels(0.85, 0.8, [-1.4], '#2a1c12'),
  ],
  car: () => [
    paint(box(1.7, 0.7, 4.2, 0, 0.65, 0), '#2f4a6d'),
    paint(box(1.5, 0.6, 2.1, 0, 1.3, -0.3), '#9fb3c4'),
    ...wheels(0.33, 0.8, [-1.35, 1.35]),
  ],
  taxi: () => [
    paint(box(1.75, 0.8, 4.5, 0, 0.7, 0), '#111214'),
    paint(box(1.55, 0.75, 2.2, 0, 1.45, -0.4), '#1b1d22'),
    paint(box(1.45, 0.55, 2.24, 0, 1.45, -0.4), '#6d7f8f'),
    paint(box(0.5, 0.15, 0.25, 0, 1.9, 0.2), '#f4c430'),
    ...wheels(0.35, 0.85, [-1.5, 1.5]),
  ],
  bus: () => [
    paint(box(2.5, 4.1, 8.4, 0, 2.45, 0), '#c8102e'),
    paint(box(2.54, 0.9, 7.6, 0, 1.9, 0), '#2a2f36'),
    paint(box(2.54, 0.9, 7.8, 0, 3.6, 0), '#2a2f36'),
    paint(box(2.56, 0.18, 8.42, 0, 2.75, 0), '#f1e9d2'),
    ...wheels(0.5, 1.15, [-2.6, 2.8]),
  ],
  // LCC E/1-type double-deck tram, crimson lake and primrose, double-ended; conduit pickup, so no pole
  tram: () => [
    paint(box(2.1, 0.5, 10.5, 0, 0.75, 0), '#1c1c1c'),
    paint(box(2.1, 1.2, 9.2, 0, 1.6, 0), '#7a1f2b'),
    paint(box(2.12, 0.9, 7.6, 0, 2.6, 0), '#2a2f36'),
    paint(box(2.1, 0.25, 9.6, 0, 3.15, 0), '#e8dcae'),
    paint(box(2.1, 0.8, 9.6, 0, 3.7, 0), '#7a1f2b'),
    paint(box(2.12, 0.6, 9, 0, 4.4, 0), '#2a2f36'),
    paint(box(2, 0.15, 9.4, 0, 4.78, 0), '#5a5a5a'),
    ...wheels(0.35, 0.72, [-3.2, -2.2, 2.2, 3.2]),
  ],
  // people: the man and the woman change clothes with the street era
  ped: (era) => {
    const head = paint(new THREE.SphereGeometry(0.15, 6, 4).translate(0, 1.55, 0), '#c9a487')
    if (era === 'modern')
      return [paint(new THREE.CylinderGeometry(0.2, 0.25, 1.4, 6).translate(0, 0.7, 0), '#2b2f3a'), head, paint(new THREE.CylinderGeometry(0.17, 0.2, 0.15, 6).translate(0, 1.72, 0), '#151515')]
    const horse = era === 'horse'
    return [
      paint(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 5).translate(0, 0.25, 0), '#1a1a1a'), // trousers
      paint(new THREE.CylinderGeometry(0.21, 0.3, 1, 6).translate(0, 0.95, 0), horse ? '#16161c' : '#4a4436'), // frock coat / overcoat
      head,
      paint(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 8).translate(0, 1.67, 0), '#111'), // brim
      paint(new THREE.CylinderGeometry(horse ? 0.14 : 0.15, 0.15, horse ? 0.32 : 0.14, 8).translate(0, horse ? 1.84 : 1.75, 0), horse ? '#0d0d0d' : '#3a3428'), // top hat / trilby
    ]
  },
  lady: (era) => {
    const horse = era === 'horse'
    return [
      ...(horse ? [] : [paint(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 5).translate(0, 0.22, 0), '#c8b8a0')]), // stockings below the hem
      paint(new THREE.CylinderGeometry(0.17, horse ? 0.48 : 0.3, horse ? 1.05 : 0.85, 8).translate(0, horse ? 0.52 : 0.85, 0), horse ? '#2a2440' : '#5a3a3a'), // bell skirt / calf-length coat
      paint(new THREE.CylinderGeometry(0.15, 0.17, 0.4, 6).translate(0, 1.25, 0), horse ? '#2a2440' : '#5a3a3a'),
      paint(new THREE.SphereGeometry(0.14, 6, 4).translate(0, 1.55, 0), '#d6b094'),
      paint(new THREE.CylinderGeometry(horse ? 0.3 : 0.18, horse ? 0.3 : 0.2, horse ? 0.06 : 0.1, 8).translate(0, 1.68, 0), horse ? '#5c4a2a' : '#222'), // wide hat / small hat
    ]
  },
}
// Phones (LITE) draw two in five pedestrians and get smaller instance buffers.
const CAP = Object.fromEntries(Object.entries({ cart: 40, hansom: 60, car: 60, taxi: 60, bus: 30, ped: 160, lady: 100, tram: 1 }).map(([k, c]) => [k, k === 'ped' || k === 'lady' ? Math.ceil(c * (LITE ? 0.4 : 1)) : c]))
const PEOPLE = new Set(['ped', 'lady'])
const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 })

const o = new THREE.Object3D()

export function Traffic({ rt, year, sim, maxAngle }) {
  const era = eraOf(year)
  const tram = hasTram(year)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => createTraffic(year), [era, tram])
  // only the bodies this street era uses are mounted: one draw call each
  const geos = useMemo(() => {
    const kinds = new Set([...t.lanes.flatMap((L) => L.kinds), ...(t.tram ? ['tram'] : [])])
    return Object.fromEntries([...kinds].map((k) => [k, merge(BODIES[k](era))]))
  }, [t, era])
  const meshes = useRef({})
  const gate = useRef({ closed: false, swing: 0 })
  const n = useMemo(() => Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0])), []) // per-type instance counts, reused each frame
  // LIDAR street surface past the ramp feet, one profile per lane; null (flat street) until the terrain loads.
  // Dynamic import: Terrain.jsx uses import.meta.glob, which the node corridor check cannot evaluate.
  const street = useRef(null)
  useEffect(() => {
    let live = true
    import('../Terrain.jsx')
      .then(async ({ loadTerrain, heightAt }) => {
        const T = await loadTerrain()
        if (!live) return
        // bridge frame -> the terrain's grid frame (Stage turns the terrain by the bridge axis)
        const a = (T.meta.bridge_axis_deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
        const ground = (x, z) => heightAt(T, x * c - z * s, x * s + z * c)
        street.current = t.lanes.map((L) => streetProfile(ground, L.x, L.kinds.includes('ped') ? 0.5 : 1, STREET_DROP))
      })
      .catch(() => {}) // no terrain: keep the flat street
    return () => {
      live = false
      street.current = null
    }
  }, [t])

  useFrame((_, dt) => {
    const g = gate.current
    const store = useStore.getState()
    const io = { dt, onLeaves: onLeaves(t), angle: sim.angle, maxAngle, locked: sim.locked, shipX: shipState.x, shipSailing: shipState.sailing }
    const lever = stepLift(lift, io)
    if (lever !== null && lever !== store.bascule) store.setBascule(lever)
    g.closed = gatesClosed(sim, store.bascule)
    g.swing += ((g.closed ? 1 : 0) - g.swing) * (1 - Math.exp(-Math.min(dt, 0.1) * 1.5))
    stepTraffic(t, Math.min(dt, 0.1), g.closed, liftSpeed())
    lift.clear = g.closed && onLeaves(t) === 0 // measured after a step taken with the gates shut
    for (const k in n) n[k] = 0
    t.lanes.forEach((L, li) => {
      const sp = street.current?.[li]
      for (const v of L.list) {
        const m = meshes.current[v.type]
        if (!m || n[v.type] >= CAP[v.type] || (LITE && PEOPLE.has(v.type) && v.id % 5 > 1)) continue
        const z = L.dir * (v.u - TYPES[v.type].len / 2)
        const y = roadY(z, STREET_DROP, sp)
        // pitch with the road: nose down (+x in the body frame) when it falls ahead
        o.position.set(L.x, y + (PEOPLE.has(v.type) && Math.abs(z) <= RAMP_FOOT ? FOOTWAY_H : 0), z)
        o.rotation.set(Math.atan(y - roadY(z + L.dir, STREET_DROP, sp)), L.dir > 0 ? 0 : Math.PI, 0, 'YXZ')
        o.updateMatrix()
        m.setMatrixAt(n[v.type]++, o.matrix)
      }
    })
    const zt = t.tram && tramZ(t.tram.time) + TYPES.tram.len / 2 // tram centre, on the crown of the south street
    if (zt && zt - TYPES.tram.len / 2 < END_U && meshes.current.tram) {
      const sp = street.current?.[0], y = roadY(zt, STREET_DROP, sp)
      o.position.set(0, y, zt)
      o.rotation.set(Math.atan(y - roadY(zt - 1, STREET_DROP, sp)), Math.PI, 0, 'YXZ') // faces north, like a dir -1 lane
      o.updateMatrix()
      meshes.current.tram.setMatrixAt(n.tram++, o.matrix)
    }
    for (const k in meshes.current) {
      const m = meshes.current[k]
      if (!m) continue
      m.count = n[k]
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
  })

  return (
    <>
      <Part id="traffic" rt={rt}>
        {Object.entries(geos).map(([k, geo]) => (
          <instancedMesh key={`${era}-${k}`} ref={(m) => (meshes.current[k] = m)} args={[geo, BODY, CAP[k]]} castShadow frustumCulled={false} />
        ))}
      </Part>
      {['north', 'south'].map((side) => (
        <group key={side} rotation={[0, side === 'north' ? 0 : Math.PI, 0]}>
          <Part id={`barrier-${side}`} rt={rt}>
            <Barrier gate={gate} />
          </Part>
        </group>
      ))}
    </>
  )
}

// North-local: the gate across the southbound (east) lane and footway, just short of z = -GATE_U.
const ARM = POST_X - 0.2
const RED_ON = new THREE.Color('#ff2a1a'), RED_OFF = new THREE.Color('#3a0d0a')
const GREEN_ON = new THREE.Color('#30ff60'), GREEN_OFF = new THREE.Color('#0b2a12')

function Barrier({ gate }) {
  const arm = useRef()
  const red = useRef()
  const green = useRef()
  const geo = useMemo(
    () => ({
      posts: merge([box(POST_W, 1.6, POST_W, POST_X, 0.8, POST_Z), box(0.25, 4.2, 0.25, POST_X, 2.1, -GATE_U - 1.2), box(0.6, 1.4, 0.4, POST_X - 0.3, 4.2, -GATE_U - 1.2)]),
      // arm hinged at the post; open it lies along the kerb, closed it swings across to the centre line
      bars: merge([box(0.18, 0.18, ARM, 0, 1.25, -ARM / 2), box(0.18, 0.18, ARM, 0, 0.55, -ARM / 2), ...Array.from({ length: 6 }, (_, i) => box(0.1, 0.7, 0.1, 0, 0.9, -0.6 - i * 1.5))]),
    }),
    [],
  )
  useFrame(() => {
    arm.current.rotation.y = (Math.PI / 2) * gate.current.swing
    const c = gate.current.closed
    red.current.material.color.copy(c ? RED_ON : RED_OFF)
    green.current.material.color.copy(c ? GREEN_OFF : GREEN_ON)
  })
  return (
    <>
      <mesh geometry={geo.posts} material={M.iron} castShadow />
      <group ref={arm} position={[POST_X, 0, POST_Z]}>
        <mesh geometry={geo.bars} material={M.white} castShadow />
      </group>
      <mesh ref={red} position={[POST_X - 0.62, 4.5, -GATE_U - 1.2]} material={M.white}>
        <sphereGeometry args={[0.2, 10, 8]} />
      </mesh>
      <mesh ref={green} position={[POST_X - 0.62, 3.95, -GATE_U - 1.2]} material={M.white}>
        <sphereGeometry args={[0.2, 10, 8]} />
      </mesh>
    </>
  )
}
