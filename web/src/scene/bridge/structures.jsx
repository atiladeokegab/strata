// Procedural Tower Bridge geometry. Everything here is in the NORTH-LOCAL frame: metres, road
// level y=0, bridge centre at the origin, north half at negative z. The south half reuses the
// same builders inside a group turned 180° about y.
// Dimensions: status inferred from wiki-tb drawings and photos unless read from place data.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beam, box, merge, M } from './geom.js'
import { WALK, walkwayTruss } from './walkway.js'

export const L = {
  hw: -9, // Thames high water below the roadway
  bed: -17, // riverbed / pier foundations
  pierTop: -1,
  pierZ: -45.5, // pier and tower centre; inner face at z=-30.5 leaves the 61 m opening
  pivotZ: -35,
  pivotY: -1.5,
  towerHalfX: 13,
  towerHalfZ: 10,
  archHalf: 9.5,
  bodyTop: 42,
  walkX: 10.5,
  walkY: 35,
  walkH: 4.3,
  spanEnd: -138.5, // side span meets the shore abutment
  rackR: 4, // racks stay inside the pier at 86° (6 poked out of its inner face); pinion follows
}

// ---- piers and cofferdams ----
export const pierShape = () => {
  const s = new THREE.Shape()
  ;[[-28, 0], [-21, -15], [21, -15], [28, 0], [21, 15], [-21, 15]].forEach(([x, z], i) =>
    i ? s.lineTo(x, z) : s.moveTo(x, z),
  )
  return s
}

export function Pier() {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(pierShape(), { depth: L.pierTop - L.bed, bevelEnabled: false })
    return g.rotateX(Math.PI / 2).translate(0, L.pierTop, L.pierZ)
  }, [])
  const cap = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(pierShape(), { depth: 0.8, bevelEnabled: false })
    return g.scale(1.03, 1.03, 1).rotateX(Math.PI / 2).translate(0, L.hw + 0.8, L.pierZ)
  }, [])
  return (
    <>
      <mesh geometry={geo} material={M.granite} castShadow receiveShadow />
      <mesh geometry={cap} material={M.stone} />
    </>
  )
}

export function Cofferdam() {
  const geo = useMemo(() => {
    const gs = []
    const ring = pierShape().getSpacedPoints(90)
    for (const p of ring) {
      const x = p.x * 1.18
      const z = p.y * 1.25 + L.pierZ
      gs.push(beam([x, L.bed - 2, z], [x, L.hw + 2.5, z], 0.32, 6))
    }
    for (const y of [L.hw - 4, L.hw, L.hw + 2]) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1]
        gs.push(beam([a.x * 1.18, y, a.y * 1.25 + L.pierZ], [b.x * 1.18, y, b.y * 1.25 + L.pierZ], 0.22, 4))
      }
    }
    return merge(gs)
  }, [])
  return <mesh geometry={geo} material={M.timber} castShadow />
}

// ---- tower: the steel frame (always inside) and the stone cladding (from 1892) ----
const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

export function TowerFrame() {
  const geo = useMemo(() => {
    const gs = []
    const cx = 12, cz = 9, z0 = L.pierZ
    const pts = corners.map(([sx, sz]) => [sx * cx, sz * cz + z0])
    for (const [x, z] of pts) gs.push(box(1.4, L.bodyTop + 1, 1.4, x, (L.bodyTop - 1) / 2, z))
    // inner columns either side of the road arch
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gs.push(box(1, L.bodyTop + 1, 1, sx * L.archHalf, (L.bodyTop - 1) / 2, sz * cz + z0))
    for (let y = 5; y <= L.bodyTop; y += 6) {
      for (let i = 0; i < 4; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4]
        if (i % 2 === 0 && y < 17) continue // keep the road arch clear on the river-facing faces
        gs.push(beam([ax, y, az], [bx, y, bz], 0.4, 4))
        // cross-bracing on each face of the bay below
        gs.push(beam([ax, y - 6, az], [bx, y, bz], 0.18, 4), beam([bx, y - 6, bz], [ax, y, az], 0.18, 4))
      }
    }
    gs.push(box(2 * cx + 1.4, 1.4, 1.2, 0, 14, z0 - cz), box(2 * cx + 1.4, 1.4, 1.2, 0, 14, z0 + cz))
    return merge(gs)
  }, [])
  return <mesh geometry={geo} material={M.steel} castShadow />
}

