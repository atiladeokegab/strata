// The 1894 hydraulic power house on the south bank, just east of the south abutment.
// WORLD frame (mounted at the TowerBridge root, not inside Half): x east, z south, ground y=0.
// Steam pumping engines charge a weighted accumulator; mains run along the approach to the
// south pier. The shell x-rays (Part xray) so the engines, boilers and accumulator show through.
// status: inferred layout and sizes; the building's footprint is not yet in data.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beam, box, merge, M } from './geom.js'
import { pbr } from '../look/textures.js'
import { Part } from './Part.jsx'
import { L } from './structures.jsx'
import { OPEN_TIME_S } from './hydraulics.js'

// repeat is tiles per metre on merged geometry (geom.js merge gives metre UVs)
const mat = (kind, variant, repeat, props) =>
  Object.assign(new THREE.MeshStandardMaterial({ ...pbr(variant, repeat), ...props }), { userData: { kind } })
let MATS
const mats = () =>
  (MATS ??= {
    // shortcut: brick keeps its own map so Look skips it (as stone it would read as granite); swap to a 'brick' kind once Look has one
    brick: mat('stone', 'stone:portland', 0.5, { color: '#b5654c' }),
    stone: M.stone,
    granite: M.granite,
    slate: M.slate,
    iron: M.iron,
  })

// House footprint and the machinery layout inside it.
const H = { x0: 20, x1: 44, z0: 146, z1: 166, wall: 9, t: 0.6 }
const ENGINES = [150.5, 155.5] // z of each horizontal engine's axis
const ENG_Y = 1.6, CRANK = 0.9, FLY_X = 33.5
const ACC = { x: 40.5, z: 161, base: 0.5, travel: 9 }
const CHIMNEY = { x: 41.5, z: 149, h: 32 }

function Shell() {
  const m = mats()
  const g = useMemo(() => {
    const { x0, x1, z0, z1, wall, t } = H
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0
    const brick = [
      box(w, wall, t, cx, wall / 2, z0), box(w, wall, t, cx, wall / 2, z1),
      box(t, wall, d, x0, wall / 2, cz), box(t, wall, d, x1, wall / 2, cz),
      // accumulator tower rising through the roof
      box(5, 18, 0.5, ACC.x, 9, ACC.z - 2.5), box(5, 18, 0.5, ACC.x, 9, ACC.z + 2.5),
      box(0.5, 18, 5, ACC.x - 2.5, 9, ACC.z), box(0.5, 18, 5, ACC.x + 2.5, 9, ACC.z),
      // chimney stack, tapering
      new THREE.CylinderGeometry(1.1, 1.6, CHIMNEY.h, 4).rotateY(Math.PI / 4).translate(CHIMNEY.x, CHIMNEY.h / 2, CHIMNEY.z),
    ]
    const stone = [
      box(w + 0.6, 0.5, d + 0.6, cx, 0.25, cz), // plinth course
      box(w + 0.4, 0.4, t + 0.3, cx, wall, z0), box(w + 0.4, 0.4, t + 0.3, cx, wall, z1), // cornice
      box(5.6, 0.6, 5.6, ACC.x, 18, ACC.z),
      box(2.9, 1, 2.9, CHIMNEY.x, CHIMNEY.h, CHIMNEY.z),
    ]
    // window heads along the long walls
    for (let x = x0 + 3; x < x1 - 1; x += 4) for (const z of [z0, z1]) stone.push(box(1.8, 0.35, t + 0.2, x, 6.2, z))
    const roofShape = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.6, 0), new THREE.Vector2(d / 2 + 0.6, 0), new THREE.Vector2(0, 5)])
    const roof = new THREE.ExtrudeGeometry(roofShape, { depth: w + 1, bevelEnabled: false })
      .rotateY(Math.PI / 2)
      .translate(x0 - 0.5, wall + 0.2, cz)
    const pyramid = new THREE.ConeGeometry(3.8, 3, 4).rotateY(Math.PI / 4).translate(ACC.x, 19.8, ACC.z)
    // made ground under the house, down to the river level
    const bank = box(30, 9, 26, 32, -4.5, 156)
    return {
      brick: merge(brick), stone: merge(stone), slate: merge([roof, pyramid]), granite: bank,
      glass: merge(Array.from({ length: 5 }, (_, i) => [box(1.6, 3.6, t + 0.1, x0 + 3 + i * 4, 4.2, z0), box(1.6, 3.6, t + 0.1, x0 + 3 + i * 4, 4.2, z1)]).flat()),
    }
  }, [])
  return (
    <>
      <mesh geometry={g.brick} material={m.brick} castShadow receiveShadow />
      <mesh geometry={g.stone} material={m.stone} castShadow />
      <mesh geometry={g.slate} material={m.slate} castShadow />
      <mesh geometry={g.granite} material={m.granite} receiveShadow />
      <mesh geometry={g.glass} material={M.glass} />
    </>
  )
}

