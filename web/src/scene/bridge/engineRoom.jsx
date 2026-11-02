// The 1894 hydraulic power house on the south bank, just east of the south abutment.
// WORLD frame (mounted at the TowerBridge root, not inside Half): x east, z south, ground y=0.
// Steam pumping engines charge a weighted accumulator; mains run along the approach to the
// south pier. The shell x-rays (Part xray) so the engines, boilers and accumulator show through.
// status: inferred layout and sizes; the building's footprint is not yet in data.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beam, box, merge, M } from './geom.js'
import { LITE } from '../look/tier.js'
import { Part } from './Part.jsx'
import { L } from './structures.jsx'
import { OPEN_TIME_S } from './hydraulics.js'

let MATS
const mats = () =>
  (MATS ??= {
    // brown stock brick (listing: "brown stock brick with grey brick detailing"); Look adds the London stock maps
    brick: Object.assign(new THREE.MeshStandardMaterial({ color: '#a8855a', roughness: 0.9 }), { userData: { kind: 'brick' } }),
    stone: M.stone,
    granite: M.granite,
    slate: M.slate,
    iron: M.iron,
  })

// House footprint and the machinery layout inside it.
const H = { x0: 20, x1: 44, z0: 146, z1: 166, wall: 9, t: 0.6 }
// z of each horizontal engine's axis. The third (1941) is cited (Tower Bridge's own account and the Forncett engine record;
// Wikipedia's 1942 is the outlier); its place beside the pair is inferred. The boilers moved to the old accumulator bay to make room.
const ENGINES = [150.5, 155.5, 160.5]
const ENG_Y = 1.6, CRANK = 0.9, FLY_X = 33.5
// accumulator tower: built against the east face (world x 16) of the south abutment's east tower, at street level
const ACC = { x: 18.9, z: 143.8, base: -2.9, travel: 9, foot: -3.4 }
const CHIMNEY = { x: 41.5, z: 149, h: 32 }

// ---- Victorian dressing: arched bays between brick pilasters, stone dressings, gables, ventilator ----
// Half-disc in the xy plane (top half), axis along z: the head of a round-arched window.
const SEG = LITE ? 5 : 12 // arch segments; phones get the coarse arch
const archHead = (r, depth) => new THREE.CylinderGeometry(r, r, depth, SEG, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2)
// One round-arched window in a wall facing z (rotY 0) or x (rotY π/2), centred at u along the wall.
function archWindow(out, { w = 1.6, sill = 2.4, spring = 6.2, depth }, place) {
  const r = w / 2
  out.glass.push(place(box(w, spring - sill, depth + 0.1, 0, (sill + spring) / 2, 0)), place(archHead(r, depth + 0.1).translate(0, spring, 0)))
  // stone: sill, the arch ring as a thin half-annulus, keystone
  out.stone.push(place(box(w + 0.5, 0.22, depth + 0.35, 0, sill - 0.11, 0)))
  if (LITE) return
  const ring = new THREE.CylinderGeometry(r + 0.28, r + 0.28, depth + 0.2, SEG, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2)
  out.stone.push(place(ring.translate(0, spring, 0)), place(box(0.36, 0.5, depth + 0.3, 0, spring + r + 0.18, 0)))
}
// placers: wall along x at z (faces ±z) or along z at x (faces ±x)
const atZ = (x, z) => (g) => g.translate(x, 0, z)
const atX = (x, z) => (g) => g.rotateY(Math.PI / 2).translate(x, 0, z)