export function FixedDeck() {
  return (
    <mesh position={[0, -0.5, L.pierZ - 0.25]} material={M.road} receiveShadow>
      <boxGeometry args={[18, 1, 20.5]} />
    </mesh>
  )
}

function archShape() {
  const s = new THREE.Shape(), w = L.towerHalfX, a = L.archHalf
  s.moveTo(-w, L.pierTop)
  s.lineTo(-a, L.pierTop)
  s.lineTo(-a, 8)
  s.quadraticCurveTo(-a, 11.8, 0, 13.4)
  s.quadraticCurveTo(a, 11.8, a, 8)
  s.lineTo(a, L.pierTop)
  s.lineTo(w, L.pierTop)
  s.lineTo(w, 14)
  s.lineTo(-w, 14)
  return s
}

export function TowerCladding({ topY }) {
  const g = useMemo(() => {
    const z0 = L.pierZ, hx = L.towerHalfX, hz = L.towerHalfZ
    const arch = new THREE.ExtrudeGeometry(archShape(), { depth: 2 * hz, bevelEnabled: false }).translate(0, 0, z0 - hz)
    const stone = [box(2 * hx, L.bodyTop - 14, 2 * hz, 0, (L.bodyTop + 14) / 2, z0)]
    const granite = [14, 28, L.bodyTop].map((y) => box(2 * hx + 1, 0.7, 2 * hz + 1, 0, y, z0))
    const slate = []
    const gold = []
    const glass = []
    // octagonal corner turrets with spired caps
    for (const [sx, sz] of corners) {
      const x = sx * 12, z = z0 + sz * 9
      stone.push(new THREE.CylinderGeometry(3.2, 3.4, 47 + 1, 8).translate(x, 22.5, z))
      granite.push(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 8).translate(x, 46.4, z))
      slate.push(new THREE.ConeGeometry(3.5, 8, 8).translate(x, 50.8, z))
      gold.push(new THREE.ConeGeometry(0.25, 2.2, 6).translate(x, 55.9, z))
      for (const y of [4, 17, 29, 39]) {
        const ox = sx * 3.3, oz = sz * 0 // slit windows on the outer faces
        glass.push(box(0.3, 2.6, 0.9, x + ox, y, z + oz), box(0.9, 2.6, 0.3, x, y, z + sz * 3.3))
      }
    }
    // central roof: a rectangular pyramid, lantern and spire up to the data height
    slate.push(new THREE.ConeGeometry(1, 7, 4).rotateY(Math.PI / 4).scale(hx / 0.707, 1, hz / 0.707).translate(0, L.bodyTop + 3.5, z0))
    stone.push(new THREE.CylinderGeometry(1.6, 1.8, 2.5, 8).translate(0, L.bodyTop + 8.25, z0))
    const spire = Math.max(1, topY - L.bodyTop - 9.5)
    slate.push(new THREE.ConeGeometry(1.9, spire, 8).translate(0, L.bodyTop + 9.5 + spire / 2, z0))
    gold.push(new THREE.SphereGeometry(0.45, 8, 6).translate(0, L.bodyTop + 9.5 + spire, z0))
    // dormers on the long roof faces
    for (const sz of [-1, 1]) for (const x of [-5, 5]) {
      stone.push(box(2.6, 3.6, 2, x, L.bodyTop + 2.2, z0 + sz * (hz - 2.2)))
      slate.push(new THREE.ConeGeometry(1.9, 2.4, 4).rotateY(Math.PI / 4).translate(x, L.bodyTop + 5.2, z0 + sz * (hz - 2.2)))
    }
    // lancet windows
    for (const y of [17.5, 24, 31.5, 37.5]) {
      for (const x of [-6, -2, 2, 6]) for (const sz of [-1, 1]) glass.push(box(1.3, 3.4, 0.3, x, y, z0 + sz * (hz + 0.05)))
      for (const dz of [-4, 0, 4]) for (const sx of [-1, 1]) glass.push(box(0.3, 3.4, 1.3, sx * (hx + 0.05), y, z0 + dz))
    }
    // the walkway doors on the river faces
    for (const sx of [-1, 1]) glass.push(box(2.6, 3.8, 0.3, sx * L.walkX, L.walkY + 2.1, z0 + hz + 0.06))
    return {
      arch,
      stone: merge(stone),
      granite: merge(granite),
      slate: merge(slate),
      gold: merge(gold),
      glass: merge(glass),
    }
  }, [topY])
  return (
    <>
      <mesh geometry={g.arch} material={M.stone} castShadow receiveShadow />
      <mesh geometry={g.stone} material={M.stone} castShadow receiveShadow />
      <mesh geometry={g.granite} material={M.granite} castShadow />
      <mesh geometry={g.slate} material={M.slate} castShadow />
      <mesh geometry={g.gold} material={M.gold} />
      <mesh geometry={g.glass} material={M.glass} />
    </>
  )
}

