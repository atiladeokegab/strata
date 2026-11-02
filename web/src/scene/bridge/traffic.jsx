// Road traffic, barriers and signals. The queue logic lives in trafficSim.js; this file only
// draws it: one InstancedMesh per body type (vertex-coloured, so one draw call each), plus a
// swinging barrier and red/green signal at each entry gate.
// The gates close when the lever is pulled or a leaf is off its seat; vehicles never enter a
// bascule while it is raised, so nothing here follows the leaf rotation.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useHomeDisc, offDisc } from './homeDisc.js'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { Part } from './Part.jsx'
import { box, merge, M } from './geom.js'
import { createTraffic, stepTraffic, onLeaves, roadY, eraOf, nearCam, RAMP_FOOT, TYPES, GATE_U, POST_X, POST_Z, POST_W } from './trafficSim.js'
import { LITE } from '../look/tier.js'
import { STREET_DROP } from './structures.jsx'
import { FOOTWAY_H } from './roadway.js'
import { lift, stepLift, liftSpeed, gatesClosed, substep } from './liftSequence.js'
import { shipState } from './ship.jsx'

// Dark window glass: the BODY shader keys on this exact paint to make it glossy, so it mirrors the sky
export const GLASS = '#323c47'

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
    paint(box(2.54, 0.9, 8.44, 0, 1.9, 0), GLASS), // full length, so the ends show glass too, not a blank red slab
    paint(box(2.54, 0.9, 8.44, 0, 3.6, 0), GLASS),
    paint(box(2.56, 0.18, 8.42, 0, 2.75, 0), '#f1e9d2'),
    ...wheels(0.5, 1.15, [-2.6, 2.8]),
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
const CAP = Object.fromEntries(Object.entries({ cart: 40, hansom: 60, car: 60, taxi: 60, bus: 30, ped: 160, lady: 100 }).map(([k, c]) => [k, k === 'ped' || k === 'lady' ? Math.ceil(c * (LITE ? 0.4 : 1)) : c]))
const PEOPLE = new Set(['ped', 'lady'])
export const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }) // paint: higher metalness mirrored the dark lower sky on flat ends
// Bounce light: an end in shade sees only the bluish sky, which saturated red paint (G, B ~ 0) barely reflects,
// so the grade crushed bus rears to black. A little of the paint's own colour keeps every shaded end in hue.
// Glass (vColor == GLASS) gets low roughness and some metalness in the same draw: env and sun specular, not flat black.
BODY.onBeforeCompile = (s) => {
  s.uniforms.glass = { value: new THREE.Color(GLASS) }
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 glass;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.12;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tif (distance(vColor.rgb, glass) < 0.004) { roughnessFactor = 0.12; metalnessFactor = 0.6; }')
}

const o = new THREE.Object3D()

// One body, merged and centred on its origin along z: the sim places the centre at u - len/2.
export function bodyGeo(k, era) {
  const g = merge(BODIES[k](era))
  g.computeBoundingBox()
  return g.translate(0, 0, -(g.boundingBox.min.z + g.boundingBox.max.z) / 2)
}

export function Traffic({ rt, year, sim, maxAngle }) {
  const era = eraOf(year)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => createTraffic(year), [era])
  // only the bodies this street era uses are mounted: one draw call each
  const geos = useMemo(() => {
    const kinds = new Set(t.lanes.flatMap((L) => L.kinds))
    return Object.fromEntries([...kinds].map((k) => [k, bodyGeo(k, era)]))
  }, [t, era])
  const meshes = useRef({})
  const gate = useRef({ closed: false, swing: 0 })
  const n = useMemo(() => Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0])), []) // per-type instance counts, reused each frame

  const disc = useHomeDisc()
  const camL = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }, dt) => {
    const g = gate.current
    const store = useStore.getState()
    // the camera in the bridge frame the instances are placed in, to clear vehicles around a low eye
    const host = Object.values(meshes.current).find(Boolean)?.parent
    const cam = host ? host.worldToLocal(camera.getWorldPosition(camL)) : null
    const io = { dt: Math.min(dt, 1), onLeaves: onLeaves(t), angle: sim.angle, maxAngle, locked: sim.locked, shipX: shipState.x, shipSailing: shipState.sailing }
    const lever = stepLift(lift, io)
    if (lever !== null && lever !== store.bascule) store.setBascule(lever)
    g.closed = gatesClosed(sim, store.bascule)
    g.swing += ((g.closed ? 1 : 0) - g.swing) * (1 - Math.exp(-Math.min(dt, 0.1) * 1.5))
    substep(dt, (h) => stepTraffic(t, h, g.closed, liftSpeed()))
    lift.clear = g.closed && onLeaves(t) === 0 // measured after a step taken with the gates shut
    for (const k in n) n[k] = 0
    t.lanes.forEach((L, li) => {
      for (const v of L.list) {
        const m = meshes.current[v.type]
        if (!m || n[v.type] >= CAP[v.type] || (LITE && PEOPLE.has(v.type) && v.id % 5 > 1)) continue
        const z = L.dir * (v.u - TYPES[v.type].len / 2)
        // next20 #3: only the bridge and its ramps carry traffic; past the ramp foot the terrain takes over
        if (offDisc(disc, L.x, z, TYPES[v.type].len / 2) || Math.abs(z) + TYPES[v.type].len / 2 > RAMP_FOOT) continue
        const y = roadY(z, STREET_DROP)
        if (nearCam(cam, L.x, z, TYPES[v.type].len / 2, y)) continue
        // pitch with the road: nose down (+x in the body frame) when it falls ahead
        o.position.set(L.x, y + (PEOPLE.has(v.type) ? FOOTWAY_H : 0), z)
        o.rotation.set(Math.atan(y - roadY(z + L.dir, STREET_DROP)), L.dir > 0 ? 0 : Math.PI, 0, 'YXZ')
        o.updateMatrix()
        m.setMatrixAt(n[v.type]++, o.matrix)
      }
    })
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