function Shell({ steam }) {
  const m = mats()
  const g = useMemo(() => {
    const { x0, x1, z0, z1, wall, t } = H
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, rise = 5
    const out = { brick: [], stone: [], glass: [], slate: [] }
    const { brick, stone, slate } = out
    // walls
    brick.push(box(w, wall, t, cx, wall / 2, z0), box(w, wall, t, cx, wall / 2, z1), box(t, wall, d, x0, wall / 2, cz), box(t, wall, d, x1, wall / 2, cz))
    // granite-faced plinth, stone string course at sill level, moulded cornice with a corbel table
    stone.push(box(w + 0.7, 1.1, d + 0.7, cx, 0.55, cz))
    for (const [y, h, o] of [[2.2, 0.2, 0.3], [wall - 0.15, 0.3, 0.45], [wall + 0.15, 0.25, 0.65]]) {
      stone.push(box(w + o, h, t + o, cx, y, z0), box(w + o, h, t + o, cx, y, z1), box(t + o, h, d + o, x0, y, cz), box(t + o, h, d + o, x1, y, cz))
    }
    // long walls: 6 bays between pilasters, an arched window in each
    const bays = 6, bay = w / bays
    for (let i = 0; i <= bays; i++) {
      const x = x0 + i * bay
      for (const z of [z0, z1]) brick.push(box(0.7, wall - 1.1, t + 0.35, x, 1.1 + (wall - 1.1) / 2, z))
      if (i < bays) for (const z of [z0, z1]) archWindow(out, { depth: t }, atZ(x + bay / 2, z))
      if (!LITE) for (const z of [z0, z1]) for (let k = 0; k < 2; k++) stone.push(box(0.25, 0.3, 0.3, x + bay * (0.25 + k * 0.5), wall - 0.45, z + Math.sign(z - cz) * 0.4)) // corbels
    }
    // gable ends: brick triangle, stone coping on the rakes, kneelers, an oculus, three tall windows below
    for (const x of [x0, x1]) {
      const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)])
      brick.push(new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2).rotateY(Math.PI / 2).translate(x, wall, cz))
      for (const s of [-1, 1]) {
        stone.push(beam([x, wall + 0.2, cz + s * (d / 2 + 0.3)], [x, wall + rise + 0.35, cz], 0.32, 4))
        stone.push(box(t + 0.5, 0.7, 0.9, x, wall + 0.3, cz + s * (d / 2 + 0.1)))
      }
      stone.push(box(t + 0.5, 0.9, 0.9, x, wall + rise + 0.5, cz)) // apex block
      const oc = new THREE.CylinderGeometry(1, 1, t + 0.1, 20).rotateZ(Math.PI / 2).translate(x, wall + 1.9, cz)
      const ring = new THREE.CylinderGeometry(1.3, 1.3, t + 0.2, 20).rotateZ(Math.PI / 2).translate(x, wall + 1.9, cz)
      out.glass.push(oc)
      stone.push(ring)
      for (const z of [cz - 5.5, cz, cz + 5.5]) archWindow(out, { depth: t }, atX(x, z))
      for (const z of [z0 + 0.3, z1 - 0.3]) brick.push(box(t + 0.45, wall - 1.1, 0.9, x, 1.1 + (wall - 1.1) / 2, z)) // corner piers
    }
    // slate roof with a louvred ventilator along the ridge
    const roofShape = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.7, -0.35), new THREE.Vector2(d / 2 + 0.7, -0.35), new THREE.Vector2(0, rise)])
    slate.push(new THREE.ExtrudeGeometry(roofShape, { depth: w - 0.2, bevelEnabled: false }).rotateY(Math.PI / 2).translate(x0 + 0.1, wall + 0.35, cz))
    const vx0 = x0 + 4, vx1 = x1 - 8, vw = vx1 - vx0, vy = wall + rise + 0.2
    brick.push(box(vw, 1.1, 2.4, (vx0 + vx1) / 2, vy + 0.4, cz))
    if (!LITE) for (let x = vx0 + 0.6; x < vx1; x += 1.2) out.glass.push(box(0.7, 0.6, 2.5, x, vy + 0.45, cz)) // louvres
    const cap = new THREE.Shape([new THREE.Vector2(-1.7, 0), new THREE.Vector2(1.7, 0), new THREE.Vector2(0, 1)])
    slate.push(new THREE.ExtrudeGeometry(cap, { depth: vw + 0.6, bevelEnabled: false }).rotateY(Math.PI / 2).translate(vx0 - 0.3, vy + 0.95, cz))

    // accumulator tower: corner pilasters, tall arched lights, corbelled stone parapet, slate pyramid and finial
    const A = 2.5, top = 18, f = ACC.foot, th = top - f, ym = (top + f) / 2
    brick.push(box(2 * A, th, 0.5, ACC.x, ym, ACC.z - A), box(2 * A, th, 0.5, ACC.x, ym, ACC.z + A))
    brick.push(box(0.5, th, 2 * A, ACC.x - A, ym, ACC.z), box(0.5, th, 2 * A, ACC.x + A, ym, ACC.z))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) brick.push(box(0.8, th, 0.8, ACC.x + sx * A, ym, ACC.z + sz * A))
    stone.push(box(2 * A + 1, 1.2, 2 * A + 1, ACC.x, f + 0.6, ACC.z)) // plinth on the street
    for (const s of [-1, 1]) {
      archWindow(out, { w: 1.1, sill: wall + 1.5, spring: top - 2.6, depth: 0.5 }, atZ(ACC.x, ACC.z + s * A))
      archWindow(out, { w: 1.1, sill: wall + 1.5, spring: top - 2.6, depth: 0.5 }, atX(ACC.x + s * A, ACC.z))
    }
    stone.push(box(2 * A + 1, 0.3, 2 * A + 1, ACC.x, wall + 1.2, ACC.z)) // band at the eaves line
    stone.push(box(2 * A + 0.9, 0.4, 2 * A + 0.9, ACC.x, top - 0.6, ACC.z), box(2 * A + 1.4, 0.7, 2 * A + 1.4, ACC.x, top, ACC.z))
    slate.push(new THREE.ConeGeometry(3.9, 4.5, 4).rotateY(Math.PI / 4).translate(ACC.x, top + 2.6, ACC.z))
    slate.push(beam([ACC.x, top + 4.6, ACC.z], [ACC.x, top + 6.4, ACC.z], 0.07, 6), new THREE.SphereGeometry(0.22, 8, 6).translate(ACC.x, top + 5.1, ACC.z)) // finial: dark lead, rides the slate draw call

    // chimney: stone base, tapering square brick shaft with stone bands, corbelled cap and iron rim
    const C = CHIMNEY
    stone.push(box(3.6, 2.2, 3.6, C.x, 1.1, C.z), box(3.9, 0.35, 3.9, C.x, 2.3, C.z))
    brick.push(new THREE.CylinderGeometry(1.25, 1.75, C.h - 2.5, 4, 1).rotateY(Math.PI / 4).translate(C.x, 2.5 + (C.h - 2.5) / 2, C.z))
    for (const y of [12, 22]) {
      const r = 1.75 - (0.5 * (y - 2.5)) / (C.h - 2.5)
      stone.push(box(2 * r + 0.3, 0.35, 2 * r + 0.3, C.x, y, C.z))
    }
    for (const [y, s] of [[C.h - 1.4, 2.9], [C.h - 0.9, 3.2], [C.h - 0.3, 3.5]]) brick.push(box(s, 0.5, s, C.x, y, C.z))
    stone.push(box(3.6, 0.3, 3.6, C.x, C.h + 0.1, C.z))

    // 1976: the electric pump house against the east gable, brick with a slate cap, kept under the gable's window sills (2.4 m)
    if (!steam) brick.push(box(3, 2, 5, H.x1 + 1.8, 1, 153)), slate.push(box(3.6, 0.3, 5.6, H.x1 + 1.8, 2.15, 153))
    // made ground under the house, down to the river level
    stone.push(box(30, 9, 26, 32, -4.5, 156), box(30.6, 0.4, 26.6, 32, 0, 156), box(30.3, 0.3, 26.3, 32, -2.4, 156)) // retaining plinth: coping, band
    return {
      // LITE: the dark window glass rides in the slate mesh (one call fewer)
      brick: merge(brick), stone: merge(stone), slate: merge(LITE ? [...slate, ...out.glass] : slate), glass: LITE ? null : merge(out.glass),
    }
  }, [steam])
  return (
    <>
      <mesh geometry={g.brick} material={m.brick} castShadow receiveShadow />
      <mesh geometry={g.stone} material={m.stone} castShadow />
      <mesh geometry={g.slate} material={m.slate} castShadow />
      {g.glass && <mesh geometry={g.glass} material={M.glass} />}
    </>
  )
}