// ---- bascule leaf (rotates about the pivot) ----
export function PivotFrame({ sim, children }) {
  const ref = useRef()
  useFrame(() => {
    ref.current.rotation.x = -sim.angle
  })
  return (
    <group position={[0, L.pivotY, L.pivotZ]}>
      <group ref={ref}>{children}</group>
    </group>
  )
}

export function BasculeLeaf() {
  const g = useMemo(() => {
    const len = -L.pivotZ // pivot to centre line
    const s = new THREE.Shape()
    ;[[-14, -1.2], [0, -1.2], [0, 0], [len, 0], [len, -1], [0, -4.4], [-14, -4.4]].forEach(([z, y], i) =>
      i ? s.lineTo(z, y) : s.moveTo(z, y),
    )
    const girders = [-7.5, -3, 3, 7.5].map((x) =>
      new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x + 0.35, -L.pivotY - 0.06, 0) // just under the deck: no z-fight,
    )
    const deck = box(18, 0.45, len, 0, -L.pivotY - 0.225, len / 2)
    girders.push(box(0.35, 1.3, len, -9, -L.pivotY - 0.7, len / 2), box(0.35, 1.3, len, 9, -L.pivotY - 0.7, len / 2))
    const rails = []
    for (const x of [-8.8, 8.8]) {
      rails.push(beam([x, -L.pivotY + 1.1, 0.3], [x, -L.pivotY + 1.1, len - 0.2], 0.07, 5))
      for (let z = 0.3; z < len; z += 2.5) rails.push(beam([x, -L.pivotY, z], [x, -L.pivotY + 1.1, z], 0.05, 4))
    }
    // quadrant racks the pinions drive; centred on the pivot axis, spanning the lift arc
    const racks = [-5, 5].map((x) =>
      new THREE.TorusGeometry(L.rackR, 0.35, 6, 32, (95 * Math.PI) / 180).rotateZ(-Math.PI / 2).rotateY(Math.PI / 2).translate(x, 0, 0),
    )
    const spokes = [-5, 5].flatMap((x) => [beam([x, 0, 0], [x, -L.rackR, 0], 0.25), beam([x, 0, 0], [x, 0, -L.rackR], 0.25)])
    return { girders: merge(girders), deck, rails: merge(rails), racks: merge([...racks, ...spokes]) }
  }, [])
  return (
    <>
      <mesh geometry={g.girders} material={M.steel} castShadow />
      <mesh geometry={g.deck} material={M.road} castShadow receiveShadow />
      <mesh geometry={g.rails} material={M.white} />
      <mesh geometry={g.racks} material={M.iron} castShadow />
    </>
  )
}

export function Counterweight() {
  const geo = useMemo(() => merge([box(17, 4.6, 5, 0, -4.6, -11.5), box(17, 1, 1, 0, -2, -9.2)]), [])
  return <mesh geometry={geo} material={M.iron} castShadow />
}

export function PivotShaft() {
  const geo = useMemo(
    () => merge([beam([-10.5, 0, 0], [10.5, 0, 0], 0.55, 16), box(1.6, 2.2, 2.2, -10.2, -0.3, 0), box(1.6, 2.2, 2.2, 10.2, -0.3, 0)]),
    [],
  )
  return <mesh geometry={geo} material={M.brass} position={[0, L.pivotY, L.pivotZ]} castShadow />
}

