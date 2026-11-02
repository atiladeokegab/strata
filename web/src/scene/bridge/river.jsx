// <RiverCraft />: the era's small craft (riverSim.js), one InstancedMesh per hull type. Models are
// built bow-west (-x) at the waterline (local y 0) and coloured per vertex, so each type is one draw.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beam, box, merge } from './geom.js'
import { createRiver, stepRiver, eraForYear, CRAFT } from './riverSim.js'
import { substep } from './liftSequence.js'
import { WATER_Y } from './vessels.js'
import { LITE } from '../look/tier.js'
import { useHomeDisc, offDisc } from './homeDisc.js'

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g
  const c = new THREE.Color(hex)
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3))
  return g
}
const part = (hex, ...gs) => gs.map((g) => paint(g, hex))

// Hull in plan with a pointed bow at -x (nose metres long) and a transom at +x, extruded from y0 up h;
// the bottom is pinched (vee) so it reads as a boat, not a box.
function pointed(len, beamW, h, y0 = -0.4, nose = len * 0.35, x0 = 0) {
  const a = x0 - len / 2, b = x0 + len / 2, w = beamW / 2
  const s = new THREE.Shape()
  s.moveTo(b, -w * 0.85)
  s.lineTo(a + nose, -w)
  s.quadraticCurveTo(a + nose * 0.25, -w * 0.8, a, 0)
  s.quadraticCurveTo(a + nose * 0.25, w * 0.8, a + nose, w)
  s.lineTo(b, w * 0.85)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 })
  g.rotateX(Math.PI / 2).translate(0, y0 + h, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) if (p.getY(i) < y0 + h / 2) p.setZ(i, p.getZ(i) * 0.45)
  g.computeVertexNormals()
  return g
}
// Thames lighter in side profile: flat bottom, overhanging raked 'swim' at both ends.
function swim(len, beamW, y0, h) {
  const s = new THREE.Shape()
  s.moveTo(-len / 2 + 3, y0)
  s.lineTo(len / 2 - 3, y0)
  s.lineTo(len / 2, y0 + h)
  s.lineTo(-len / 2, y0 + h)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth: beamW, bevelEnabled: false }).translate(0, 0, -beamW / 2)
}
const ridge = (len, w, y0, h) => {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, y0)
  s.lineTo(w / 2, y0)
  s.lineTo(0, y0 + h)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-len / 2, 0, 0)
}

const MODELS = {
  lighter: () => [
    ...part('#6e3b22', swim(20, 6, -0.9, 2.2), box(16, 0.4, 4.8, 0.5, 1.45, 0)),
    ...part('#2a2622', ridge(15, 4.6, 1.6, 0.7)),
  ],
  skiff: () => [
    ...part('#a77b4f', pointed(6, 1.3, 0.75, -0.25, 2.2)),
    ...part('#5b3a22', box(0.25, 0.08, 1.15, -0.8, 0.42, 0), box(0.25, 0.08, 1.15, 1, 0.42, 0)), // thwarts
    ...part('#2b2f3a', box(0.5, 0.9, 0.5, -0.8, 0.95, 0), box(0.5, 0.9, 0.5, 1, 0.95, 0)),
    ...part('#d9c9a3', beam([-0.6, 0.9, -2.4], [-1, 0.6, 2.4], 0.05), beam([1.2, 0.9, -2.4], [0.8, 0.6, 2.4], 0.05)),
  ],
  launch: () => [
    ...part('#14213d', pointed(12, 3.6, 1.7, -0.6, 4.5)),
    ...part('#f2f2ee', box(4.2, 1.8, 3, 0.5, 2, 0)),
    ...part('#1a2430', box(4.25, 0.55, 3.05, 0.5, 2.45, 0)), // wheelhouse windows
    ...part('#ffd21f', pointed(12.1, 3.7, 0.35, 0.85, 4.5)), // yellow police band
    ...part('#2a6cff', box(0.4, 0.4, 0.4, 0.5, 3.1, 0)),
  ],
  rib: () => [
    ...part('#3b3f45', beam([4.5, 0.4, -1.1], [-2, 0.4, -1.1], 0.45, 8), beam([4.5, 0.4, 1.1], [-2, 0.4, 1.1], 0.45, 8),
      beam([-2, 0.4, -1.1], [-4.6, 0.45, 0], 0.42, 8), beam([-2, 0.4, 1.1], [-4.6, 0.45, 0], 0.42, 8)),
    ...part('#22252a', pointed(9, 2.2, 0.7, -0.4, 3), box(1, 1.2, 1, 2, 1, 0)),
    ...part('#ff6a13', ...[-2.5, -1, 0.5].flatMap((x) => [box(0.6, 0.8, 0.5, x, 1, -0.6), box(0.6, 0.8, 0.5, x, 1, 0.6)])),
  ],
  pontoon: () => [
    ...part('#8e9196', box(24, 1.2, 6, 0, 0.2, 0)),
    ...part('#e9e6dc', box(6, 2.2, 4, 4, 1.9, 0)),
    ...part('#30343a', box(24, 0.1, 0.1, 0, 1.8, -2.9), box(24, 0.1, 0.1, 0, 1.8, 2.9)),
  ],
}