const UNIT_ROD = new THREE.CylinderGeometry(0.12, 0.12, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0)
const CROSSHEAD = new THREE.BoxGeometry(0.8, 1, 1)
// fire doors on the north ends of the two boilers (axis along z, x 39.6 / 42.2, front at z 156.5)
const FIRE_DOORS = merge([39.6, 42.2].map((x) => box(0.9, 0.6, 0.08, x, 1.3, 156.4)))
const WHEEL = (() => {
  const gs = [new THREE.TorusGeometry(2.6, 0.22, 8, 32), new THREE.CylinderGeometry(0.35, 0.35, 3, 10).rotateX(Math.PI / 2)]
  for (let i = 0; i < 6; i++) gs.push(box(0.16, 5.2, 0.16).rotateZ((i * Math.PI) / 6))
  gs.push(box(0.3, CRANK + 0.3, 0.3, 0, CRANK / 2, 1.4)) // crank web on the near face
  return merge(gs)
})()
const _o = new THREE.Object3D()
// instance i of `m` at p, turned rz about z, stretched sx along x
const put = (m, i, p, rz, sx = 1) => {
  _o.position.fromArray(p), _o.rotation.set(0, 0, rz), _o.scale.set(sx, 1, 1), _o.updateMatrix()
  m.setMatrixAt(i, _o.matrix)
}