// Hydraulic engines with the pinions meshing on the racks; pinions turn with the leaf.
export function HydraulicEngine({ sim }) {
  const pinions = useRef()
  const r = 0.6
  useFrame(() => {
    for (const p of pinions.current.children) p.rotation.x = (sim.angle * L.rackR) / r
  })
  const housing = useMemo(
    () =>
      merge(
        [-5, 5].flatMap((x) => [
          box(3, 3, 6, x + Math.sign(x) * 3, L.pivotY - L.rackR - 2.4, L.pivotZ - 3.5),
          beam([x, L.pivotY - L.rackR - r, L.pivotZ], [x + Math.sign(x) * 3, L.pivotY - L.rackR - r, L.pivotZ], 0.25),
          beam([x + Math.sign(x) * 3, L.pivotY - L.rackR - 2.4, L.pivotZ - 0.5], [x + Math.sign(x) * 3, L.pivotY - L.rackR - 2.4, L.pivotZ - 6.5], 0.7, 10),
        ]),
      ),
    [],
  )
  const pinion = useMemo(() => new THREE.CylinderGeometry(r, r, 0.8, 12).rotateZ(Math.PI / 2), [])
  return (
    <>
      <mesh geometry={housing} material={M.iron} castShadow />
      <group ref={pinions}>
        {[-5, 5].map((x) => (
          <mesh key={x} geometry={pinion} material={M.brass} position={[x, L.pivotY - L.rackR - r, L.pivotZ]} />
        ))}
      </group>
    </>
  )
}

// Weighted accumulators: the loaded ram rides up as the pumps charge, sinks as the engines draw.
export function Accumulators({ sim }) {
  const rams = useRef()
  const base = L.bed + 3, h = 10
  useFrame(() => {
    for (const m of rams.current.children) m.position.y = base + 2 + sim.stored * (h - 4)
  })
  const casing = useMemo(
    () => merge([-17, 17].flatMap((x) => [new THREE.CylinderGeometry(1.1, 1.1, h, 16).translate(x, base + h / 2, L.pierZ - 6), box(3.2, 0.6, 3.2, x, base, L.pierZ - 6)])),
    [],
  )
  return (
    <>
      <mesh geometry={casing} material={M.iron} castShadow />
      <group ref={rams}>
        {[-17, 17].map((x) => (
          <mesh key={x} position={[x, base + 2, L.pierZ - 6]} material={M.brass} castShadow>
            <cylinderGeometry args={[1.8, 1.8, 2.6, 16]} />
          </mesh>
        ))}
      </group>
    </>
  )
}

// ---- high walkways (span between the towers, built once at the root) ----
export function Walkway({ x, glazed = true, glassFloor = false }) {
  const g = useMemo(() => {
    const z1 = -(L.pierZ + L.towerHalfZ), z0 = -z1, w = WALK.w, y0 = L.walkY, y1 = L.walkY + L.walkH
    return {
      truss: walkwayTruss(x, -(L.pierZ + L.towerHalfZ), y0, y1),
      roof: box(2 * w + 0.6, 0.3, z0 - z1, x, y1 + 0.2, 0),
      floor: box(2 * w, 0.35, z0 - z1, x, y0 + 0.1, 0),
      glazing: box(2 * w - 0.3, L.walkH - 0.6, z0 - z1, x, (y0 + y1) / 2, 0),
    }
  }, [x])
  return (
    <>
      <mesh geometry={g.truss} material={M.steel} castShadow />
      <mesh geometry={g.roof} material={M.slate} castShadow />
      <mesh geometry={g.floor} material={glassFloor ? M.glass : M.white} />
      {glazed && <mesh geometry={g.glazing} material={M.glass} />}
    </>
  )
}

// ---- suspension chains: stiffened lattice from tower to shore, with hangers to the deck ----
export function Suspension() {
  const geo = useMemo(() => {
    const p0 = new THREE.Vector2(L.pierZ - L.towerHalfZ, L.walkY - 1)
    const c = new THREE.Vector2((L.pierZ - L.towerHalfZ + L.spanEnd) / 2, -12)
    const p2 = new THREE.Vector2(L.spanEnd, 15)
    const curve = new THREE.QuadraticBezierCurve(p0, c, p2)
    const n = 28
    const pts = curve.getPoints(n)
    const gs = []
    for (const x of [-L.walkX, L.walkX]) {
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1], dt = 1.8
        gs.push(beam([x, a.y, a.x], [x, b.y, b.x], 0.38, 6), beam([x, a.y + dt, a.x], [x, b.y + dt, b.x], 0.3, 6))
        gs.push(beam([x, a.y, a.x], [x, a.y + dt, a.x], 0.12, 4))
        gs.push(i % 2 ? beam([x, a.y, a.x], [x, b.y + dt, b.x], 0.1, 4) : beam([x, a.y + dt, a.x], [x, b.y, b.x], 0.1, 4))
        if (a.y > 1.6 && i % 2 === 0) gs.push(beam([x, a.y, a.x], [x, 0.6, a.x], 0.09, 4))
      }
    }
    return merge(gs)
  }, [])
  return <mesh geometry={geo} material={M.steel} castShadow />
}