const dummy = new THREE.Object3D()

function Fleet({ craft, type }) {
  const ref = useRef()
  const geo = useMemo(() => merge(MODELS[type]()), [type])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), [])
  const mine = craft.filter((c) => c.type === type)
  const disc = useHomeDisc()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mine.forEach((c, i) => {
      dummy.position.set(c.x, WATER_Y + Math.sin(t * 1.3 + i * 2) * 0.12, c.z)
      dummy.rotation.set(Math.sin(t * 0.9 + i) * 0.03, c.dir > 0 ? Math.PI : 0, 0)
      dummy.scale.setScalar(offDisc(disc, c.x, c.z, CRAFT[type].len / 2) ? 0 : 1) // off the Home plinth
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, mine.length]} castShadow frustumCulled={false} />
}

// Every craft's wake in one instanced draw: a foam streak trailing from the stern, longer with speed.
// A moored craft gets a zero-scale instance.
const WAKE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const wd = new THREE.Object3D() // its own: Fleet's dummy never resets scale
function Wakes({ craft, foam }) {
  const ref = useRef()
  const disc = useHomeDisc()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, opacity: 0.55 }), [foam])
  useFrame(() => {
    craft.forEach((c, i) => {
      const { len, beam } = CRAFT[c.type]
      let long = c.speed ? 6 + c.speed * 3.5 : 0
      if (offDisc(disc, c.x, c.z, len / 2) || offDisc(disc, c.x - c.dir * (len / 2 + long), c.z)) long = 0
      wd.position.set(c.x - c.dir * (len / 2 + long / 2 - 0.5), WATER_Y + 0.05, c.z)
      wd.rotation.set(0, c.dir > 0 ? Math.PI : 0, 0) // texture is densest at u=0: keep that end at the stern
      wd.scale.set(long || 1e-3, 1, beam * 1.5)
      wd.updateMatrix()
      ref.current.setMatrixAt(i, wd.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[WAKE, mat, craft.length]} frustumCulled={false} renderOrder={1} />
}

export function RiverCraft({ year, ship, vessel, foam }) {
  const era = eraForYear(year)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const craft = useMemo(() => createRiver(year), [era])
  const foot = useRef({ x: 0, bow: 0, stern: 0 })
  useFrame((_, dt) => {
    Object.assign(foot.current, { x: ship.x, bow: vessel.bow, stern: vessel.stern })
    substep(dt, (h) => stepRiver(craft, foot.current, h)) // clock time like the ship, so craft never lag into its hull
  })
  const types = [...new Set(craft.map((c) => c.type))]
  return (
    <>
      {types.map((t) => <Fleet key={`${era}-${t}`} craft={craft} type={t} />)}
      {foam && !LITE && <Wakes key={era} craft={craft} foam={foam} />}
    </>
  )
}