function Machinery({ sim, steam, third, museum }) {
  const m = mats()
  const fly = useRef(), cross = useRef(), rod = useRef(), ram = useRef(), fire = useRef()
  const engines = third ? ENGINES : ENGINES.slice(0, 2)
  const crank = useRef(0)
  const fixed = useMemo(() => {
    const iron = []
    for (const z of engines) {
      iron.push(new THREE.CylinderGeometry(0.9, 0.9, 3, 14).rotateZ(Math.PI / 2).translate(24.5, ENG_Y, z)) // steam cylinder
      iron.push(box(10, 0.8, 1.6, 28.5, 0.6, z)) // bed plate
      iron.push(beam([26, ENG_Y + 0.5, z], [31, ENG_Y + 0.5, z], 0.08), beam([26, ENG_Y - 0.5, z], [31, ENG_Y - 0.5, z], 0.08)) // guides
      iron.push(box(0.8, 2.2, 0.8, FLY_X, 1.1, z - 1.3), box(0.8, 2.2, 0.8, FLY_X, 1.1, z + 1.3)) // plummer blocks
      iron.push(new THREE.CylinderGeometry(0.4, 0.4, 2.6, 10).rotateX(Math.PI / 2).translate(37, ENG_Y, z)) // pump barrel
    }
    // two Lancashire boilers, brick-set, lengthwise in the east bay
    for (const x of [39.6, 42.2]) iron.push(new THREE.CylinderGeometry(1.25, 1.25, 9, 18).rotateX(Math.PI / 2).translate(x, 1.8, 161))
    iron.push(new THREE.CylinderGeometry(0.7, 0.7, 2 + ACC.travel, 14).translate(ACC.x, ACC.base + (2 + ACC.travel) / 2, ACC.z)) // ram
    // hydraulic mains: house to the south pier along the approach (two pipes); they drop below the
    // ramp outside its parapet (x 9.6) so nothing crosses the road
    for (const x of [6.4, 7.4])
      iron.push(
        beam([H.x0, 0.6, 151], [x + 4.1, 0.6, 151], 0.22), beam([x + 4.1, 0.6, 151], [x + 4.1, -2, 151], 0.22),
        beam([x + 4.1, -2, 151], [x, -2, 146], 0.22), beam([x, -2, 146], [x, -2, 56], 0.22, 8),
      )
    iron.push(beam([37, 0.6, engines[0]], [37, 0.6, engines.at(-1)], 0.18), beam([ACC.x, 0.6, 151], [ACC.x, 0.6, ACC.z + 1], 0.18)) // pumps on the main; branch to the ram
    // from 1982 the engine rooms are a museum: visitors in the aisles between the engines (inferred).
    // Dark silhouettes in the iron mesh, so they cost no draw call.
    if (museum)
      [[23, 148], [27.5, 153], [31, 148.4], [35.5, 153.2], [24, 158], [30, 158.3], [36, 163], [33, 164.5]].forEach(([x, z], i) => {
        const h = 1.55 + 0.15 * Math.sin(i * 2.3)
        iron.push(new THREE.CylinderGeometry(0.2, 0.27, h - 0.3, 8).translate(x, (h - 0.3) / 2, z), new THREE.SphereGeometry(0.14, 8, 6).translate(x, h - 0.12, z))
      })
    // LITE: the flywheels stand still inside the iron mesh, at the instanced pose for crank 0
    if (LITE) engines.forEach((z, i) => iron.push(WHEEL.clone().rotateZ(i * Math.PI / 2).translate(FLY_X, ENG_Y, z)))
    return merge(iron)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [third, museum])

  useFrame((st, dt) => {
    if (LITE) return
    if (steam && sim.pumping) crank.current += Math.min(dt, 0.1) * 3
    // one instanced draw per moving part kind: flywheels, crossheads, connecting rods
    engines.forEach((z, i) => {
      const a = crank.current + i * Math.PI / 2 // cranks quartered
      const px = FLY_X - CRANK * Math.sin(a), py = ENG_Y + CRANK * Math.cos(a)
      const cx = px - 3.6 // crosshead follows the crank's x throw (rod ~3.6 m)
      put(fly.current, i, [FLY_X, ENG_Y, z], a)
      put(cross.current, i, [cx, ENG_Y, z], 0)
      put(rod.current, i, [cx, ENG_Y, z + 1.4], Math.atan2(py - ENG_Y, px - cx), Math.hypot(px - cx, py - ENG_Y))
    })
    for (const m of [fly.current, cross.current, rod.current]) m.instanceMatrix.needsUpdate = true
    ram.current.position.y = ACC.base + 3 + sim.stored * ACC.travel
    if (fire.current) fire.current.color.setRGB(1, 0.42, 0.08).multiplyScalar((sim.pumping ? 1.5 : 0.7) * (0.85 + 0.15 * Math.sin(crank.current * 7 + st.clock.elapsedTime * 9)))
  })

  // LITE: one static iron mesh; crossheads, rods, fire doors and the ram's weight case are skipped
  if (LITE) return <mesh geometry={fixed} material={m.iron} castShadow />
  return (
    <>
      <mesh geometry={fixed} material={m.iron} castShadow />
      <instancedMesh key={`f${engines.length}`} ref={fly} args={[WHEEL, M.iron, engines.length]} castShadow frustumCulled={false} />
      <instancedMesh key={`c${engines.length}`} ref={cross} args={[CROSSHEAD, M.brass, engines.length]} frustumCulled={false} />
      <instancedMesh key={`r${engines.length}`} ref={rod} args={[UNIT_ROD, M.brass, engines.length]} frustumCulled={false} />
      {/* while steaming the boiler fire doors glow, brighter while the pumps run; after 1976 the boilers stand cold.
          affordance: Part leaves its own material alone (no fade, no highlight) */}
      {steam && (
        <mesh geometry={FIRE_DOORS} userData={{ affordance: true }}>
          <meshBasicMaterial ref={fire} toneMapped={false} />
        </mesh>
      )}
      {/* the loaded weight case rides the ram: up = stored, down = drawn */}
      <mesh ref={ram} position={[ACC.x, 0, ACC.z]} material={M.iron} castShadow>
        <cylinderGeometry args={[1.9, 1.9, 4, 16]} />
      </mesh>
    </>
  )
}

// Smoke puffs from the stack, only while the pumps run. Outside Part so it never highlights.
const PUFFS = 14
const MAINS = [['drive', 0], ['supply', 0], ['river', 0.15]]
function Smoke({ sim }) {
  const ref = useRef()
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a8580', transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 }), [])
  const level = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const puff = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  useFrame(({ clock }, dt) => {
    level.current += ((sim.pumping ? 1 : 0) - level.current) * Math.min(1, dt * 1.5)
    const t = clock.elapsedTime
    ref.current.visible = level.current > 0.02
    material.opacity = 0.35 * level.current
    if (!ref.current.visible) return
    for (let i = 0; i < PUFFS; i++) {
      const k = (t * 0.25 + i / PUFFS) % 1 // 0 at the stack mouth, 1 dispersed
      dummy.position.set(CHIMNEY.x + k * 9 + Math.sin(i * 7.3) * k * 2, CHIMNEY.h + 1 + k * 14, CHIMNEY.z + Math.cos(i * 3.1) * k * 3)
      dummy.scale.setScalar(0.6 + k * 2.4)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })
  // one draw for all puffs; instances move every frame, so skip the stale bounding-sphere cull
  return <instancedMesh ref={ref} args={[puff, material, PUFFS]} frustumCulled={false} />
}

// ---- power flow: dashes run along the mains while water moves ----
// Supply = pumps -> accumulators (both piers; the north pier is fed by mains along the riverbed).
// Drive = accumulators -> hydraulic engines -> pinions on the rack quadrants.
const OMEGA_MAX = (86 * Math.PI) / 180 / OPEN_TIME_S
const DASH_M = 3 // metres per dash cycle
const toWorld = (sx) => ([x, y, z]) => [x * sx, y, z * sx] // north-local -> world (south half is rotated 180°)
const HDR = [0, -12, L.pierZ - 6] // pier header under the accumulators, north-local

function halfPaths(sx) {
  const w = (pts) => pts.map(toWorld(sx))
  const supply = [-1, 1].map((s) => w([HDR, [s * 15.9, -12, HDR[2]]]))
  const drive = [-1, 1].map((s) =>
    w([[s * 17, -12, HDR[2] + 1.2], [s * 17, -7.9, -45], [s * 8, -7.9, -45], [s * 8, -7.9, L.pivotZ - 0.5], [s * 8, L.pivotY - L.rackR - 0.6, L.pivotZ], [s * 5.4, L.pivotY - L.rackR - 0.6, L.pivotZ]]),
  )
  return { supply, drive }
}

const PATHS = (() => {
  const n = halfPaths(1), s = halfPaths(-1)
  const southHdr = toWorld(-1)(HDR)
  // house pumps along the approach main (x 7.4) into the south pier header
  const feed = [[37, 0.6, ENGINES[0]], [37, 0.6, 151], [11.5, 0.6, 151], [11.5, -2, 151], [7.4, -2, 146], [7.4, -2, 56], [7.4, -10, southHdr[2]], southHdr]
  // under the river along the bed to the north pier header (status: inferred route)
  const river = [southHdr, [0, L.bed + 0.6, 30], [0, L.bed + 0.6, -30], HDR]
  return { supply: [feed, ...s.supply, ...n.supply], drive: [...s.drive, ...n.drive], river }
})()

function tube(pts, r) {
  const path = new THREE.CurvePath()
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i])))
  const g = new THREE.TubeGeometry(path, Math.max(8, Math.ceil(path.getLength() / 1.5)), r, 6)
  const uv = g.attributes.uv, k = path.getLength() / DASH_M
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * k) // u in dash cycles, so one texture fits every length
  return g
}