// ---- side span deck (the approach between tower and shore) ----
export function Approach() {
  const g = useMemo(() => {
    const z0 = L.pierZ - L.towerHalfZ, z1 = L.spanEnd, len = z0 - z1, zc = (z0 + z1) / 2
    // the cast-iron balustrade on the girders is ApproachDetails (details.jsx)
    return {
      deck: box(18, 1, len, 0, -0.5, zc),
      girders: merge([box(0.6, 2.4, len, -9.4, -0.9, zc), box(0.6, 2.4, len, 9.4, -0.9, zc)]),
    }
  }, [])
  return (
    <>
      <mesh geometry={g.deck} material={M.road} receiveShadow />
      <mesh geometry={g.girders} material={M.steel} castShadow />
    </>
  )
}

// ---- shore abutments: a tower each side of the road (the chains anchor into them), the road
// running through between them and down a short ramp onto the street ----
// Street level past the ramp, metres below our deck: EA LIDAR DSM along the bridge axis, 150-190 m
// out (north -2.0..-2.7 towards Tower Hill, south -3.1..-4.2 towards Tooley St). status: inferred.
export const STREET_DROP = { north: 2.6, south: 4.0 }
export const RAMP = 35 // m of ramp beyond the abutment
const ROAD_HALF = 9

// Box of width w, height h, running from z0 down to z1 (z1 < z0), its top falling `drop` along it.
const slope = (w, h, x, yTop0, z0, z1, drop) => {
  const len = z0 - z1, a = Math.atan2(drop, len)
  return box(w, h, Math.hypot(len, drop)).translate(0, -h / 2, 0).rotateX(-a).translate(x, yTop0 - drop / 2, (z0 + z1) / 2)
}

export function Abutment({ side = 'north' }) {
  const g = useMemo(() => {
    const z = L.spanEnd - 5, top = L.hw + 25, drop = STREET_DROP[side]
    const z0 = z - 5, z1 = z0 - RAMP
    const stone = [], slate = [], road = []
    for (const sx of [-1, 1]) {
      const xc = sx * 13 // 6 m wide tower, inner face at |x| 10, clear of the 18 m road
      stone.push(box(6, 25, 10, xc, L.hw + 12.5, z))
      for (const sz of [-1, 1]) {
        stone.push(new THREE.CylinderGeometry(1.3, 1.4, 30, 8).translate(sx * 15.2, L.hw + 15, z + sz * 4))
        slate.push(new THREE.ConeGeometry(1.6, 4, 8).translate(sx * 15.2, L.hw + 32, z + sz * 4))
      }
      slate.push(new THREE.ConeGeometry(1, 5, 4).rotateY(Math.PI / 4).scale(6 / 1.414, 1, 10 / 1.414).translate(xc, top + 2.5, z))
      // ramp parapets: stone walls down to below the street, 1.1 m above the road
      stone.push(slope(0.6, 1.1 + 14, sx * (ROAD_HALF + 0.3), 1.1, z0, z1, drop))
    }
    road.push(box(2 * ROAD_HALF, 1, 10, 0, -0.5, z)) // through the gap between the towers
    stone.push(box(2 * ROAD_HALF + 2, -1 - L.hw, 10, 0, (L.hw - 1) / 2, z)) // solid fill under it
    road.push(slope(2 * ROAD_HALF, 1, 0, 0, z0, z1, drop))
    stone.push(slope(2 * ROAD_HALF, 13, 0, -1, z0, z1, drop)) // embankment fill under the ramp
    return { stone: merge(stone), slate: merge(slate), road: merge(road) }
  }, [side])
  return (
    <>
      <mesh geometry={g.stone} material={M.stone} castShadow receiveShadow />
      <mesh geometry={g.slate} material={M.slate} castShadow />
      <mesh geometry={g.road} material={M.road} receiveShadow />
    </>
  )
}