const UNIT_ROD = new THREE.CylinderGeometry(0.12, 0.12, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0)

function Machinery({ sim, steam }) {
  const m = mats()
  const fly = useRef([]), cross = useRef([]), rod = useRef([]), ram = useRef()
  const crank = useRef(0)
  const fixed = useMemo(() => {
    const iron = [], boiler = []
    for (const z of ENGINES) {
      iron.push(new THREE.CylinderGeometry(0.9, 0.9, 3, 14).rotateZ(Math.PI / 2).translate(24.5, ENG_Y, z)) // steam cylinder
      iron.push(box(10, 0.8, 1.6, 28.5, 0.6, z)) // bed plate
      iron.push(beam([26, ENG_Y + 0.5, z], [31, ENG_Y + 0.5, z], 0.08), beam([26, ENG_Y - 0.5, z], [31, ENG_Y - 0.5, z], 0.08)) // guides
      iron.push(box(0.8, 2.2, 0.8, FLY_X, 1.1, z - 1.3), box(0.8, 2.2, 0.8, FLY_X, 1.1, z + 1.3)) // plummer blocks
      iron.push(new THREE.CylinderGeometry(0.4, 0.4, 2.6, 10).rotateX(Math.PI / 2).translate(37, ENG_Y, z)) // pump barrel
    }
    // two Lancashire boilers, brick-set
    for (const z of [160, 163.6]) boiler.push(new THREE.CylinderGeometry(1.4, 1.4, 11, 18).rotateZ(Math.PI / 2).translate(28, 1.9, z))
    iron.push(new THREE.CylinderGeometry(0.7, 0.7, 2 + ACC.travel, 14).translate(ACC.x, ACC.base + (2 + ACC.travel) / 2, ACC.z)) // ram
    // hydraulic mains: house to the south pier along the approach (two pipes)
    for (const x of [6.4, 7.4])
      iron.push(
        beam([H.x0, 0.6, 151], [x, 0.6, 151], 0.22), beam([x, 0.6, 151], [x, -2, 146], 0.22), beam([x, -2, 146], [x, -2, 56], 0.22, 8),
      )
    iron.push(beam([37, 0.6, ENGINES[0]], [37, 0.6, 151], 0.18), beam([37, 0.6, ENGINES[1]], [38, 0.6, ACC.z], 0.18))
    return { iron: merge(iron), boiler: merge(boiler) }
  }, [])
  const wheel = useMemo(() => {
    const gs = [new THREE.TorusGeometry(2.6, 0.22, 8, 32), new THREE.CylinderGeometry(0.35, 0.35, 3, 10).rotateX(Math.PI / 2)]
    for (let i = 0; i < 6; i++) gs.push(box(0.16, 5.2, 0.16).rotateZ((i * Math.PI) / 6))
    gs.push(box(0.3, CRANK + 0.3, 0.3, 0, CRANK / 2, 1.4)) // crank web on the near face
    return merge(gs)
  }, [])

  useFrame((_, dt) => {
    if (steam && sim.pumping) crank.current += Math.min(dt, 0.1) * 3
    ENGINES.forEach((z, i) => {
      const a = crank.current + i * Math.PI / 2 // cranks quartered
      fly.current[i].rotation.z = a
      const px = FLY_X - CRANK * Math.sin(a), py = ENG_Y + CRANK * Math.cos(a)
      const cx = px - 3.6 // crosshead follows the crank's x throw (rod ~3.6 m)
      cross.current[i].position.x = cx
      const r = rod.current[i]
      r.position.set(cx, ENG_Y, z + 1.4)
      r.scale.x = Math.hypot(px - cx, py - ENG_Y)
      r.rotation.z = Math.atan2(py - ENG_Y, px - cx)
    })
    ram.current.position.y = ACC.base + 3 + sim.stored * ACC.travel
  })

  return (
    <>
      <mesh geometry={fixed.iron} material={m.iron} castShadow />
      <mesh geometry={fixed.boiler} material={M.iron} castShadow />
      {ENGINES.map((z, i) => (
        <group key={z}>
          <mesh ref={(o) => (fly.current[i] = o)} geometry={wheel} material={M.iron} position={[FLY_X, ENG_Y, z]} castShadow />
          <mesh ref={(o) => (cross.current[i] = o)} position={[29, ENG_Y, z]} material={M.brass}>
            <boxGeometry args={[0.8, 1, 1]} />
          </mesh>
          <mesh ref={(o) => (rod.current[i] = o)} geometry={UNIT_ROD} material={M.brass} />
        </group>
      ))}
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
  const feed = [[37, 0.6, ENGINES[0]], [37, 0.6, 151], [7.4, 0.6, 151], [7.4, -2, 146], [7.4, -2, 56], [7.4, -10, southHdr[2]], southHdr]
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
    () => ({ supply: merge(PATHS.supply.map((p) => tube(p, 0.26))), drive: merge(PATHS.drive.map((p) => tube(p, 0.26))), river: tube(PATHS.river, 0.3), ghost: tube(GHOST, 0.35) }),
    [],
  )
  useFrame((_, dt) => {
    ref.current.visible = rt.explode.current < 0.05 // the mains don't follow exploded parts
    const drive = Math.min(1, Math.abs(sim.omega) / OMEGA_MAX)
    const supply = Math.min(1, drive + (sim.pumping ? 0.35 : 0))
    for (const [k, base] of MAINS) {
      const mat = m[k]
      const level = k === 'drive' ? drive : supply
      mat.emissiveIntensity = base + level * 2.5
      mat.emissiveMap.offset.x -= level * 1.2 * Math.min(dt, 0.1) // dashes run start -> end of each path
    }
    const on = Math.max(rt.explode.current, rt.fades.current.includes('pier-north') ? 1 : 0)
    const x = (ghost.current += (on - ghost.current) * Math.min(1, dt * 3))
    ghostRef.current.visible = x > 0.02
    m.ghost.opacity = x * (0.3 + 0.4 * supply)
  })
  return (
    <>
      <group ref={ref}>
        {['supply', 'drive', 'river'].map((k) => <mesh key={k} geometry={geo[k]} material={m[k]} />)}
      </group>
      <mesh ref={ghostRef} geometry={geo.ghost} material={m.ghost} renderOrder={2} />
    </>
  )
}

// Electro-hydraulic pump house added in 1976, against the east wall.
function PumpHouse() {
  const m = mats()
  const g = useMemo(() => ({ brick: box(3, 3.2, 5, H.x1 + 1.8, 1.6, 153), slate: box(3.6, 0.4, 5.6, H.x1 + 1.8, 3.4, 153), iron: box(0.4, 1.6, 1, H.x1 + 3.4, 1.6, 153) }), [])
  return Object.entries(g).map(([k, geo]) => <mesh key={k} geometry={geo} material={m[k]} castShadow />)
}

export function EngineRoom({ rt, explode = [14, 6, 20], steam = true }) {
  return (
    <>
      <Part id="engine-room" rt={rt} explode={explode} xray>
        <Shell />
        {!steam && <PumpHouse />}
      </Part>
      <Part id="engine-room" rt={rt} explode={explode}>
        <Machinery sim={rt.sim} steam={steam} />
      </Part>
      {steam && <Smoke sim={rt.sim} />}
      <Flow rt={rt} steam={steam} />
    </>
  )
}