let DASH
const dashTexture = () => {
  if (!DASH) {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 4 })
    const x = c.getContext('2d'), grad = x.createLinearGradient(0, 0, 64, 0)
    grad.addColorStop(0, '#000'); grad.addColorStop(0.35, '#fff'); grad.addColorStop(0.55, '#fff'); grad.addColorStop(0.7, '#000')
    x.fillStyle = grad
    x.fillRect(0, 0, 64, 4)
    DASH = new THREE.CanvasTexture(c)
    DASH.wrapS = THREE.RepeatWrapping
  }
  const t = DASH.clone() // own offset, shared image
  t.needsUpdate = true
  return t
}

const WATER = '#5fd4ff', OIL = '#ffae3a' // steam-era water mains; oil from 1976 (electro-hydraulic)
// The river main lifted to just above the water, shown as a ghost while the north pier is x-rayed or exploded.
const GHOST = [[0, L.hw + 0.5, 30], [0, L.hw + 0.5, -30]]

function Flow({ rt, steam }) {
  const sim = rt.sim
  const ref = useRef(), ghostRef = useRef(), ghost = useRef(0)
  const m = useMemo(() => {
    const mk = (base) => new THREE.MeshStandardMaterial({ color: '#26333a', roughness: 0.5, metalness: 0.6, emissiveMap: dashTexture(), emissiveIntensity: base })
    const river = mk(0.15)
    const ghost = new THREE.MeshBasicMaterial({ map: river.emissiveMap, transparent: true, depthWrite: false, opacity: 0 })
    return { supply: mk(0), drive: mk(0), river, ghost }
  }, [])
  const colour = steam ? WATER : OIL
  for (const mat of Object.values(m)) (mat.emissive ?? mat.color).set(colour)
  const geo = useMemo(
    // LITE: the river main rides in the supply mesh (it carries the same water) and there is no ghost
    () => ({ supply: merge([...PATHS.supply.map((p) => tube(p, 0.26)), ...(LITE ? [tube(PATHS.river, 0.3)] : [])]), drive: merge(PATHS.drive.map((p) => tube(p, 0.26))), river: tube(PATHS.river, 0.3), ghost: tube(GHOST, 0.35) }),
    [],
  )
  useFrame((_, dt) => {
    ref.current.visible = rt.explode.current < 0.05 // the mains don't follow exploded parts
    const drive = Math.min(1, Math.abs(sim.omega) / OMEGA_MAX)
    const supply = Math.min(1, drive + (sim.pumping ? 0.35 : 0))
    for (const [k, base] of LITE ? MAINS.slice(0, 2) : MAINS) {
      const mat = m[k]
      const level = k === 'drive' ? drive : supply
      mat.emissiveIntensity = base + level * 2.5
      mat.emissiveMap.offset.x -= level * 1.2 * Math.min(dt, 0.1) // dashes run start -> end of each path
    }
    if (LITE) return
    const on = Math.max(rt.explode.current, rt.fades.current.includes('pier-north') ? 1 : 0)
    const x = (ghost.current += (on - ghost.current) * Math.min(1, dt * 3))
    ghostRef.current.visible = x > 0.02
    m.ghost.opacity = x * (0.3 + 0.4 * supply)
  })
  return (
    <>
      <group ref={ref}>
        {(LITE ? ['supply', 'drive'] : ['supply', 'drive', 'river']).map((k) => <mesh key={k} geometry={geo[k]} material={m[k]} />)}
      </group>
      {!LITE && <mesh ref={ghostRef} geometry={geo.ghost} material={m.ghost} renderOrder={2} />}
    </>
  )
}

// Electro-hydraulic pump house added in 1976, against the east wall.
export function EngineRoom({ rt, explode = [14, 6, 20], steam = true, third = true, museum = false }) {
  return (
    <>
      <Part id="engine-room" rt={rt} explode={explode} xray>
        <Shell steam={steam} />
      </Part>
      <Part id="engine-room" rt={rt} explode={explode}>
        <Machinery sim={rt.sim} steam={steam} third={third} museum={museum} />
      </Part>
      {steam && <Smoke sim={rt.sim} />}
      <Flow rt={rt} steam={steam} />
    </>
  )
}
